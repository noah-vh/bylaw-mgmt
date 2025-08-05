import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'
import { z } from 'zod'
import type { 
  Scraper,
  ScraperInsert,
  ScraperValidationStatus,
  MunicipalityId,
  ScraperId,
  SuccessResponse,
  ErrorResponse
} from '@/types/database'

// Validation schema for new scraper
const scraperInsertSchema = z.object({
  name: z.string().min(1, 'Scraper name is required'),
  version: z.string().min(1, 'Version is required'),
  municipality_id: z.number().int().positive('Invalid municipality ID'),
  module_name: z.string().min(1, 'Module name is required'),
  class_name: z.string().min(1, 'Class name is required'),
  status: z.enum(['pending', 'testing', 'validated', 'failed']).optional().default('pending'),
  is_active: z.boolean().optional().default(true),
  estimated_pages: z.number().int().positive().optional(),
  estimated_pdfs: z.number().int().positive().optional(),
  priority: z.number().int().min(0).max(10).optional().default(5),
  test_notes: z.string().optional()
})

// Query parameters schema
const queryParamsSchema = z.object({
  municipality_id: z.string().transform(val => parseInt(val)).optional(),
  status: z.enum(['pending', 'testing', 'validated', 'failed']).optional(),
  is_active: z.string().transform(val => val === 'true').optional(),
  limit: z.string().transform(val => parseInt(val)).optional(),
  offset: z.string().transform(val => parseInt(val)).optional()
})

// GET /api/scrapers/database - Fetch scrapers from database
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const params = Object.fromEntries(searchParams.entries())
    
    const validation = queryParamsSchema.safeParse(params)
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid query parameters',
          details: validation.error.format(),
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 400 }
      )
    }

    const { municipality_id, status, is_active, limit = 50, offset = 0 } = validation.data

    // Build query
    let query = supabase
      .from('scrapers')
      .select(`
        id,
        name,
        version,
        status,
        municipality_id,
        module_name,
        class_name,
        created_at,
        updated_at,
        last_tested,
        success_rate,
        test_notes,
        is_active,
        estimated_pages,
        estimated_pdfs,
        priority,
        municipalities!scrapers_municipality_id_fkey (
          id,
          name,
          website_url,
          status as municipality_status
        )
      `)
      .order('priority', { ascending: false })
      .order('name', { ascending: true })

    // Apply filters
    if (municipality_id !== undefined) {
      query = query.eq('municipality_id', municipality_id)
    }
    if (status !== undefined) {
      query = query.eq('status', status)
    }
    if (is_active !== undefined) {
      query = query.eq('is_active', is_active)
    }

    // Apply pagination
    if (limit > 0) {
      query = query.range(offset, offset + limit - 1)
    }

    const { data: scrapers, error, count } = await query

    if (error) {
      console.error('Database error fetching scrapers:', error)
      return NextResponse.json(
        { 
          error: 'Failed to fetch scrapers from database',
          message: error.message,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 500 }
      )
    }

    // Transform data to include computed fields
    const enhancedScrapers: Scraper[] = (scrapers || []).map(scraper => ({
      ...scraper,
      municipality: scraper.municipalities ? {
        id: scraper.municipalities.id,
        name: scraper.municipalities.name
      } : undefined,
      municipality_name: scraper.municipalities?.name,
      isValidated: scraper.status === 'validated',
      isActiveAndValidated: scraper.is_active && scraper.status === 'validated',
      statusIcon: getStatusIcon(scraper.status),
      lastTestDuration: scraper.last_tested ? 
        calculateDurationSinceTest(scraper.last_tested) : undefined
    }))

    // Calculate summary statistics
    const stats = {
      total: enhancedScrapers.length,
      validated: enhancedScrapers.filter(s => s.status === 'validated').length,
      pending: enhancedScrapers.filter(s => s.status === 'pending').length,
      testing: enhancedScrapers.filter(s => s.status === 'testing').length,
      failed: enhancedScrapers.filter(s => s.status === 'failed').length,
      active: enhancedScrapers.filter(s => s.is_active).length,
      averageSuccessRate: enhancedScrapers.length > 0 
        ? Math.round(enhancedScrapers.reduce((sum, s) => sum + (s.success_rate || 0), 0) / enhancedScrapers.length)
        : 0
    }

    return NextResponse.json({
      data: enhancedScrapers,
      stats,
      pagination: {
        limit,
        offset,
        total: count || enhancedScrapers.length
      },
      message: 'Scrapers retrieved successfully from database',
      timestamp: new Date().toISOString()
    } satisfies SuccessResponse<Scraper[]>)

  } catch (error) {
    console.error('Unexpected error in GET /api/scrapers/database:', error)
    return NextResponse.json(
      { 
        error: 'Failed to retrieve scrapers from database',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      } satisfies ErrorResponse,
      { status: 500 }
    )
  }
}

