import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

// GET /api/categories/stats - Get category statistics
export async function GET(request: NextRequest) {
  try {
    const categoryNames = [
      'ADU/ARU Regulations',
      'Zoning',
      'Dimensional Requirements',
      'Property Specifications',
      'Building Types',
      'Existing Buildings',
      'Parking/Access',
      'Infrastructure'
    ]
    
    // Get all documents with categories to count them
    // Use range to get all documents (Supabase has a default limit)
    const { data: documents, error } = await supabase
      .from('pdf_documents')
      .select('categories')
      .not('categories', 'is', null)
      .range(0, 100000) // Get up to 100k documents
    
    if (error) {
      console.error('Error fetching documents:', error)
      throw error
    }
    
    // Count documents per category
    const categoryCounts: Record<string, number> = {}
    categoryNames.forEach(name => {
      categoryCounts[name] = 0
    })
    
    documents?.forEach(doc => {
      if (doc.categories && typeof doc.categories === 'object' && !Array.isArray(doc.categories)) {
        categoryNames.forEach(categoryName => {
          const score = doc.categories[categoryName]
          if (typeof score === 'number' && score >= 1) {
            categoryCounts[categoryName]++
          }
        })
      }
    })
    
    const categoryStats = categoryNames.map((categoryName, index) => ({
      id: categoryName.toLowerCase().replace(/[^a-z0-9]/g, '-'), // Create ID from name
      name: categoryName,
      category: categoryName, // For backwards compatibility
      documentCount: categoryCounts[categoryName],
      totalDocuments: categoryCounts[categoryName], // What the frontend expects
      total: categoryCounts[categoryName], // For backwards compatibility
      averageScore: 0
    }))
    
    // Custom sort: ADU/ARU first, then by document count
    categoryStats.sort((a, b) => {
      // Keep ADU/ARU Regulations at the top
      if (a.category === 'ADU/ARU Regulations') return -1
      if (b.category === 'ADU/ARU Regulations') return 1
      
      // Then sort by document count
      return b.documentCount - a.documentCount
    })
    
    const response = {
      categories: categoryStats,
      totals: {
        totalDocuments: categoryStats.reduce((sum, c) => sum + c.documentCount, 0),
        totalScore: 0
      },
      lastUpdated: new Date().toISOString()
    }
    
    return NextResponse.json(response)

  } catch (error) {
    console.error('Unexpected error in GET /api/categories/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}