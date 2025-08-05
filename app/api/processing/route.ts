import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'
import { z } from 'zod'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import type { 
  ProcessingJobRequest,
  BackgroundJob,
  ProcessingOperation,
  JobId,
  MunicipalityId,
  DocumentId
} from '@/types/database'

// Validation schemas
const processingJobSchema = z.object({
  operation: z.enum(['scrape', 'extract', 'analyze', 'full_pipeline']),
  municipalityIds: z.array(z.number().int().positive()).optional(),
  documentIds: z.array(z.number().int().positive()).optional(),
  options: z.object({
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
    skipExisting: z.boolean().optional().default(false),
    retryFailedJobs: z.boolean().optional().default(true),
    validateResults: z.boolean().optional().default(true),
    batchSize: z.number().int().positive().max(100).optional().default(10)
  }).optional().default({})
})

// Path to the Python processing scripts
const PROCESSING_PATH = path.join(process.cwd(), '../bylaw-portal')

// Helper function to execute Python scripts
async function executePythonScript(
  scriptPath: string, 
  args: string[] = [],
  options: { timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 60000 // 1 minute default for processing
    
    const pythonProcess = spawn('python3', [scriptPath, ...args], {
      cwd: PROCESSING_PATH,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString()
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

// Helper function to create a background job
async function createBackgroundJob(
  type: 'processing' | 'extraction',
  operation: ProcessingOperation,
  municipalityIds?: MunicipalityId[],
  documentIds?: DocumentId[],
  options: any = {}
): Promise<BackgroundJob> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const { data: job, error } = await supabase
    .from('background_jobs')
    .insert({
      id: jobId,
      type,
      status: 'queued',
      municipality_id: municipalityIds && municipalityIds.length === 1 ? municipalityIds[0] : null,
      document_id: documentIds && documentIds.length === 1 ? documentIds[0] : null,
      progress: 0,
      progress_message: 'Job queued for processing',
      result_data: { 
        operation,
        municipalityIds: municipalityIds || [],
        documentIds: documentIds || [],
        options,
        totalItems: (municipalityIds?.length || 0) + (documentIds?.length || 0)
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

// Helper function to write job progress to file (for offline operation)
async function writeJobProgress(jobId: JobId, progress: any) {
  const progressDir = path.join(process.cwd(), 'tmp', 'job-progress')
  try {
    await fs.mkdir(progressDir, { recursive: true })
    await fs.writeFile(
      path.join(progressDir, `${jobId}.json`),
      JSON.stringify({ ...progress, updatedAt: new Date().toISOString() })
    )
  } catch (error) {
    console.error('Failed to write job progress:', error)
  }
}

// Helper function to get script path and arguments for operation
function getOperationConfig(operation: ProcessingOperation, options: any) {
  const baseConfig = {
    scrape: {
      script: 'scripts/run_scrapers.py',
      timeout: 300000 // 5 minutes
    },
    extract: {
      script: 'scripts/extract_documents.py',
      timeout: 600000 // 10 minutes
    },
    analyze: {
      script: 'scripts/analyze_documents.py',
      timeout: 900000 // 15 minutes
    },
    full_pipeline: {
      script: 'scripts/run_full_pipeline.py',
      timeout: 1800000 // 30 minutes
    }
  }

  const config = baseConfig[operation]
  if (!config) {
    throw new Error(`Unknown operation: ${operation}`)
  }

  return config
}

// POST /api/processing - Start extraction/analysis workflows
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const validation = processingJobSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid processing job request',
          details: validation.error.format(),
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    const { operation, municipalityIds = [], documentIds = [], options = {} } = validation.data

    // Validate that we have either municipalities or documents
    if (municipalityIds.length === 0 && documentIds.length === 0) {
      return NextResponse.json(
        { 
          error: 'No targets specified',
          message: 'Must specify either municipalityIds or documentIds',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    // Determine job type based on operation
    const jobType = operation === 'extract' ? 'extraction' : 'processing'

    // Create background job
    const job = await createBackgroundJob(
      jobType, 
      operation, 
      municipalityIds.length > 0 ? municipalityIds as any : undefined,
      documentIds.length > 0 ? documentIds as any : undefined,
      options
    )

    // Start the processing workflow asynchronously
    setImmediate(async () => {
      try {
        // Update job status to running
        await supabase
          .from('background_jobs')
          .update({ 
            status: 'running',
            started_at: new Date().toISOString(),
            progress_message: `Starting ${operation} operation`
          })
          .eq('id', job.id)

        await writeJobProgress(job.id, { 
          status: 'running', 
          progress: 0, 
          message: `Starting ${operation} operation`
        })

        // Get operation configuration
        const operationConfig = getOperationConfig(operation, options)

        // Build arguments for Python script
        const args: string[] = []
        
        if (municipalityIds.length > 0) {
          args.push(...municipalityIds.map(id => `--municipality-id=${id}`))
        }
        
        if (documentIds.length > 0) {
          args.push(...documentIds.map(id => `--document-id=${id}`))
        }

        // Add options as arguments
        if ((options as any).priority) args.push(`--priority=${(options as any).priority}`)
        if ((options as any).skipExisting) args.push('--skip-existing')
        if ((options as any).retryFailedJobs) args.push('--retry-failed')
        if ((options as any).validateResults) args.push('--validate-results')
        if ((options as any).batchSize) args.push(`--batch-size=${(options as any).batchSize}`)

        // Execute Python processing script
        const { stdout, stderr, exitCode } = await executePythonScript(
          path.join(PROCESSING_PATH, operationConfig.script),
          args,
          { timeout: operationConfig.timeout }
        )

        let result: any = { output: stdout, errors: stderr ? [stderr] : [] }
        try {
          if (stdout) {
            result = JSON.parse(stdout)
          }
        } catch (parseError) {
          console.warn('Failed to parse processing output, using raw output')
        }

        // Update job status based on result
        const jobStatus = exitCode === 0 ? 'completed' : 'failed'
        const errorMessage = exitCode !== 0 ? stderr || `${operation} process failed` : null

        await supabase
          .from('background_jobs')
          .update({
            status: jobStatus,
            completed_at: new Date().toISOString(),
            progress: 100,
            progress_message: jobStatus === 'completed' 
              ? `${operation} completed successfully` 
              : `${operation} failed`,
            error_message: errorMessage,
            result_data: result
          })
          .eq('id', job.id)

        await writeJobProgress(job.id, { 
          status: jobStatus, 
          progress: 100, 
          message: jobStatus === 'completed' 
            ? `${operation} completed successfully` 
            : `${operation} failed`,
          error: errorMessage,
          result 
        })

        // Update document statuses if applicable
        if (jobStatus === 'completed' && documentIds.length > 0) {
          const statusUpdates: any = {}
          
          if (operation === 'extract') {
            statusUpdates.extraction_status = 'completed'
          } else if (operation === 'analyze') {
            statusUpdates.analysis_status = 'completed'
            statusUpdates.content_analyzed = true
          }

          if (Object.keys(statusUpdates).length > 0) {
            await supabase
              .from('pdf_documents')
              .update(statusUpdates)
              .in('id', documentIds)
          }
        }

      } catch (error) {
        console.error(`Error in ${operation} process:`, error)
        
        await supabase
          .from('background_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: error instanceof Error ? error.message : 'Unknown error',
            progress_message: `${operation} process encountered an error`
          })
          .eq('id', job.id)

        await writeJobProgress(job.id, { 
          status: 'failed', 
          error: error instanceof Error ? error.message : 'Unknown error',
          message: `${operation} process encountered an error`
        })
      }
    })

    return NextResponse.json(
      {
        data: job,
        message: `${operation} job started successfully`,
        timestamp: new Date().toISOString()
      },
      { status: 201 }
    )

  } catch (error) {
    console.error('Unexpected error in POST /api/processing:', error)
    return NextResponse.json(
      { 
        error: 'Failed to start processing job',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}