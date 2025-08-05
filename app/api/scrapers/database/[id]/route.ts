import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase'
import { z } from 'zod'
import type { 
  Scraper,
  ScraperUpdate,
  ScraperValidationStatus,
  ScraperId,
  SuccessResponse,
  ErrorResponse,
  ScraperRow
} from '@/types/database'
import { createScraperId, createMunicipalityId } from '@/types/database'

// Validation schema for scraper updates
const scraperUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  status: z.enum(['pending', 'testing', 'validated', 'failed']).optional(),
  municipality_id: z.number().int().positive().optional(),
  module_name: z.string().min(1).optional(),
  class_name: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
  estimated_pages: z.number().int().positive().optional(),
  estimated_pdfs: z.number().int().positive().optional(),
  priority: z.number().int().min(0).max(10).optional(),
  test_notes: z.string().optional(),
  success_rate: z.number().min(0).max(100).optional(),
  last_tested: z.string().datetime().optional()
})

// Helper function to get status icon
function getStatusIcon(status: ScraperValidationStatus): string {
  switch (status) {
    case 'validated': return '✅'
    case 'testing': return '🔄'
    case 'failed': return '❌'
    case 'pending': return '⏳'
    default: return '❓'
  }
}

// Helper function to calculate duration since test
function calculateDurationSinceTest(lastTested: string): number {
  return Math.floor((Date.now() - new Date(lastTested).getTime()) / 1000 / 60 / 60 / 24) // days
}

// Helper function to fetch scraper with municipality data
async function fetchScraperById(scraperId: ScraperId) {
  const { data: scraper, error } = await supabase
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
      municipalities (
        id,
        name,
        website_url,
        status
      )
    `)
    .eq('id', scraperId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch scraper: ${error.message}`)
  }

  // Transform to enhanced scraper
  const { municipalities, ...scraperData } = scraper
  const municipalityData = Array.isArray(municipalities) ? municipalities[0] : municipalities
  const enhancedScraper: Scraper = {
    ...scraperData,
    municipality: municipalityData ? {
      id: municipalityData.id,
      name: municipalityData.name
    } : undefined,
    municipality_name: municipalityData?.name,
    isValidated: scraperData.status === 'validated',
    isActiveAndValidated: scraperData.is_active && scraperData.status === 'validated',
    statusIcon: getStatusIcon(scraperData.status),
    lastTestDuration: scraperData.last_tested ? 
      calculateDurationSinceTest(scraperData.last_tested) : undefined
  }

  return enhancedScraper
}

