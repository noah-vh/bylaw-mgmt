import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'

// GET /api/dashboard/quick-stats - Get quick overview statistics
export async function GET(request: NextRequest) {
  try {
    // Fetch counts in parallel
    const [
      municipalitiesTotal,
      municipalitiesActive,
      municipalitiesPending,
      documentsTotal,
      documentsAnalyzed,
      documentsRelevant
    ] = await Promise.all([
      // Municipality counts
      supabase.from('municipalities').select('*', { count: 'exact', head: true }),
      supabase.from('municipalities').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('municipalities').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      
      // Document counts
      supabase.from('pdf_documents').select('*', { count: 'exact', head: true }),
      supabase.from('pdf_documents').select('*', { count: 'exact', head: true }).eq('content_analyzed', true),
      supabase.from('pdf_documents').select('*', { count: 'exact', head: true }).eq('is_adu_relevant', true)
    ])


    return NextResponse.json({
      municipalities: {
        total: municipalitiesTotal.count || 0,
        active: municipalitiesActive.count || 0,
        pending: municipalitiesPending.count || 0
      },
      documents: {
        total: documentsTotal.count || 0,
        analyzed: documentsAnalyzed.count || 0,
        relevant: documentsRelevant.count || 0
      }
    })
  } catch (error) {
    console.error('Error fetching quick stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch quick statistics' },
      { status: 500 }
    )
  }
}