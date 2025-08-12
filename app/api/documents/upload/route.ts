import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

// Validation schema for form data
const uploadSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  municipality_id: z.number().min(1, 'Municipality is required'),
  date_published: z.string().optional(),
  is_adu_relevant: z.boolean().default(false),
})

// POST /api/documents/upload - Upload PDF and create document record
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const title = formData.get('title') as string
    const municipality_id = parseInt(formData.get('municipality_id') as string)
    const date_published = formData.get('date_published') as string || null
    const is_adu_relevant = formData.get('is_adu_relevant') === 'true'

    // Validate file
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      )
    }

    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      return NextResponse.json(
        { error: 'File size must be less than 50MB' },
        { status: 400 }
      )
    }

    // Validate form data
    const validation = uploadSchema.safeParse({
      title,
      municipality_id,
      date_published,
      is_adu_relevant,
    })

    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid form data',
          details: validation.error.format()
        },
        { status: 400 }
      )
    }

    const validatedData = validation.data

    // Generate unique filename
    const fileExtension = '.pdf'
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const uniqueId = uuidv4().substring(0, 8)
    const filename = `${title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_${timestamp}_${uniqueId}${fileExtension}`
    
    // Create storage path
    const storagePath = `pdfs/${validatedData.municipality_id}/${filename}`

    // Convert File to ArrayBuffer for upload
    const fileBuffer = await file.arrayBuffer()

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: false
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file to storage' },
        { status: 500 }
      )
    }

    // Get public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath)

    // Create document record in database
    const documentData = {
      municipality_id: validatedData.municipality_id,
      title: validatedData.title,
      url: urlData.publicUrl,
      filename: filename,
      file_size: file.size,
      is_adu_relevant: validatedData.is_adu_relevant,
      date_found: new Date().toISOString(),
      date_published: validatedData.date_published || null,
      last_checked: new Date().toISOString(),
      storage_path: storagePath,
      is_favorited: false,
    }

    const { data: document, error: dbError } = await supabase
      .from('pdf_documents')
      .insert(documentData)
      .select()
      .single()

    if (dbError) {
      console.error('Database error creating document:', dbError)
      
      // Clean up uploaded file if database insertion fails
      await supabase.storage
        .from('documents')
        .remove([storagePath])

      return NextResponse.json(
        { error: 'Failed to create document record' },
        { status: 500 }
      )
    }

    // Trigger text extraction immediately
    let extractionResult = null
    try {
      // Try to extract text using pdf-parse
      const pdfParse = await import('pdf-parse')
      const pdfData = await (pdfParse as any).default(fileBuffer)
      
      if (pdfData.text && pdfData.text.trim()) {
        // Update document with extracted content
        const { error: extractionUpdateError } = await supabase
          .from('pdf_documents')
          .update({
            content_text: pdfData.text,
            extraction_status: 'completed',
            last_checked: new Date().toISOString()
          })
          .eq('id', document.id)

        if (!extractionUpdateError) {
          extractionResult = {
            status: 'completed',
            content_length: pdfData.text.length
          }
        }
      }
    } catch (extractionError) {
      console.log('Immediate extraction failed, will be processed in background:', (extractionError as Error).message)
      // Document will remain with extraction_status: 'pending' for background processing
    }

    // Get municipality name for response
    const { data: municipality } = await supabase
      .from('municipalities')
      .select('name')
      .eq('id', validatedData.municipality_id)
      .single()

    const result = {
      data: {
        ...document,
        municipality_name: municipality?.name || 'Unknown'
      },
      meta: {
        duration: Date.now() - startTime,
        fileSize: file.size,
        storagePath,
        extraction: extractionResult || {
          status: 'pending',
          message: 'Will be processed in background'
        },
        nextSteps: extractionResult?.status === 'completed' 
          ? ['Content analysis will be performed automatically']
          : ['Text extraction will be processed automatically', 'Content analysis will be performed after extraction']
      }
    }

    return NextResponse.json(result, { status: 201 })

  } catch (error) {
    console.error('Unexpected error in POST /api/documents/upload:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}