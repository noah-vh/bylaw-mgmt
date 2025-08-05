import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

// GET progress file for a specific job
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      )
    }

    // Try to read progress file
    const progressDir = path.join(process.cwd(), 'tmp', 'job-progress')
    const progressFile = path.join(progressDir, `${jobId}.json`)
    
    try {
      const progressData = await fs.readFile(progressFile, 'utf-8')
      const progress = JSON.parse(progressData)
      
      return NextResponse.json(progress)
    } catch (fileError) {
      // File doesn't exist or can't be read
      return NextResponse.json(
        { 
          error: 'Progress data not found',
          message: 'No progress file available for this job'
        },
        { status: 404 }
      )
    }

  } catch (error) {
    console.error('Error fetching job progress:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch progress',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}