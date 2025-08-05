import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'

// GET /api/dashboard/stats - Get comprehensive dashboard statistics
export async function GET(request: NextRequest) {
  try {
    // Fetch various statistics in parallel
    const [municipalitiesResult, documentsResult, jobsResult, recentActivityResult] = await Promise.all([
      // Municipality stats
      supabase
        .from('municipalities')
        .select('status', { count: 'exact' }),
      
      // Document stats
      supabase
        .from('pdf_documents')
        .select('is_adu_relevant, relevance_confidence', { count: 'exact' }),
      
      // Job stats for success rate
      supabase
        .from('background_jobs')
        .select('status')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()), // Last 30 days
      
      // Recent activity
      supabase
        .from('scrape_logs')
        .select(`
          id,
          scrape_date,
          status,
          documents_found,
          municipality_id,
          municipalities!municipality_id(name)
        `)
        .order('scrape_date', { ascending: false })
        .limit(10)
    ])

    // Calculate statistics
    const totalMunicipalities = municipalitiesResult.count || 0
    const totalDocuments = documentsResult.count || 0
    
    // Count relevant documents
    const relevantDocuments = documentsResult.data?.filter(doc => doc.is_adu_relevant).length || 0
    
    // Calculate average confidence
    const docsWithConfidence = documentsResult.data?.filter(doc => doc.relevance_confidence !== null) || []
    const averageConfidence = docsWithConfidence.length > 0
      ? docsWithConfidence.reduce((sum, doc) => sum + (doc.relevance_confidence || 0), 0) / docsWithConfidence.length
      : 0

    // Calculate job statistics
    const jobs = jobsResult.data || []
    const completedJobs = jobs.filter(job => job.status === 'completed').length
    const totalJobs = jobs.length
    const successRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0

    // Count active jobs and completed today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count: activeJobsCount } = await supabase
      .from('background_jobs')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'running'])
    
    const { count: completedTodayCount } = await supabase
      .from('background_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', todayStart.toISOString())

    // Format recent activity
    const recentActivity = (recentActivityResult.data || []).map(log => ({
      id: `scrape_${log.id}`,
      type: 'scrape' as const,
      message: `Scraping ${log.status} for ${Array.isArray(log.municipalities) ? log.municipalities[0]?.name : log.municipalities?.name || 'Unknown'}`,
      timestamp: log.scrape_date,
      status: log.status === 'success' ? 'success' : log.status === 'error' ? 'error' : 'warning',
      municipalityId: log.municipality_id,
      municipalityName: Array.isArray(log.municipalities) ? log.municipalities[0]?.name : log.municipalities?.name
    }))

    return NextResponse.json({
      totalMunicipalities,
      totalDocuments,
      relevantDocuments,
      activeJobs: activeJobsCount || 0,
      completedJobsToday: completedTodayCount || 0,
      successRate,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      recentActivity
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 }
    )
  }
}