// POST /api/scrapers/database - Add new scraper to database
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const validation = scraperInsertSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid scraper data',
          details: validation.error.format(),
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 400 }
      )
    }

    const scraperData = validation.data

    // Check if municipality exists
    const { data: municipality, error: municipalityError } = await supabase
      .from('municipalities')
      .select('id, name')
      .eq('id', scraperData.municipality_id)
      .single()

    if (municipalityError || !municipality) {
      return NextResponse.json(
        { 
          error: 'Municipality not found',
          message: `No municipality found with ID: ${scraperData.municipality_id}`,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 404 }
      )
    }

    // Check for duplicate scraper name within the municipality
    const { data: existingScraper, error: duplicateCheckError } = await supabase
      .from('scrapers')
      .select('id, name')
      .eq('name', scraperData.name)
      .eq('municipality_id', scraperData.municipality_id)
      .maybeSingle()

    if (duplicateCheckError) {
      console.error('Error checking for duplicate scraper:', duplicateCheckError)
      return NextResponse.json(
        { 
          error: 'Failed to check for duplicate scraper',
          message: duplicateCheckError.message,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 500 }
      )
    }

    if (existingScraper) {
      return NextResponse.json(
        { 
          error: 'Scraper already exists',
          message: `A scraper named '${scraperData.name}' already exists for this municipality`,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 409 }
      )
    }

    // Insert new scraper
    const { data: newScraper, error: insertError } = await supabase
      .from('scrapers')
      .insert({
        ...scraperData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } satisfies ScraperInsert)
      .select(`
        id,
        name,
        version,
        status,
        municipality_id,
        module_name,
        class_name,
        created_at,
        updated_at,
        last_tested,
        success_rate,
        test_notes,
        is_active,
        estimated_pages,
        estimated_pdfs,
        priority,
        municipalities!scrapers_municipality_id_fkey (
          id,
          name,
          website_url,
          status as municipality_status
        )
      `)
      .single()

    if (insertError) {
      console.error('Database error inserting scraper:', insertError)
      return NextResponse.json(
        { 
          error: 'Failed to create scraper',
          message: insertError.message,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 500 }
      )
    }

    // Transform response data
    const enhancedScraper: Scraper = {
      ...newScraper,
      municipality: newScraper.municipalities ? {
        id: newScraper.municipalities.id,
        name: newScraper.municipalities.name
      } : undefined,
      municipality_name: newScraper.municipalities?.name,
      isValidated: newScraper.status === 'validated',
      isActiveAndValidated: newScraper.is_active && newScraper.status === 'validated',
      statusIcon: getStatusIcon(newScraper.status),
      lastTestDuration: undefined
    }

    return NextResponse.json(
      {
        data: enhancedScraper,
        message: `Scraper '${newScraper.name}' created successfully for ${municipality.name}`,
        timestamp: new Date().toISOString()
      } satisfies SuccessResponse<Scraper>,
      { status: 201 }
    )

  } catch (error) {
    console.error('Unexpected error in POST /api/scrapers/database:', error)
    return NextResponse.json(
      { 
        error: 'Failed to create scraper',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      } satisfies ErrorResponse,
      { status: 500 }
    )
  }
}

// Helper functions
function getStatusIcon(status: ScraperValidationStatus): string {
  switch (status) {
    case 'validated': return '✅'
    case 'testing': return '🔄'
    case 'failed': return '❌'
    case 'pending': return '⏳'
    default: return '❓'
  }
}

function calculateDurationSinceTest(lastTested: string): number {
  return Math.floor((Date.now() - new Date(lastTested).getTime()) / 1000 / 60 / 60 / 24) // days
}