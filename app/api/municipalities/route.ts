import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'
import { CacheManager } from '../../../lib/cache'
import { z } from 'zod'

// Validation schemas
const getMunicipalitiesQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform(val => val ? Math.min(parseInt(val, 10), 100) : undefined),
  search: z.string().optional(),
  status: z.enum(['pending', 'testing', 'confirmed', 'active', 'error', 'running']).optional(),
  hasDocuments: z.string().optional().transform(val => val === 'true'),
  scheduledOnly: z.string().optional().transform(val => val === 'true'),
  sort: z.enum(['name', 'created_at', 'updated_at', 'last_run']).optional().default('name'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
})

const createMunicipalitySchema = z.object({
  name: z.string().min(1).max(255),
  website_url: z.string().url(),
  scraper_name: z.string().max(100).nullable().optional(),
  schedule_frequency: z.enum(['weekly', 'monthly', 'quarterly']).nullable().optional(),
  schedule_active: z.boolean().optional().default(false),
})

const updateMunicipalitySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  website_url: z.string().url().optional(),
  status: z.enum(['pending', 'testing', 'confirmed', 'active', 'error', 'running']).optional(),
  scraper_name: z.string().max(100).nullable().optional(),
  schedule_frequency: z.enum(['weekly', 'monthly', 'quarterly']).nullable().optional(),
  schedule_active: z.boolean().optional(),
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
    const status = url.searchParams.get('status')
    const hasDocuments = url.searchParams.get('hasDocuments') === 'true'
    const scheduledOnly = url.searchParams.get('scheduledOnly') === 'true'
    const sortBy = url.searchParams.get('sort') || 'name'
    const sortOrder = url.searchParams.get('order') || 'asc'

    // Debug logging
    console.log('API Request params:', { page, limitParam, limit, search, status, hasDocuments, scheduledOnly, sortBy, sortOrder })

    // Create cache key based on parameters
    const cacheKey = `municipalities:list:${page}:${limit}:${search || ''}:${status || ''}:${hasDocuments}:${scheduledOnly}:${sortBy}:${sortOrder}`
    
    // Temporarily disable cache to debug
    // const cachedResult = await CacheManager.get(cacheKey)
    // if (cachedResult) {
    //   return NextResponse.json(cachedResult)
    // }

    // Build query with row-level security
    let query = supabase
      .from('municipalities')
      .select(`
        *,
        pdf_documents(count),
        scrape_logs(
          id,
          scrape_date,
          status,
          documents_found
        )
      `, { count: 'exact' })

    // Apply filters
    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (scheduledOnly) {
      query = query.not('schedule_frequency', 'is', null)
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
      limit, 
      appliedPagination: !!limit 
    })

    if (error) {
      console.error('Database error fetching municipalities:', error)
      return NextResponse.json(
        { error: 'Failed to fetch municipalities' },
        { status: 500 }
      )
    }

    // Enhance data with statistics
    const enhancedMunicipalities = municipalities?.map(municipality => {
      const documentCount = municipality.pdf_documents?.[0]?.count || 0
      const lastScrape = municipality.scrape_logs?.[0] || null

      return {
        ...municipality,
        totalDocuments: documentCount,
        lastScrape: lastScrape ? {
          date: lastScrape.scrape_date,
          status: lastScrape.status,
          documentsFound: lastScrape.documents_found
        } : null,
        // Remove the nested data to clean up response
        pdf_documents: undefined,
        scrape_logs: undefined
      }
    }) || []

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

    // Cache the result
    await CacheManager.set(cacheKey, result, 300000) // 5 minutes

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
      website_url: validatedData.website_url,
      scraper_name: validatedData.scraper_name || null,
      status: 'pending' as const,
      schedule_frequency: validatedData.schedule_frequency || null,
      schedule_active: validatedData.schedule_active || false
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
        { error: 'Failed to create municipality' },
        { status: 500 }
      )
    }

    // Invalidate relevant caches
    await CacheManager.delPattern('municipalities:list:*')
    await CacheManager.delPattern('dashboard:*')

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

    // If changing scraper assignment, validate it exists (optional validation)
    if (validatedData.scraper_name && validatedData.scraper_name !== existingMunicipality.scraper_name) {
      // Note: We don't strictly validate scraper existence since filesystem scrapers
      // might not be in the database yet. This allows flexible assignment.
      console.log(`Assigning scraper '${validatedData.scraper_name}' to municipality '${existingMunicipality.name}'`)
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

    // Invalidate relevant caches
    await CacheManager.delPattern('municipalities:list:*')
    await CacheManager.delPattern('dashboard:*')

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