// GET /api/scrapers/database/[id] - Get individual scraper from database
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const scraperId = createScraperId(parseInt(id))
  
  try {
    
    if (isNaN(scraperId) || scraperId <= 0) {
      return NextResponse.json(
        { 
          error: 'Invalid scraper ID',
          message: 'Scraper ID must be a positive integer',
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 400 }
      )
    }

    const scraper = await fetchScraperById(scraperId)

    return NextResponse.json({
      data: scraper,
      message: 'Scraper retrieved successfully',
      timestamp: new Date().toISOString()
    } satisfies SuccessResponse<Scraper>)

  } catch (error) {
    console.error('Error in GET /api/scrapers/database/[id]:', error)
    
    if (error instanceof Error && error.message.includes('Failed to fetch scraper')) {
      return NextResponse.json(
        { 
          error: 'Scraper not found',
          message: `No scraper found with ID: ${scraperId}`,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 404 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Failed to retrieve scraper',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      } satisfies ErrorResponse,
      { status: 500 }
    )
  }
}

// PATCH /api/scrapers/database/[id] - Update scraper status and metadata
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const scraperId = createScraperId(parseInt(id))
  
  try {
    
    if (isNaN(scraperId) || scraperId <= 0) {
      return NextResponse.json(
        { 
          error: 'Invalid scraper ID',
          message: 'Scraper ID must be a positive integer',
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 400 }
      )
    }

    const body = await request.json()
    
    const validation = scraperUpdateSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid update data',
          details: validation.error.format(),
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 400 }
      )
    }

    const updateData = validation.data

    // Check if scraper exists first
    try {
      await fetchScraperById(scraperId)
    } catch (error) {
      return NextResponse.json(
        { 
          error: 'Scraper not found',
          message: `No scraper found with ID: ${scraperId}`,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 404 }
      )
    }

    // If municipality_id is being updated, verify the new municipality exists
    if (updateData.municipality_id) {
      const { data: municipality, error: municipalityError } = await supabase
        .from('municipalities')
        .select('id, name')
        .eq('id', updateData.municipality_id)
        .single()

      if (municipalityError || !municipality) {
        return NextResponse.json(
          { 
            error: 'Municipality not found',
            message: `No municipality found with ID: ${updateData.municipality_id}`,
            timestamp: new Date().toISOString()
          } satisfies ErrorResponse,
          { status: 404 }
        )
      }
    }

    // Prepare update data with timestamp
    const finalUpdateData: any = {
      ...updateData,
      updated_at: new Date().toISOString(),
      // Update last_tested when status changes to validated or failed
      ...(updateData.status && ['validated', 'failed'].includes(updateData.status) && {
        last_tested: updateData.last_tested || new Date().toISOString()
      })
    }

    // Cast municipality_id to the branded type if provided
    if (updateData.municipality_id) {
      finalUpdateData.municipality_id = updateData.municipality_id as any
    }

    // Update the scraper
    const { data: updatedScraper, error: updateError } = await supabase
      .from('scrapers')
      .update(finalUpdateData)
      .eq('id', scraperId)
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
        municipalities (
          id,
          name,
          website_url,
          status
        )
      `)
      .single()

    if (updateError) {
      console.error('Database error updating scraper:', updateError)
      return NextResponse.json(
        { 
          error: 'Failed to update scraper',
          message: updateError.message,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 500 }
      )
    }

    // Transform response data
    const { municipalities, ...updatedScraperData } = updatedScraper
    const municipalityData = Array.isArray(municipalities) ? municipalities[0] : municipalities
    const enhancedScraper: Scraper = {
      ...updatedScraperData,
      municipality: municipalityData ? {
        id: municipalityData.id,
        name: municipalityData.name
      } : undefined,
      municipality_name: municipalityData?.name,
      isValidated: updatedScraperData.status === 'validated',
      isActiveAndValidated: updatedScraperData.is_active && updatedScraperData.status === 'validated',
      statusIcon: getStatusIcon(updatedScraperData.status),
      lastTestDuration: updatedScraperData.last_tested ? 
        calculateDurationSinceTest(updatedScraperData.last_tested) : undefined
    }

    // If status was updated to validated or failed, create a scrape log entry
    if (updateData.status && ['validated', 'failed'].includes(updateData.status)) {
      await supabase
        .from('scrape_logs')
        .insert({
          municipality_id: updatedScraper.municipality_id,
          status: updateData.status === 'validated' ? 'success' : 'error',
          documents_found: 0, // Status update, not actual scrape
          documents_new: 0,
          error_message: updateData.status === 'failed' ? updateData.test_notes || 'Manual status update to failed' : null,
          scrape_date: new Date().toISOString()
        })
    }

    return NextResponse.json({
      data: enhancedScraper,
      message: `Scraper '${updatedScraper.name}' updated successfully`,
      timestamp: new Date().toISOString()
    } satisfies SuccessResponse<Scraper>)

  } catch (error) {
    console.error('Unexpected error in PATCH /api/scrapers/database/[id]:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update scraper',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      } satisfies ErrorResponse,
      { status: 500 }
    )
  }
}

// DELETE /api/scrapers/database/[id] - Remove scraper from database
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const scraperId = createScraperId(parseInt(id))
  
  try {
    
    if (isNaN(scraperId) || scraperId <= 0) {
      return NextResponse.json(
        { 
          error: 'Invalid scraper ID',
          message: 'Scraper ID must be a positive integer',
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 400 }
      )
    }

    // Check if scraper exists and get its details first
    let scraper: Scraper
    try {
      scraper = await fetchScraperById(scraperId)
    } catch (error) {
      return NextResponse.json(
        { 
          error: 'Scraper not found',
          message: `No scraper found with ID: ${scraperId}`,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 404 }
      )
    }

    // Delete the scraper
    const { error: deleteError } = await supabase
      .from('scrapers')
      .delete()
      .eq('id', scraperId)

    if (deleteError) {
      console.error('Database error deleting scraper:', deleteError)
      return NextResponse.json(
        { 
          error: 'Failed to delete scraper',
          message: deleteError.message,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 500 }
      )
    }

    // Create a scrape log entry to track the deletion
    await supabase
      .from('scrape_logs')
      .insert({
        municipality_id: scraper.municipality_id,
        status: 'error',
        documents_found: 0,
        documents_new: 0,
        error_message: `Scraper '${scraper.name}' was deleted from the system`,
        scrape_date: new Date().toISOString()
      })

    return NextResponse.json({
      data: {
        id: scraperId,
        name: scraper.name,
        municipality_name: scraper.municipality_name,
        deleted_at: new Date().toISOString()
      },
      message: `Scraper '${scraper.name}' deleted successfully`,
      timestamp: new Date().toISOString()
    } satisfies SuccessResponse<{
      id: ScraperId;
      name: string;
      municipality_name?: string;
      deleted_at: string;
    }>)

  } catch (error) {
    console.error('Unexpected error in DELETE /api/scrapers/database/[id]:', error)
    return NextResponse.json(
      { 
        error: 'Failed to delete scraper',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      } satisfies ErrorResponse,
      { status: 500 }
    )
  }
}