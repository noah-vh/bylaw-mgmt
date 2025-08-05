import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase'
import path from 'path'
import fs from 'fs/promises'
import type { 
  JobId,
  JobStatus,
  JobProgress
} from '@/types/database'

// Helper function to read job progress from file
async function readJobProgress(jobId: JobId): Promise<any | null> {
  const progressDir = path.join(process.cwd(), 'tmp', 'job-progress')
  const progressFile = path.join(progressDir, `${jobId}.json`)
  
  try {
    const data = await fs.readFile(progressFile, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    // File doesn't exist or can't be read
    return null
  }
}

// Helper function to clean up completed job files
async function cleanupCompletedJob(jobId: JobId) {
  const progressDir = path.join(process.cwd(), 'tmp', 'job-progress')
  const progressFile = path.join(progressDir, `${jobId}.json`)
  
  try {
    // Keep completed job files for 1 hour, then remove them
    const stats = await fs.stat(progressFile)
    const oneHourAgo = Date.now() - (60 * 60 * 1000)
    
    if (stats.mtime.getTime() < oneHourAgo) {
      await fs.unlink(progressFile)
      console.log(`Cleaned up old progress file: ${jobId}`)
    }
  } catch (error) {
    // File doesn't exist or can't be cleaned up - that's okay
  }
}

// Helper function to get database job info as fallback
async function getDatabaseJobInfo(jobId: JobId) {
  try {
    const { data: job, error } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (error || !job) {
      return null
    }

    return {
      jobId: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      message: job.progress_message,
      error: job.error_message,
      result: job.result_data,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      municipalityId: job.municipality_id,
      documentId: job.document_id
    }
  } catch (error) {
    console.error('Error fetching database job info:', error)
    return null
  }
}

// Helper function to calculate ETA
function calculateETA(progress: number, startTime: string): number | null {
  if (progress <= 0 || progress >= 100) return null
  
  const elapsed = Date.now() - new Date(startTime).getTime()
  const rate = progress / elapsed // progress per millisecond
  const remaining = 100 - progress
  
  return Math.round(remaining / rate)
}

// Helper function to format progress response
function formatProgressResponse(progressData: any, fallbackData?: any) {
  const data = progressData || fallbackData
  if (!data) {
    return {
      jobId: null,
      status: 'not_found' as JobStatus,
      progress: 0,
      message: 'Job not found',
      stage: 'unknown',
      error: 'Job progress data not available'
    }
  }

  const response: any = {
    jobId: data.jobId,
    type: data.type,
    status: data.status || 'unknown',
    progress: Math.min(100, Math.max(0, data.progress || 0)),
    message: data.message || data.progress_message || 'Processing...',
    stage: data.stage || 'running',
    updatedAt: data.updatedAt || data.updated_at,
    createdAt: data.createdAt || data.created_at,
    startTime: data.startTime || data.started_at,
    endTime: data.endTime || data.completed_at
  }

  // Add operation-specific fields
  if (data.operation) response.operation = data.operation
  if (data.scraperName) response.scraperName = data.scraperName
  if (data.municipalityId) response.municipalityId = data.municipalityId
  if (data.municipalityName) response.municipalityName = data.municipalityName
  if (data.documentId) response.documentId = data.documentId

  // Add bulk processing fields
  if (data.municipalityIds) response.municipalityIds = data.municipalityIds
  if (data.totalMunicipalities) response.totalMunicipalities = data.totalMunicipalities
  if (data.completedMunicipalities !== undefined) response.completedMunicipalities = data.completedMunicipalities
  if (data.failedMunicipalities !== undefined) response.failedMunicipalities = data.failedMunicipalities

  // Add test-specific fields
  if (data.testMode) response.testMode = data.testMode
  if (data.maxPages) response.maxPages = data.maxPages

  // Calculate ETA if job is running
  if (response.status === 'running' && response.startTime && response.progress > 0 && response.progress < 100) {
    response.estimatedTimeRemaining = calculateETA(response.progress, response.startTime)
  }

  // Add error details
  if (data.error) response.error = data.error
  if (data.result) response.result = data.result

  // Add logs if available
  if (data.logs) response.logs = data.logs

  return response
}

// GET /api/processing/progress/[jobId] - Get job progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const jobIdTyped = jobId as JobId

    // Try to read progress from file first (primary source for active jobs)
    const fileProgress = await readJobProgress(jobIdTyped)
    
    // Get database info as fallback or for additional context
    const dbProgress = await getDatabaseJobInfo(jobIdTyped)

    // Format the response using file data as primary, database as fallback
    const progressResponse = formatProgressResponse(fileProgress, dbProgress)

    // If job is completed or failed, schedule cleanup
    if (fileProgress && ['completed', 'failed'].includes(fileProgress.status)) {
      // Don't await - let it run in background
      setImmediate(() => cleanupCompletedJob(jobIdTyped))
    }

    // Add metadata
    const response = {
      data: progressResponse,
      metadata: {
        source: fileProgress ? 'file' : (dbProgress ? 'database' : 'not_found'),
        lastUpdated: progressResponse.updatedAt || new Date().toISOString(),
        pollingInterval: progressResponse.status === 'running' ? 2000 : 5000 // 2s for active, 5s for others
      },
      message: progressResponse.status === 'not_found' 
        ? 'Job not found' 
        : 'Job progress retrieved successfully',
      timestamp: new Date().toISOString()
    }

    const statusCode = progressResponse.status === 'not_found' ? 404 : 200
    
    return NextResponse.json(response, { status: statusCode })

  } catch (error) {
    console.error('Unexpected error in GET /api/processing/progress/[jobId]:', error)
    return NextResponse.json(
      { 
        error: 'Failed to retrieve job progress',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// DELETE /api/processing/progress/[jobId] - Cancel job and cleanup
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const jobIdTyped = jobId as JobId

    // Try to cancel the job in database
    const { error: updateError } = await supabase
      .from('background_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        progress_message: 'Job cancelled by user'
      })
      .eq('id', jobIdTyped)
      .in('status', ['queued', 'running']) // Only cancel if not already completed

    // Update progress file to indicate cancellation
    const progressDir = path.join(process.cwd(), 'tmp', 'job-progress')
    const progressFile = path.join(progressDir, `${jobIdTyped}.json`)
    
    try {
      const existingData = await readJobProgress(jobIdTyped)
      if (existingData) {
        const cancelledData = {
          ...existingData,
          status: 'cancelled',
          progress: existingData.progress || 0,
          message: 'Job cancelled by user',
          stage: 'cancelled',
          endTime: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        
        await fs.writeFile(progressFile, JSON.stringify(cancelledData, null, 2))
      }
    } catch (fileError) {
      // File doesn't exist or can't be updated - that's okay
    }

    // Schedule cleanup in 5 minutes
    setTimeout(() => {
      cleanupCompletedJob(jobIdTyped)
    }, 5 * 60 * 1000)

    return NextResponse.json({
      data: {
        jobId: jobIdTyped,
        status: 'cancelled',
        message: 'Job cancellation requested'
      },
      message: 'Job cancelled successfully',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Unexpected error in DELETE /api/processing/progress/[jobId]:', error)
    return NextResponse.json(
      { 
        error: 'Failed to cancel job',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// POST /api/processing/progress/[jobId] - Add log entry or update progress
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const jobIdTyped = jobId as JobId
    const body = await request.json()

    // Read existing progress
    const existingProgress = await readJobProgress(jobIdTyped)
    if (!existingProgress) {
      return NextResponse.json(
        { 
          error: 'Job not found',
          message: `No progress data found for job: ${jobIdTyped}`,
          timestamp: new Date().toISOString()
        },
        { status: 404 }
      )
    }

    // Update progress data
    const updatedProgress = {
      ...existingProgress,
      ...body,
      updatedAt: new Date().toISOString()
    }

    // Add to logs if message provided
    if (body.logMessage) {
      if (!updatedProgress.logs) updatedProgress.logs = []
      updatedProgress.logs.push({
        timestamp: new Date().toISOString(),
        message: body.logMessage,
        level: body.logLevel || 'info'
      })
      
      // Keep only last 50 log entries
      if (updatedProgress.logs.length > 50) {
        updatedProgress.logs = updatedProgress.logs.slice(-50)
      }
    }

    // Write updated progress
    const progressDir = path.join(process.cwd(), 'tmp', 'job-progress')
    await fs.mkdir(progressDir, { recursive: true })
    await fs.writeFile(
      path.join(progressDir, `${jobIdTyped}.json`),
      JSON.stringify(updatedProgress, null, 2)
    )

    return NextResponse.json({
      data: formatProgressResponse(updatedProgress),
      message: 'Progress updated successfully',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Unexpected error in POST /api/processing/progress/[jobId]:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update job progress',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}