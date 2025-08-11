import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'

// GET /api/categories/stats - Get real category statistics from database
export async function GET(request: NextRequest) {
  try {
    console.log('Fetching category statistics...')
    
    // Call the RPC function to get category statistics
    const { data, error } = await supabase.rpc('get_category_statistics')
    
    if (error) {
      console.error('Supabase RPC error:', error)
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return NextResponse.json(
        { 
          error: 'Failed to fetch category statistics', 
          details: error.message,
          code: error.code 
        },
        { status: 500 }
      )
    }
    
    if (!data) {
      console.log('No data returned from get_category_statistics')
      return NextResponse.json(
        { categories: [], totals: {}, lastUpdated: new Date().toISOString() },
        { status: 200 }
      )
    }

    // Map the database results to the format expected by the frontend
    const categoryMetadata = {
      'Property Specifications': {
        id: 'property-specifications',
        description: 'Lot sizes, yards, setbacks, frontage, and coverage requirements',
        icon: 'Building2',
        color: 'bg-orange-100 text-orange-800'
      },
      'ADU/ARU Regulations': {
        id: 'adu-aru',
        description: 'Additional residential units, secondary suites, coach houses, and laneway suites',
        icon: 'Home',
        color: 'bg-green-100 text-green-800'
      },
      'Dimensional Requirements': {
        id: 'dimensional',
        description: 'Minimum and maximum dimensions, height restrictions, and floor area requirements',
        icon: 'Building2',
        color: 'bg-blue-100 text-blue-800'
      },
      'Parking/Access': {
        id: 'parking-access',
        description: 'Parking requirements, driveways, garages, and vehicle access regulations',
        icon: 'Car',
        color: 'bg-purple-100 text-purple-800'
      },
      'Infrastructure': {
        id: 'infrastructure',
        description: 'Water, sewer, electrical, and other municipal services requirements',
        icon: 'Zap',
        color: 'bg-cyan-100 text-cyan-800'
      },
      'Zoning': {
        id: 'zoning',
        description: 'Zoning designations, permitted uses, and development provisions',
        icon: 'Building2',
        color: 'bg-indigo-100 text-indigo-800'
      },
      'Building Types': {
        id: 'building-types',
        description: 'Detached, semi-detached, apartments, and other dwelling types',
        icon: 'Home',
        color: 'bg-yellow-100 text-yellow-800'
      },
      'Existing Buildings': {
        id: 'existing-buildings',
        description: 'Regulations for existing, principal, and primary structures',
        icon: 'Shield',
        color: 'bg-red-100 text-red-800'
      }
    }

    console.log(`Retrieved ${data?.length || 0} categories from database`)
    
    // Transform the data for the frontend
    const categories = (data || []).map((cat: any) => {
      const categoryName = cat.category_name?.trim() || ''
      return {
        ...(categoryMetadata as any)[categoryName] || {
          id: categoryName.toLowerCase().replace(/\s+/g, '-'),
          description: '',
          icon: 'FileText',
          color: 'bg-gray-100 text-gray-800'
        },
        name: categoryName,
        strongMatches: cat.strong_matches || 0,
        moderateMatches: cat.moderate_matches || 0,
        weakMatches: cat.weak_matches || 0,
        totalDocuments: cat.total_documents || 0,
        avgScore: cat.avg_score || 0
      }
    }) || []

    // Calculate totals
    const totals = {
      totalDocuments: categories.reduce((sum: number, cat: any) => sum + cat.totalDocuments, 0),
      strongMatches: categories.reduce((sum: number, cat: any) => sum + cat.strongMatches, 0),
      moderateMatches: categories.reduce((sum: number, cat: any) => sum + cat.moderateMatches, 0),
      weakMatches: categories.reduce((sum: number, cat: any) => sum + cat.weakMatches, 0)
    }

    return NextResponse.json({
      categories,
      totals,
      lastUpdated: new Date().toISOString()
    })

  } catch (error) {
    console.error('Unexpected error in GET /api/categories/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}