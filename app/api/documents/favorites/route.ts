import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'

// GET /api/documents/favorites - Get all favorited documents
export async function GET(request: NextRequest) {
  try {
    const { data: documents, error } = await supabase
      .from('pdf_documents')
      .select(`
        *,
        municipalities!inner(
          id,
          name
        )
      `)
      .eq('is_favorited', true)
      .order('date_found', { ascending: false })

    if (error) {
      console.error('Error fetching favorite documents:', error)
      return NextResponse.json(
        { error: 'Failed to fetch favorite documents' },
        { status: 500 }
      )
    }

    // Transform the data to match the expected format
    const transformedDocuments = documents.map(doc => ({
      ...doc,
      municipality: doc.municipalities,
      municipality_name: doc.municipalities.name
    }))

    return NextResponse.json({
      data: transformedDocuments
    })

  } catch (error) {
    console.error('Unexpected error in GET /api/documents/favorites:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}