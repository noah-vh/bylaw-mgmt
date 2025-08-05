import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'
import { z } from 'zod'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import type { 
  ProcessingOperation,
  JobId,
  MunicipalityId,
  JobPriority,
  BackgroundJob
} from '@/types/database'

// Validation schema for bulk processing request
const bulkProcessingSchema = z.object({
  operation: z.enum(['scrape', 'extract', 'analyze', 'full_pipeline']),
  municipalitySelection: z.union([
    z.literal('all'),
    z.literal('active'),
    z.array(z.number().int().positive())
  ]),
  options: z.object({
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
    batchSize: z.number().min(1).max(10).optional().default(5),
    skipExisting: z.boolean().optional().default(true),
    validateResults: z.boolean().optional().default(true),
    retryFailedJobs: z.boolean().optional().default(false),
    maxRetries: z.number().min(0).max(3).optional().default(1),
    timeoutMinutes: z.number().min(5).max(120).optional().default(30)
  }).optional().default({})
})

// Path to the Python scraper directory
const SCRAPERS_PATH = path.join(process.cwd(), 'scrapers')

// Helper function to execute Python scripts with progress tracking
async function executePythonScript(
  scriptName: string, 
  args: string[] = [],
  options: { 
    timeout?: number,
    jobId?: JobId,
    onProgress?: (progress: any) => void
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 1800000 // 30 minutes default
    
    const pythonProcess = spawn('python3', [scriptName, ...args], {
      cwd: SCRAPERS_PATH,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { 
        ...process.env, 
        PYTHONPATH: SCRAPERS_PATH,
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      }
    })

    let stdout = ''
    let stderr = ''
    
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString()
      stdout += output
      
      // Try to parse progress updates from Python output
      const lines = output.split('\n')
      for (const line of lines) {
        if (line.startsWith('PROGRESS:')) {
          try {
            const progressData = JSON.parse(line.substring(9))
            if (options.onProgress) {
              options.onProgress(progressData)
            }
          } catch (e) {
            // Ignore invalid progress data
          }
        }
      }
    })
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    const timeoutId = setTimeout(() => {
      pythonProcess.kill('SIGTERM')
      reject(new Error(`Python script timeout after ${timeout}ms`))
    }, timeout)
    
    pythonProcess.on('close', (code) => {
      clearTimeout(timeoutId)
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0
      })
    })
    
    pythonProcess.on('error', (error) => {
      clearTimeout(timeoutId)
      reject(error)
    })
  })
}

// Helper function to write job progress to file
async function writeJobProgress(jobId: JobId, progress: any) {
  const progressDir = path.join(process.cwd(), 'tmp', 'job-progress')
  try {
    await fs.mkdir(progressDir, { recursive: true })
    const progressData = {
      ...progress,
      jobId,
      updatedAt: new Date().toISOString(),
      type: 'bulk-processing'
    }
    
    await fs.writeFile(
      path.join(progressDir, `${jobId}.json`),
      JSON.stringify(progressData, null, 2)
    )
  } catch (error) {
    console.error('Failed to write job progress:', error)
  }
}

// Helper function to resolve municipality selection
async function resolveMunicipalityIds(selection: any): Promise<MunicipalityId[]> {
  if (Array.isArray(selection)) {
    return selection as MunicipalityId[]
  }

  let query = supabase
    .from('municipalities')
    .select('id')
    .not('scraper_name', 'is', null)

  if (selection === 'active') {
    query = query.eq('schedule_active', true)
  }
  // For 'all', we don't add additional filters - just require scraper_name

  const { data: municipalities, error } = await query

  if (error) {
    throw new Error(`Failed to resolve municipalities: ${error.message}`)
  }

  return municipalities?.map(m => m.id as MunicipalityId) || []
}

