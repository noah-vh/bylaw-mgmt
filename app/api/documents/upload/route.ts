import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { z } from 'zod'

// Validation schema for form data
const uploadSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  municipality_id: z.number().min(1, 'Municipality is required'),
  url: z.string().url().optional().or(z.literal("")),
  date_published: z.string().optional(),
  is_adu_relevant: z.boolean().default(false),
})

// POST /api/documents/upload - Upload PDF and/or create document record
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    console.log('Upload API called at', new Date().toISOString())
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const title = formData.get('title') as string
    const municipalityIdStr = formData.get('municipality_id') as string
    const municipality_id = municipalityIdStr ? parseInt(municipalityIdStr) : NaN
    const url = formData.get('url') as string || ''
    const date_published = formData.get('date_published') as string || undefined
    const is_adu_relevant = formData.get('is_adu_relevant') === 'true'
    
    console.log('Received form data:', {
      title,
      municipality_id,
      municipalityIdStr,
      url,
      hasFile: !!file,
      is_adu_relevant
    })

    // Check if municipality_id is valid
    if (isNaN(municipality_id)) {
      return NextResponse.json(
        { error: 'Please select a municipality' },
        { status: 400 }
      )
    }

    // Validate that we have either a file or a URL
    if (!file && !url) {
      return NextResponse.json(
        { error: 'Either a file upload or URL is required' },
        { status: 400 }
      )
    }

    // Validate file if provided
    if (file) {
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
    }

    // Validate form data - only include defined values
    const formDataToValidate: any = {
      title,
      municipality_id,
      url: url || undefined,
      is_adu_relevant,
    }
    
    // Only add date_published if it exists
    if (date_published) {
      formDataToValidate.date_published = date_published
    }
    
    const validation = uploadSchema.safeParse(formDataToValidate)

    if (!validation.success) {
      console.error('Validation failed:', validation.error.format())
      const errors = validation.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')
      return NextResponse.json(
        { 
          error: 'Invalid form data: ' + errors,
          details: validation.error.format()
        },
        { status: 400 }
      )
    }

    const validatedData = validation.data
    
    let finalUrl = url
    let filename = ''
    let fileSize = 0
    let storagePath = null

    // If file is provided, upload it to storage
    if (file) {
      // Generate unique filename
      const fileExtension = '.pdf'
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const uniqueId = Math.random().toString(36).substring(2, 10)
      filename = `${title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_${timestamp}_${uniqueId}${fileExtension}`
      fileSize = file.size
      
      // Create storage path
      storagePath = `pdfs/${validatedData.municipality_id}/${filename}`

      // Convert File to ArrayBuffer for upload
      const fileBuffer = await file.arrayBuffer()

      // Check if storage bucket exists and is configured
      try {
        // Upload file to Supabase Storage using admin client
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('documents')
          .upload(storagePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: false
          })

        if (uploadError) {
          console.error('Storage upload error:', uploadError)
          // If storage fails, we'll continue with just the URL if provided
          if (!url) {
            return NextResponse.json(
              { error: 'Failed to upload file to storage. Please provide a URL instead.' },
              { status: 500 }
            )
          }
          storagePath = null // Clear storage path since upload failed
        } else {
          // Get public URL for the uploaded file
          const { data: urlData } = supabaseAdmin.storage
            .from('documents')
            .getPublicUrl(storagePath)
          
          finalUrl = urlData.publicUrl
        }
      } catch (storageError) {
        console.error('Storage error:', storageError)
        // If storage is not configured, continue with URL only
        if (!url) {
          return NextResponse.json(
            { error: 'File storage is not configured. Please provide a URL instead.' },
            { status: 500 }
          )
        }
      }
    } else if (url) {
      // If only URL is provided, extract filename from URL
      const urlParts = url.split('/')
      filename = urlParts[urlParts.length - 1] || 'document.pdf'
    }

    // Create document record in database
    const documentData: any = {
      municipality_id: validatedData.municipality_id,
      title: validatedData.title,
      url: finalUrl || url || '', // Use the final URL (from storage or provided)
      filename: filename,
      file_size: fileSize || null,
      is_relevant: validatedData.is_adu_relevant || false, // Note: column is 'is_relevant' not 'is_adu_relevant'
      date_found: new Date().toISOString(),
      last_checked: new Date().toISOString(),
      is_favorited: false,
      document_source: 'client' // Mark all uploaded documents as client-provided
    }
    
    // Only include storage_path if we actually uploaded a file
    if (storagePath) {
      documentData.storage_path = storagePath
    }
    
    // Add date_published if provided
    if (validatedData.date_published) {
      documentData.date_published = validatedData.date_published
    }

    console.log('Inserting document with data:', documentData)

    // Use admin client to bypass RLS for inserts
    const { data: document, error: dbError } = await supabaseAdmin
      .from('pdf_documents')
      .insert([documentData])
      .select()
      .single()

    if (dbError) {
      console.error('Database error creating document:', dbError)
      console.error('Database error details:', JSON.stringify(dbError, null, 2))
      console.error('Document data attempted:', JSON.stringify(documentData, null, 2))
      
      // Clean up uploaded file if database insertion fails and we uploaded a file
      if (storagePath) {
        try {
          await supabaseAdmin.storage
            .from('documents')
            .remove([storagePath])
        } catch (cleanupError) {
          console.error('Failed to clean up uploaded file:', cleanupError)
        }
      }

      return NextResponse.json(
        { 
          error: dbError.message || 'Failed to create document record',
          details: dbError.details || dbError.hint || dbError.code || 'Database error occurred'
        },
        { status: 500 }
      )
    }

    // If a file was uploaded, try to extract text immediately
    let extractionResult = null
    if (file) {
      try {
        const fileBuffer = await file.arrayBuffer()
        // Try to extract text using pdf-parse
        const pdfParse = await import('pdf-parse')
        const pdfData = await (pdfParse as any).default(Buffer.from(fileBuffer))
        
        if (pdfData.text && pdfData.text.trim()) {
          // Update document with extracted content
          // Use admin client for update as well
          const { error: extractionUpdateError } = await supabaseAdmin
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
        fileSize: fileSize || null,
        storagePath: storagePath || null,
        extraction: extractionResult || {
          status: file ? 'pending' : 'not_applicable',
          message: file ? 'Will be processed in background' : 'No file uploaded for extraction'
        },
        nextSteps: file 
          ? (extractionResult?.status === 'completed' 
            ? ['Content analysis will be performed automatically']
            : ['Text extraction will be processed automatically', 'Content analysis will be performed after extraction'])
          : ['Document added with URL reference only']
      }
    }

    return NextResponse.json(result, { status: 201 })

  } catch (error) {
    console.error('Unexpected error in POST /api/documents/upload:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error',
        details: error instanceof Error ? error.stack : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}