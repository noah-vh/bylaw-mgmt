import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'
import path from 'path'
import fs from 'fs/promises'
import type { 
  DetailedJobStatus,
  JobId
} from '@/types/database'

// Helper function to read job progress from file (for offline operation)
async function readJobProgress(jobId: JobId): Promise<any | null> {
  const progressDir = path.join(process.cwd(), 'tmp', 'job-progress')
  const progressFile = path.join(progressDir, `${jobId}.json`)
  
  try {
    const content = await fs.readFile(progressFile, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    // File doesn't exist or can't be read - that's okay, we'll use database only
    return null
  }
}

// Helper function to enhance job data with additional details
async function enhanceJobStatus(job: any): Promise<DetailedJobStatus> {
  const enhanced: any = {
    ...job,
    isRunning: job.status === 'running',
    isCompleted: job.status === 'completed',
    isFailed: job.status === 'failed',
    logs: []
  }

  // Calculate elapsed time
  if (job.started_at) {
    const startTime = new Date(job.started_at).getTime()
    const endTime = job.completed_at ? new Date(job.completed_at).getTime() : Date.now()
    enhanced.elapsedTime = Math.floor((endTime - startTime) / 1000) // in seconds
  }

  // Estimate remaining time (rough calculation based on progress)
  if (job.status === 'running' && job.progress > 0 && enhanced.elapsedTime) {
    const progressRatio = job.progress / 100
    const totalEstimatedTime = enhanced.elapsedTime / progressRatio
    enhanced.estimatedTimeRemaining = Math.floor(totalEstimatedTime - enhanced.elapsedTime)
  }

  // Fetch municipality info if available
  if (job.municipality_id) {
    const { data: municipality } = await supabase
      .from('municipalities')
      .select('id, name')
      .eq('id', job.municipality_id)
      .single()
    
    if (municipality) {
      enhanced.municipality = municipality
    }
  }

  // Fetch document info if available
  if (job.document_id) {
    const { data: document } = await supabase
      .from('pdf_documents')
      .select('id, title')
      .eq('id', job.document_id)
      .single()
    
    if (document) {
      enhanced.document = document
    }
  }

  // Read additional progress info from file
  const fileProgress = await readJobProgress(job.id)
  if (fileProgress) {
    enhanced.logs = fileProgress.logs || []
    // Override with more recent file data if available
    if (fileProgress.updatedAt && new Date(fileProgress.updatedAt) > new Date(job.updated_at || job.created_at)) {
      enhanced.progress = fileProgress.progress || enhanced.progress
      enhanced.progress_message = fileProgress.message || enhanced.progress_message
      enhanced.error_message = fileProgress.error || enhanced.error_message
      enhanced.status = fileProgress.status || enhanced.status
    }
  }

  return enhanced
}

// GET /api/processing/[id] - Get individual processing job status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const jobId = id

    if (!jobId) {
      return NextResponse.json(
        { 
          error: 'Job ID is required',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    // Fetch job from database
    const { data: job, error } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') { // Not found
        return NextResponse.json(
          { 
            error: 'Job not found',
            message: `No job found with ID: ${jobId}`,
            timestamp: new Date().toISOString()
          },
          { status: 404 }
        )
      }
      
      throw error
    }

    // Enhance job data with additional details
    const detailedJob = await enhanceJobStatus(job)

    return NextResponse.json({
      data: detailedJob,
      message: 'Job status retrieved successfully',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Unexpected error in GET /api/processing/[id]:', error)
    return NextResponse.json(
      { 
        error: 'Failed to retrieve job status',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// PATCH /api/processing/[id] - Update job status (for manual intervention)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const jobId = id
    const body = await request.json()

    if (!jobId) {
      return NextResponse.json(
        { 
          error: 'Job ID is required',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    // Only allow certain status updates
    const allowedUpdates = ['cancelled', 'failed']
    const { status, error_message } = body

    if (status && !allowedUpdates.includes(status)) {
      return NextResponse.json(
        { 
          error: 'Invalid status update',
          message: `Can only update status to: ${allowedUpdates.join(', ')}`,
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    const updates: any = {}
    if (status) {
      updates.status = status
      updates.completed_at = new Date().toISOString()
      updates.progress_message = status === 'cancelled' ? 'Job cancelled by user' : 'Job failed'
    }
    if (error_message) {
      updates.error_message = error_message
    }

    // Update job in database
    const { data: updatedJob, error } = await supabase
      .from('background_jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') { // Not found
        return NextResponse.json(
          { 
            error: 'Job not found',
            message: `No job found with ID: ${jobId}`,
            timestamp: new Date().toISOString()
          },
          { status: 404 }
        )
      }
      
      throw error
    }

    // Update progress file
    await readJobProgress(jobId).then(async (fileProgress) => {
      const progressDir = path.join(process.cwd(), 'tmp', 'job-progress')
      await fs.mkdir(progressDir, { recursive: true })
      await fs.writeFile(
        path.join(progressDir, `${jobId}.json`),
        JSON.stringify({
          ...(fileProgress || {}),
          status: updates.status || fileProgress?.status,
          error: updates.error_message || fileProgress?.error,
          message: updates.progress_message || fileProgress?.message,
          updatedAt: new Date().toISOString()
        })
      )
    }).catch(error => {
      console.warn('Failed to update progress file:', error)
    })

    // Enhance job data with additional details
    const detailedJob = await enhanceJobStatus(updatedJob)

    return NextResponse.json({
      data: detailedJob,
      message: 'Job updated successfully',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Unexpected error in PATCH /api/processing/[id]:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update job',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// DELETE /api/processing/[id] - Cancel and delete job
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const jobId = id

    if (!jobId) {
      return NextResponse.json(
        { 
          error: 'Job ID is required',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    // First, try to cancel the job if it's still running
    const { data: job } = await supabase
      .from('background_jobs')
      .select('status')
      .eq('id', jobId)
      .single()

    if (job && job.status === 'running') {
      // Update to cancelled status first
      await supabase
        .from('background_jobs')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          progress_message: 'Job cancelled and deleted by user'
        })
        .eq('id', jobId)
    }

    // Delete the job
    const { error } = await supabase
      .from('background_jobs')
      .delete()
      .eq('id', jobId)

    if (error) {
      if (error.code === 'PGRST116') { // Not found
        return NextResponse.json(
          { 
            error: 'Job not found',
            message: `No job found with ID: ${jobId}`,
            timestamp: new Date().toISOString()
          },
          { status: 404 }
        )
      }
      
      throw error
    }

    // Delete progress file
    const progressDir = path.join(process.cwd(), 'tmp', 'job-progress')
    const progressFile = path.join(progressDir, `${jobId}.json`)
    await fs.unlink(progressFile).catch(error => {
      // File might not exist, that's okay
      console.debug('Progress file already deleted or not found:', error.message)
    })

    return NextResponse.json({
      message: 'Job deleted successfully',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Unexpected error in DELETE /api/processing/[id]:', error)
    return NextResponse.json(
      { 
        error: 'Failed to delete job',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}