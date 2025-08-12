import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'

// GET /api/categories/stats - Get category statistics
export async function GET(request: NextRequest) {
  try {
    // For now, return empty categories until categorization is implemented
    // This prevents errors when the categories hook is called
    console.log('Returning empty categories (categorization not yet implemented)')
    
    const emptyResponse = {
      categories: [],
      totals: {
        totalDocuments: 0,
        strongMatches: 0,
        moderateMatches: 0,
        weakMatches: 0
      },
      lastUpdated: new Date().toISOString()
    }
    
    return NextResponse.json(emptyResponse)

  } catch (error) {
    console.error('Unexpected error in GET /api/categories/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}