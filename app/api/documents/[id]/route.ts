import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/documents/[id] - Get single document
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const documentId = parseInt(id)

    if (isNaN(documentId)) {
      return NextResponse.json(
        { error: 'Invalid document ID' },
        { status: 400 }
      )
    }

    // Get the document with municipality info
    const { data: document, error } = await supabase
      .from('pdf_documents')
      .select(`
        *,
        municipalities!inner(id, name)
      `)
      .eq('id', documentId)
      .single()

    if (error) {
      console.error('Database error fetching document:', error)
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: 'Failed to fetch document' },
        { status: 500 }
      )
    }

    // Transform the response to include municipality name
    const transformedDocument = {
      ...document,
      municipality_name: document.municipalities.name,
      municipalities: undefined // Remove the nested object
    }

    return NextResponse.json({
      data: transformedDocument,
      message: 'Document fetched successfully'
    })

  } catch (error) {
    console.error('Unexpected error in GET /api/documents/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/documents/[id] - Update document
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const documentId = parseInt(id)
    const body = await request.json()

    if (isNaN(documentId)) {
      return NextResponse.json(
        { error: 'Invalid document ID' },
        { status: 400 }
      )
    }

    // Update the document
    const { data: document, error } = await supabase
      .from('pdf_documents')
      .update(body)
      .eq('id', documentId)
      .select()
      .single()

    if (error) {
      console.error('Database error updating document:', error)
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: 'Failed to update document' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: document,
      message: 'Document updated successfully'
    })

  } catch (error) {
    console.error('Unexpected error in PATCH /api/documents/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}