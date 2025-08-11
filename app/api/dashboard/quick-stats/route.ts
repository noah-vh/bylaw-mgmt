import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'

// GET /api/dashboard/quick-stats - Get quick overview statistics
export async function GET(request: NextRequest) {
  try {
    // Use more efficient single queries with aggregation
    const [municipalitiesResult, documentsResult] = await Promise.all([
      // Get all municipality data in one query and aggregate in memory
      supabase.from('municipalities').select('status'),
      
      // Get all document flags in one query and aggregate in memory
      supabase.from('pdf_documents').select('content_analyzed, is_adu_relevant')
    ])

    // Aggregate municipality stats
    const municipalities = municipalitiesResult.data || []
    const municipalityStats = {
      total: municipalities.length,
      active: municipalities.filter(m => m.status === 'active').length,
      pending: municipalities.filter(m => m.status === 'pending').length
    }

    // Aggregate document stats
    const documents = documentsResult.data || []
    const documentStats = {
      total: documents.length,
      analyzed: documents.filter(d => d.content_analyzed).length,
      relevant: documents.filter(d => d.is_adu_relevant).length
    }

    return NextResponse.json({
      municipalities: municipalityStats,
      documents: documentStats
    })
  } catch (error) {
    console.error('Error fetching quick stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch quick statistics' },
      { status: 500 }
    )
  }
}