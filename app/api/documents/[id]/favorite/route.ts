import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase'

// POST /api/documents/[id]/favorite - Toggle document favorite status
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const documentId = parseInt(id, 10)
    
    if (isNaN(documentId)) {
      return NextResponse.json(
        { error: 'Invalid document ID' },
        { status: 400 }
      )
    }

    // First, get the current favorite status
    const { data: currentDoc, error: fetchError } = await supabase
      .from('pdf_documents')
      .select('is_favorited')
      .eq('id', documentId)
      .single()

    if (fetchError || !currentDoc) {
      console.error('Error fetching document:', fetchError)
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Toggle the favorite status
    const { data: updatedDoc, error: updateError } = await supabase
      .from('pdf_documents')
      .update({ is_favorited: !currentDoc.is_favorited })
      .eq('id', documentId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating favorite status:', updateError)
      return NextResponse.json(
        { error: 'Failed to update favorite status' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: updatedDoc,
      message: `Document ${updatedDoc.is_favorited ? 'added to' : 'removed from'} favorites`
    })

  } catch (error) {
    console.error('Unexpected error in POST /api/documents/[id]/favorite:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}