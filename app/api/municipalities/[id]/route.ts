import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'
// Cache removed - direct database access only

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/municipalities/[id] - Get municipality details with documents and stats
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const municipalityId = parseInt(id)
    
    if (isNaN(municipalityId)) {
      return NextResponse.json(
        { error: 'Invalid municipality ID' },
        { status: 400 }
      )
    }


    // Get municipality details with document count using JOIN
    const { data: municipality, error: muniError } = await supabase
      .from('municipalities')
      .select(`
        *,
        pdf_documents(count)
      `)
      .eq('id', municipalityId)
      .single()

    if (muniError || !municipality) {
      return NextResponse.json(
        { error: 'Municipality not found' },
        { status: 404 }
      )
    }

    // Get documents for this municipality
    const { data: documents, error: docsError } = await supabase
      .from('pdf_documents')
      .select('*')
      .eq('municipality_id', municipalityId)
      .order('date_found', { ascending: false })
      .limit(100)

    if (docsError) {
      console.error('Error fetching documents:', docsError)
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      )
    }

    // Get latest scrape log
    const { data: latestScrape } = await supabase
      .from('scrape_logs')
      .select('*')
      .eq('municipality_id', municipalityId)
      .order('scrape_date', { ascending: false })
      .limit(1)
      .single()

    // Get scrape history (last 50 scrapes)
    const { data: scrapeHistory } = await supabase
      .from('scrape_logs')
      .select('*')
      .eq('municipality_id', municipalityId)
      .order('scrape_date', { ascending: false })
      .limit(50)

    // Get correct total document count from JOIN result
    const totalDocuments = municipality.pdf_documents?.[0]?.count || 0
    
    // Calculate statistics for displayed documents (limited to 100)
    const relevantDocuments = documents?.filter(doc => doc.is_relevant).length || 0
    const analyzedDocuments = documents?.filter(doc => doc.content_text).length || 0

    // Get scraping success rate
    const { data: scrapeStats } = await supabase
      .from('scrape_logs')
      .select('status')
      .eq('municipality_id', municipalityId)
      .limit(20) // Last 20 scrapes

    const successfulScrapes = scrapeStats?.filter(log => log.status === 'success').length || 0
    const totalScrapes = scrapeStats?.length || 0
    const successRate = totalScrapes > 0 ? Math.round((successfulScrapes / totalScrapes) * 100) : 0

    // Build response data
    const responseData = {
      data: {
        municipality: {
          ...municipality,
          totalDocuments,
          relevantDocuments,
          // Remove the nested data to clean up response
          pdf_documents: undefined
        },
        documents: documents || [],
        stats: {
          totalDocuments,
          relevantDocuments,
          analyzedDocuments,
          lastScrapeDate: latestScrape?.scrape_date || null,
          successRate
        },
        scrapeHistory: scrapeHistory || []
      }
    }


    return NextResponse.json(responseData)

  } catch (error) {
    console.error('Error in GET /api/municipalities/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to fetch municipality details' },
      { status: 500 }
    )
  }
}

// PUT /api/municipalities/[id] - Update municipality
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const municipalityId = parseInt(id)
    
    if (isNaN(municipalityId)) {
      return NextResponse.json(
        { error: 'Invalid municipality ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      name,
      website_url,
      scraper_name,
      schedule_frequency,
      schedule_active,
      status
    } = body

    // Validate required fields
    if (!name || !website_url) {
      return NextResponse.json(
        { error: 'Name and website URL are required' },
        { status: 400 }
      )
    }

    // Update municipality
    const { data: updatedMunicipality, error: updateError } = await supabase
      .from('municipalities')
      .update({
        name,
        website_url,
        scraper_name,
        schedule_frequency,
        schedule_active,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', municipalityId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating municipality:', updateError)
      return NextResponse.json(
        { error: 'Failed to update municipality' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: updatedMunicipality,
      message: 'Municipality updated successfully'
    })

  } catch (error) {
    console.error('Error in PUT /api/municipalities/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to update municipality' },
      { status: 500 }
    )
  }
}

// PATCH /api/municipalities/[id] - Partial update municipality
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const municipalityId = parseInt(id)
    
    if (isNaN(municipalityId)) {
      return NextResponse.json(
        { error: 'Invalid municipality ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    
    // Remove any undefined/null values and prepare update object
    const updateData: any = {}
    
    if (body.name !== undefined) updateData.name = body.name
    if (body.website_url !== undefined) updateData.website_url = body.website_url
    if (body.scraper_name !== undefined) updateData.scraper_name = body.scraper_name
    if (body.assigned_scrapers !== undefined) updateData.assigned_scrapers = body.assigned_scrapers
    if (body.active_scraper !== undefined) updateData.active_scraper = body.active_scraper
    if (body.schedule_frequency !== undefined) updateData.schedule_frequency = body.schedule_frequency
    if (body.schedule_active !== undefined) updateData.schedule_active = body.schedule_active
    if (body.status !== undefined) updateData.status = body.status
    if (body.next_run !== undefined) updateData.next_run = body.next_run
    if (body.filter_keywords !== undefined) updateData.filter_keywords = body.filter_keywords
    if (body.min_relevance_score !== undefined) updateData.min_relevance_score = body.min_relevance_score
    if (body.enable_smart_filtering !== undefined) updateData.enable_smart_filtering = body.enable_smart_filtering
    if (body.auto_analyze !== undefined) updateData.auto_analyze = body.auto_analyze
    
    // Always update the updated_at timestamp
    updateData.updated_at = new Date().toISOString()

    // Update municipality with only provided fields
    const { data: updatedMunicipality, error: updateError } = await supabase
      .from('municipalities')
      .update(updateData)
      .eq('id', municipalityId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating municipality:', updateError)
      return NextResponse.json(
        { error: 'Failed to update municipality', details: updateError.message },
        { status: 500 }
      )
    }


    return NextResponse.json({
      data: updatedMunicipality,
      message: 'Municipality updated successfully'
    })

  } catch (error) {
    console.error('Error in PATCH /api/municipalities/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to update municipality' },
      { status: 500 }
    )
  }
}

// DELETE /api/municipalities/[id] - Delete municipality
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const municipalityId = parseInt(id)
    
    if (isNaN(municipalityId)) {
      return NextResponse.json(
        { error: 'Invalid municipality ID' },
        { status: 400 }
      )
    }

    // Check if municipality exists
    const { data: municipality, error: fetchError } = await supabase
      .from('municipalities')
      .select('id, name')
      .eq('id', municipalityId)
      .single()

    if (fetchError || !municipality) {
      return NextResponse.json(
        { error: 'Municipality not found' },
        { status: 404 }
      )
    }

    // Check if there are any documents or scrape logs (optional - you may want to cascade delete)
    const { data: documents } = await supabase
      .from('pdf_documents')
      .select('id')
      .eq('municipality_id', municipalityId)
      .limit(1)

    if (documents && documents.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete municipality with existing documents. Please delete documents first.' },
        { status: 409 }
      )
    }

    // Delete the municipality
    const { error: deleteError } = await supabase
      .from('municipalities')
      .delete()
      .eq('id', municipalityId)

    if (deleteError) {
      console.error('Error deleting municipality:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete municipality' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: { id: municipalityId, name: municipality.name },
      message: 'Municipality deleted successfully'
    })

  } catch (error) {
    console.error('Error in DELETE /api/municipalities/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to delete municipality' },
      { status: 500 }
    )
  }
}