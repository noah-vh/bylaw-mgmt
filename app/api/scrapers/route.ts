import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'
import { getCachedScrapersFromFilesystem, getScraperStatistics } from '../../../lib/scraper-scanner'
import { z } from 'zod'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import type { 
  ScraperInfo,
  ScrapingJobRequest,
  BackgroundJob,
  ScraperStatus,
  JobId,
  MunicipalityId,
  MunicipalityStatus
} from '@/types/database'

// Validation schemas
const scraperStatusUpdateSchema = z.object({
  scraperName: z.string().min(1),
  status: z.enum(['pending', 'testing', 'validated']).optional(),
  version: z.string().optional(),
  successRate: z.number().min(0).max(100).optional(),
  lastTestResult: z.object({
    success: z.boolean(),
    documentsFound: z.number().optional(),
    errors: z.array(z.string()).optional(),
    duration: z.number().optional()
  }).optional()
})

const scrapingJobSchema = z.object({
  municipalityIds: z.union([
    z.array(z.number().int().positive()),
    z.literal('all')
  ]),
  options: z.object({
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
    forceUpdate: z.boolean().optional().default(false),
    skipRecentlyRun: z.boolean().optional().default(true),
    scheduleNext: z.boolean().optional().default(true)
  }).optional().default({})
})

// Path to the Python scraper directory (current project scrapers)
const SCRAPERS_PATH = path.join(process.cwd(), 'scrapers')
const PYTHON_ENV_PATH = path.join(process.cwd(), 'python-env')

