import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'
// Cache removed - direct database access only
import { z } from 'zod'

// Validation schemas
const getMunicipalitiesQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform(val => val ? Math.min(parseInt(val, 10), 100) : undefined),
  search: z.string().optional(),
  hasDocuments: z.string().optional().transform(val => val === 'true'),
  sort: z.enum(['name', 'created_at', 'updated_at']).optional().default('name'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
})

const createMunicipalitySchema = z.object({
  name: z.string().min(1).max(255),
  website_url: z.string().url()
})

const updateMunicipalitySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  website_url: z.string().url().optional()
})

// GET /api/municipalities - List municipalities with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    // Simple query parameter parsing
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '1', 10)
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : null // null means no limit (show all)
    const search = url.searchParams.get('search')
    const hasDocuments = url.searchParams.get('hasDocuments') === 'true'
    const sortBy = url.searchParams.get('sort') || 'name'
    const sortOrder = url.searchParams.get('order') || 'asc'
    const source = url.searchParams.get('source') || 'client' // Default to client

    // Build query with row-level security - include bylaw data
    let query = supabase
      .from('municipalities')
      .select(`
        *,
        municipality_bylaw_data (
          id,
          bylaw_ordinance_number,
          effective_date,
          additional_notes
        )
      `, { count: 'exact' })

    // Apply filters
    if (search) {
      query = query.ilike('name', `%${search}%`)
    }


    // Apply sorting (validation already ensures valid sortBy)
    query = query.order(sortBy, { ascending: sortOrder === 'asc' })

    // Apply pagination (only if limit is specified)
    if (limit) {
      const offset = (page - 1) * limit
      query = query.range(offset, offset + limit - 1)
    }

    const { data: municipalities, error, count } = await query

    console.log('Query result:', { 
      municipalitiesCount: municipalities?.length, 
      totalCount: count, 
      error: error?.message,
      firstMunicipality: municipalities?.[0]
    })

    if (error) {
      console.error('Database error fetching municipalities:', error)
      return NextResponse.json(
        { error: 'Failed to fetch municipalities', details: error.message },
        { status: 500 }
      )
    }

    // Get document counts for all municipalities in a single query
    const municipalityIds = municipalities.map(m => m.id)
    let documentCounts: Record<number, number> = {}
    
    if (municipalityIds.length > 0) {
      // Use RPC or raw SQL for proper aggregation to avoid row limits
      const { data: counts, error: countError } = await supabase
        .rpc('get_document_counts_by_municipality_and_source', {
          municipality_ids: municipalityIds,
          source_filter: source
        })
      
      if (countError) {
        console.error('Error fetching document counts via RPC:', countError.message, countError.details, countError.hint)
        // Fallback: Get counts for each municipality using parallel queries with head: true
        console.log('Using fallback: parallel count queries for', municipalityIds.length, 'municipalities')
        
        const countPromises = municipalityIds.map(async (muniId) => {
          let countQuery = supabase
            .from('pdf_documents')
            .select('*', { count: 'exact', head: true })
            .eq('municipality_id', muniId)
          
          // Apply source filter if not 'all'
          if (source && source !== 'all') {
            countQuery = countQuery.eq('document_source', source)
          }
          
          const { count, error } = await countQuery
          
          if (error) {
            console.error(`Error counting docs for municipality ${muniId}:`, error.message)
            return { municipality_id: muniId, count: 0 }
          }
          
          return { municipality_id: muniId, count: count || 0 }
        })
        
        const countResults = await Promise.all(countPromises)
        
        documentCounts = countResults.reduce((acc, item) => {
          acc[item.municipality_id] = item.count
          return acc
        }, {} as Record<number, number>)
        
        console.log('Document counts from parallel queries:', documentCounts)
      } else if (counts) {
        // Convert RPC result to our format
        console.log('RPC succeeded, processing counts:', counts.length, 'results')
        documentCounts = counts.reduce((acc: Record<number, number>, item: any) => {
          acc[item.municipality_id] = item.document_count
          return acc
        }, {})
        console.log('Document counts from RPC:', documentCounts)
      } else {
        console.log('No counts returned from RPC but no error either')
      }
    }
    
    // Enhance municipalities with document counts
    const enhancedMunicipalities = municipalities.map(municipality => ({
      ...municipality,
      totalDocuments: documentCounts[municipality.id] || 0
    }))

    // Filter by document count if requested
    const filteredMunicipalities = hasDocuments
      ? enhancedMunicipalities.filter(m => m.totalDocuments > 0)
      : enhancedMunicipalities

    const result = {
      data: filteredMunicipalities,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: limit ? Math.ceil((count || 0) / limit) : 1,
        hasNextPage: limit ? ((page - 1) * limit + (limit || 0)) < (count || 0) : false,
        hasPrevPage: page > 1 && !!limit
      }
    }


    return NextResponse.json(result)

  } catch (error) {
    console.error('Unexpected error in GET /api/municipalities:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/municipalities - Create new municipality
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const body = await request.json()
    
    const validation = createMunicipalitySchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid municipality data',
          details: validation.error.format()
        },
        { status: 400 }
      )
    }

    const validatedData = validation.data

    const municipalityData = {
      name: validatedData.name,
      website_url: validatedData.website_url
    }

    // Check for duplicate names (case-insensitive)
    const { data: existing } = await supabase
      .from('municipalities')
      .select('id')
      .ilike('name', municipalityData.name)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'Municipality with this name already exists' },
        { status: 409 }
      )
    }

    // Create municipality using regular client
    const client = supabase
    const { data: municipality, error } = await client
      .from('municipalities')
      .insert(municipalityData)
      .select()
      .single()

    if (error) {
      console.error('Database error creating municipality:', error)
      return NextResponse.json(
        {
          error: 'Failed to create municipality',
          details: error.message,
          code: error.code
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { data: municipality, message: 'Municipality created successfully' },
      { status: 201 }
    )

  } catch (error) {
    console.error('Unexpected error in POST /api/municipalities:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/municipalities - Update municipality (including scraper assignment)
export async function PATCH(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const municipalityId = url.searchParams.get('id')
    
    if (!municipalityId) {
      return NextResponse.json(
        { error: 'Municipality ID is required' },
        { status: 400 }
      )
    }
    
    const body = await request.json()
    
    const validation = updateMunicipalitySchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid municipality data',
          details: validation.error.format()
        },
        { status: 400 }
      )
    }

    const validatedData = validation.data

    // Check if municipality exists
    const { data: existingMunicipality, error: fetchError } = await supabase
      .from('municipalities')
      .select('id, name, scraper_name')
      .eq('id', parseInt(municipalityId))
      .single()

    if (fetchError || !existingMunicipality) {
      return NextResponse.json(
        { error: 'Municipality not found' },
        { status: 404 }
      )
    }


    // Prepare update data
    const updateData = {
      ...validatedData,
      updated_at: new Date().toISOString()
    }

    // Update municipality
    const { data: updatedMunicipality, error: updateError } = await supabase
      .from('municipalities')
      .update(updateData)
      .eq('id', parseInt(municipalityId))
      .select(`
        *,
        scrapers(
          id,
          name,
          version,
          status,
          success_rate,
          last_tested
        )
      `)
      .single()

    if (updateError) {
      console.error('Database error updating municipality:', updateError)
      return NextResponse.json(
        { 
          error: 'Failed to update municipality',
          message: updateError.message
        },
        { status: 500 }
      )
    }

    // Enhanced response with scraper information
    const scraperInfo = updatedMunicipality.scrapers?.[0] || null
    const responseData = {
      ...updatedMunicipality,
      scraper: scraperInfo ? {
        id: scraperInfo.id,
        name: scraperInfo.name,
        version: scraperInfo.version,
        status: scraperInfo.status,
        successRate: scraperInfo.success_rate,
        lastTested: scraperInfo.last_tested
      } : null,
      scraperAssigned: !!updatedMunicipality.scraper_name,
      scraperRegistered: !!scraperInfo,
      scrapers: undefined // Clean up nested data
    }

    return NextResponse.json(
      { 
        data: responseData, 
        message: 'Municipality updated successfully',
        changes: Object.keys(validatedData)
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Unexpected error in PATCH /api/municipalities:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}