// Helper function to create background job
async function createBackgroundJob(
  operation: ProcessingOperation,
  municipalityIds: MunicipalityId[],
  options: any = {}
): Promise<BackgroundJob> {
  const jobId = `bulk-${operation}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}` as JobId
  
  const { data: job, error } = await supabase
    .from('background_jobs')
    .insert({
      id: jobId,
      type: operation === 'full_pipeline' ? 'processing' : operation as any,
      status: 'queued',
      municipality_id: municipalityIds.length === 1 ? municipalityIds[0] : null,
      progress: 0,
      progress_message: `Bulk ${operation} job queued for processing`,
      result_data: { 
        operation,
        municipalityIds, 
        options,
        totalMunicipalities: municipalityIds.length
      }
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create background job: ${error.message}`)
  }

  return {
    ...job,
    isRunning: job.status === 'running',
    isCompleted: job.status === 'completed',
    isFailed: job.status === 'failed'
  }
}

// GET /api/processing/bulk - Get bulk operation status and capabilities
export async function GET(request: NextRequest) {
  try {
    // Get recent bulk jobs
    const { data: recentJobs, error } = await supabase
      .from('background_jobs')
      .select('*')
      .in('type', ['scraper', 'extraction', 'analysis', 'processing'])
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching recent jobs:', error)
    }

    // Get available municipalities count
    const { count: totalMunicipalities } = await supabase
      .from('municipalities')
      .select('*', { count: 'exact', head: true })
      .not('scraper_name', 'is', null)

    const { count: activeMunicipalities } = await supabase
      .from('municipalities')
      .select('*', { count: 'exact', head: true })
      .eq('schedule_active', true)
      .not('scraper_name', 'is', null)

    return NextResponse.json({
      data: {
        capabilities: {
          operations: ['scrape', 'extract', 'analyze', 'full_pipeline'],
          selectionOptions: ['all', 'active', 'custom'],
          maxBatchSize: 10,
          maxTimeoutMinutes: 120
        },
        stats: {
          totalMunicipalities: totalMunicipalities || 0,
          activeMunicipalities: activeMunicipalities || 0
        },
        recentJobs: recentJobs || []
      },
      message: 'Bulk processing capabilities retrieved successfully',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Unexpected error in GET /api/processing/bulk:', error)
    return NextResponse.json(
      { 
        error: 'Failed to retrieve bulk processing information',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// POST /api/processing/bulk - Start bulk processing operation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const validation = bulkProcessingSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid bulk processing request',
          details: validation.error.format(),
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    const { operation, municipalitySelection, options } = validation.data

    // Resolve municipality IDs
    let municipalityIds: MunicipalityId[] = []
    try {
      municipalityIds = await resolveMunicipalityIds(municipalitySelection)
    } catch (error) {
      return NextResponse.json(
        { 
          error: 'Failed to resolve municipalities',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    if (municipalityIds.length === 0) {
      return NextResponse.json(
        { 
          error: 'No municipalities selected',
          message: 'No valid municipalities found for the specified selection',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    // Create background job
    const job = await createBackgroundJob(operation, municipalityIds, options)

    // Write initial progress
    await writeJobProgress(job.id, {
      status: 'queued',
      progress: 0,
      message: `Bulk ${operation} job created`,
      stage: 'queued',
      operation,
      municipalityIds,
      totalMunicipalities: municipalityIds.length,
      completedMunicipalities: 0,
      failedMunicipalities: 0,
      startTime: new Date().toISOString()
    })

    // Start the bulk processing asynchronously
    setImmediate(async () => {
      try {
        // Update job status to running
        await supabase
          .from('background_jobs')
          .update({ 
            status: 'running',
            started_at: new Date().toISOString(),
            progress_message: `Starting bulk ${operation} process`
          })
          .eq('id', job.id)

        await writeJobProgress(job.id, {
          status: 'running',
          progress: 5,
          message: `Starting bulk ${operation} process`,
          stage: 'starting'
        })

        // Map operation to Python script
        const scriptMap: Record<ProcessingOperation, string> = {
          'scrape': 'batch_coordinator.py',
          'extract': 'batch_coordinator.py',
          'analyze': 'batch_coordinator.py',
          'full_pipeline': 'batch_coordinator.py'
        }

        const scriptName = scriptMap[operation]

        // Prepare Python script arguments
        const args = [
          '--operation', operation,
          '--municipality-ids', municipalityIds.join(','),
          '--batch-size', options.batchSize?.toString() || '5',
          '--priority', options.priority || 'normal'
        ]

        if (options.skipExisting) args.push('--skip-existing')
        if (options.validateResults) args.push('--validate-results')
        if (options.retryFailedJobs) args.push('--retry-failed')
        if (options.maxRetries) args.push('--max-retries', options.maxRetries.toString())

        // Execute the bulk processing script with progress tracking
        const { stdout, stderr, exitCode } = await executePythonScript(
          scriptName,
          args,
          { 
            timeout: (options.timeoutMinutes || 30) * 60 * 1000,
            jobId: job.id,
            onProgress: (progressData) => {
              // Update progress in real-time
              writeJobProgress(job.id, {
                status: 'running',
                ...progressData
              })
            }
          }
        )

        // Parse final results
        let result: any = { 
          output: stdout, 
          errors: stderr ? [stderr] : [],
          operation,
          municipalityIds,
          totalMunicipalities: municipalityIds.length
        }

        try {
          if (stdout) {
            const parsedResult = JSON.parse(stdout)
            result = { ...result, ...parsedResult }
          }
        } catch (parseError) {
          console.warn('Failed to parse bulk processing output, using raw output')
        }

        // Update job status based on result
        const jobStatus = exitCode === 0 ? 'completed' : 'failed'
        const errorMessage = exitCode !== 0 ? stderr || 'Bulk processing failed' : null

        await supabase
          .from('background_jobs')
          .update({
            status: jobStatus,
            completed_at: new Date().toISOString(),
            progress: 100,
            progress_message: jobStatus === 'completed' 
              ? `Bulk ${operation} completed successfully` 
              : `Bulk ${operation} failed`,
            error_message: errorMessage,
            result_data: result
          })
          .eq('id', job.id)

        await writeJobProgress(job.id, {
          status: jobStatus,
          progress: 100,
          message: jobStatus === 'completed' 
            ? `Bulk ${operation} completed successfully`
            : `Bulk ${operation} failed`,
          stage: 'completed',
          endTime: new Date().toISOString(),
          result,
          error: errorMessage
        })

      } catch (error) {
        console.error('Error in bulk processing:', error)
        
        await supabase
          .from('background_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: error instanceof Error ? error.message : 'Unknown error',
            progress_message: 'Bulk processing encountered an error'
          })
          .eq('id', job.id)

        await writeJobProgress(job.id, {
          status: 'failed',
          progress: 0,
          message: 'Bulk processing encountered an error',
          stage: 'error',
          endTime: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    return NextResponse.json(
      {
        data: {
          ...job,
          operation,
          municipalityIds,
          totalMunicipalities: municipalityIds.length,
          options,
          progressUrl: `/api/processing/progress/${job.id}`
        },
        message: `Bulk ${operation} job started successfully`,
        timestamp: new Date().toISOString()
      },
      { status: 201 }
    )

  } catch (error) {
    console.error('Unexpected error in POST /api/processing/bulk:', error)
    return NextResponse.json(
      { 
        error: 'Failed to start bulk processing job',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}