// Helper function to execute Python scripts
async function executePythonScript(
  scriptPath: string, 
  args: string[] = [],
  options: { timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 30000 // 30 seconds default
    
    const pythonProcess = spawn('python3', [scriptPath, ...args], {
      cwd: SCRAPERS_PATH,
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

// Helper function to get enhanced scraper status from filesystem and database
async function getEnhancedScraperStatus(forceRefresh = false): Promise<{
  scrapers: ScraperInfo[]
  stats: any
  summary: any
}> {
  try {
    // Get scrapers from filesystem with database integration
    const { scrapers: filesystemScrapers, summary } = await getCachedScrapersFromFilesystem(forceRefresh)
    
    // Convert to ScraperInfo format for backward compatibility
    const scrapers: ScraperInfo[] = filesystemScrapers.map(scraper => ({
      name: scraper.name,
      displayName: scraper.displayName,
      status: scraper.status,
      municipalityId: scraper.municipalityId,
      lastRun: scraper.lastRun,
      nextRun: scraper.nextRun,
      isActive: scraper.isActive,
      description: scraper.description || `Scraper for ${scraper.displayName}`,
      capabilities: scraper.capabilities,
      version: scraper.version,
      successRate: scraper.successRate || 0,
      lastTestDate: scraper.lastTestDate,
      estimatedPages: scraper.estimatedPages || 10,
      estimatedDocuments: scraper.estimatedDocuments || 100
    }))
    
    // Generate statistics
    const stats = getScraperStatistics(filesystemScrapers)
    
    return { scrapers, stats, summary }
    
  } catch (error) {
    console.error('Error getting enhanced scraper status:', error)
    return {
      scrapers: [],
      stats: {
        total: 0,
        active: 0,
        available: 0,
        busy: 0,
        offline: 0,
        error: 0,
        averageSuccessRate: 0
      },
      summary: {
        totalFiles: 0,
        validScrapers: 0,
        registeredScrapers: 0,
        unregisteredScrapers: 0,
        orphanedRegistrations: 0,
        lastScanDate: new Date().toISOString(),
        scanDuration: 0
      }
    }
  }
}

// Helper function to create a background job
async function createBackgroundJob(
  type: 'scraper',
  municipalityIds: MunicipalityId[],
  options: any = {}
): Promise<BackgroundJob> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const { data: job, error } = await supabase
    .from('background_jobs')
    .insert({
      id: jobId,
      type,
      status: 'queued',
      municipality_id: municipalityIds.length === 1 ? municipalityIds[0] : null,
      progress: 0,
      progress_message: 'Job queued for processing',
      result_data: { 
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

// GET /api/scrapers - List available scrapers from filesystem with enhanced metadata
export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const url = new URL(request.url)
    const forceRefresh = url.searchParams.get('refresh') === 'true'
    const includeUnregistered = url.searchParams.get('includeUnregistered') !== 'false'
    const status = url.searchParams.get('status') as ScraperStatus | null
    const search = url.searchParams.get('search')
    
    // Get enhanced scraper data from filesystem
    const { scrapers: allScrapers, stats, summary } = await getEnhancedScraperStatus(forceRefresh)
    
    // Apply filters
    let filteredScrapers = allScrapers
    
    if (status) {
      filteredScrapers = filteredScrapers.filter(s => s.status === status)
    }
    
    if (search) {
      const searchLower = search.toLowerCase()
      filteredScrapers = filteredScrapers.filter(s => 
        s.name.toLowerCase().includes(searchLower) ||
        s.displayName.toLowerCase().includes(searchLower) ||
        s.description?.toLowerCase().includes(searchLower)
      )
    }
    
    // Enhanced response with filesystem scan summary
    return NextResponse.json({
      data: filteredScrapers,
      stats: {
        ...stats,
        filtered: {
          total: filteredScrapers.length,
          active: filteredScrapers.filter(s => s.isActive).length,
          available: filteredScrapers.filter(s => s.status === 'available').length,
          busy: filteredScrapers.filter(s => s.status === 'busy').length,
          offline: filteredScrapers.filter(s => s.status === 'offline').length,
          error: filteredScrapers.filter(s => s.status === 'error').length
        }
      },
      scan: summary,
      meta: {
        includeUnregistered,
        filters: {
          status,
          search
        },
        lastRefresh: forceRefresh
      },
      message: `Found ${filteredScrapers.length} scrapers (${summary.validScrapers} total from filesystem scan)`,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Unexpected error in GET /api/scrapers:', error)
    return NextResponse.json(
      { 
        error: 'Failed to retrieve scrapers',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// PATCH /api/scrapers - Update scraper status
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    
    const validation = scraperStatusUpdateSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid scraper update request',
          details: validation.error.format(),
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    const { scraperName, status, version, successRate, lastTestResult } = validation.data

    // Find municipality by scraper name
    const { data: municipality, error: findError } = await supabase
      .from('municipalities')
      .select('id, name, status')
      .eq('scraper_name', scraperName)
      .single()

    if (findError || !municipality) {
      return NextResponse.json(
        { 
          error: 'Scraper not found',
          message: `No municipality found for scraper: ${scraperName}`,
          timestamp: new Date().toISOString()
        },
        { status: 404 }
      )
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    // Map status if provided
    if (status) {
      const statusMap: Record<string, MunicipalityStatus> = {
        'pending': 'pending',
        'testing': 'testing', 
        'validated': 'confirmed'
      }
      updateData.status = statusMap[status]
    }

    // Update municipality record
    const { error: updateError } = await supabase
      .from('municipalities')
      .update(updateData)
      .eq('id', municipality.id)

    if (updateError) {
      return NextResponse.json(
        { 
          error: 'Failed to update scraper status',
          message: updateError.message,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      )
    }

    // Create scrape log entry if test result provided
    if (lastTestResult) {
      await supabase
        .from('scrape_logs')
        .insert({
          municipality_id: municipality.id,
          status: lastTestResult.success ? 'success' : 'error',
          documents_found: lastTestResult.documentsFound || 0,
          documents_new: 0, // Test runs don't create new documents
          error_message: lastTestResult.errors?.join('; ') || null,
          duration_seconds: lastTestResult.duration || null,
          scrape_date: new Date().toISOString()
        })
    }

    return NextResponse.json({
      data: {
        municipalityId: municipality.id,
        municipalityName: municipality.name,
        scraperName,
        updatedStatus: updateData.status || municipality.current_status,
        version,
        successRate,
        lastTestResult
      },
      message: 'Scraper status updated successfully',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Unexpected error in PATCH /api/scrapers:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update scraper status',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// POST /api/scrapers - Start scraping job for municipality(ies)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const validation = scrapingJobSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid scraping job request',
          details: validation.error.format(),
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    const { municipalityIds, options = {} } = validation.data

    // Get municipalities to scrape
    let targetMunicipalities: MunicipalityId[] = []
    
    if (municipalityIds === 'all') {
      const { data: allMunicipalities, error } = await supabase
        .from('municipalities')
        .select('id')
        .not('scraper_name', 'is', null)
        .eq('schedule_active', true)

      if (error) {
        return NextResponse.json(
          { 
            error: 'Failed to fetch municipalities',
            message: error.message,
            timestamp: new Date().toISOString()
          },
          { status: 500 }
        )
      }

      targetMunicipalities = allMunicipalities?.map(m => m.id) || []
    } else {
      targetMunicipalities = municipalityIds as MunicipalityId[]
    }

    if (targetMunicipalities.length === 0) {
      return NextResponse.json(
        { 
          error: 'No municipalities to scrape',
          message: 'No valid municipalities found for scraping',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    // Create background job
    const job = await createBackgroundJob('scraper', targetMunicipalities, options)

    // Start the scraping process asynchronously
    setImmediate(async () => {
      try {
        // Update job status to running
        await supabase
          .from('background_jobs')
          .update({ 
            status: 'running',
            started_at: new Date().toISOString(),
            progress_message: 'Starting scraping process'
          })
          .eq('id', job.id)

        await writeJobProgress(job.id, { 
          status: 'running', 
          progress: 0, 
          message: 'Starting scraping process' 
        })

        // Execute Python scraping script
        const municipalityArgs = targetMunicipalities.map(id => `--municipality-id=${id}`)
        const optionArgs = [
          options.forceUpdate ? '--force-update' : '',
          options.skipRecentlyRun ? '--skip-recent' : '',
          options.scheduleNext ? '--schedule-next' : '',
          `--priority=${options.priority || 'normal'}`
        ].filter(Boolean)

        const { stdout, stderr, exitCode } = await executePythonScript(
          path.join(SCRAPERS_PATH, 'scripts', 'run_scrapers.py'),
          [...municipalityArgs, ...optionArgs],
          { timeout: 300000 } // 5 minutes timeout
        )

        let result: any = { output: stdout, errors: stderr ? [stderr] : [] }
        try {
          if (stdout) {
            result = JSON.parse(stdout)
          }
        } catch (parseError) {
          console.warn('Failed to parse scraper output, using raw output')
        }

        // Update job status based on result
        const jobStatus = exitCode === 0 ? 'completed' : 'failed'
        const errorMessage = exitCode !== 0 ? stderr || 'Scraping process failed' : null

        await supabase
          .from('background_jobs')
          .update({
            status: jobStatus,
            completed_at: new Date().toISOString(),
            progress: 100,
            progress_message: jobStatus === 'completed' ? 'Scraping completed successfully' : 'Scraping failed',
            error_message: errorMessage,
            result_data: result
          })
          .eq('id', job.id)

        await writeJobProgress(job.id, { 
          status: jobStatus, 
          progress: 100, 
          message: jobStatus === 'completed' ? 'Scraping completed successfully' : 'Scraping failed',
          error: errorMessage,
          result 
        })

      } catch (error) {
        console.error('Error in scraping process:', error)
        
        await supabase
          .from('background_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: error instanceof Error ? error.message : 'Unknown error',
            progress_message: 'Scraping process encountered an error'
          })
          .eq('id', job.id)

        await writeJobProgress(job.id, { 
          status: 'failed', 
          error: error instanceof Error ? error.message : 'Unknown error',
          message: 'Scraping process encountered an error'
        })
      }
    })

    return NextResponse.json(
      {
        data: job,
        message: 'Scraping job started successfully',
        timestamp: new Date().toISOString()
      },
      { status: 201 }
    )

  } catch (error) {
    console.error('Unexpected error in POST /api/scrapers:', error)
    return NextResponse.json(
      { 
        error: 'Failed to start scraping job',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}