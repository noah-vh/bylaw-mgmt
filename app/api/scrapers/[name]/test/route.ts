import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase'
import { z } from 'zod'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import type { 
  ScraperStatus,
  JobId,
  MunicipalityId
} from '@/types/database'

// Validation schema for test request
const scraperTestSchema = z.object({
  municipalityId: z.number().int().positive().optional(),
  testMode: z.enum(['quick', 'full', 'validate']).optional().default('quick'),
  maxPages: z.number().min(1).max(50).optional().default(5),
  options: z.object({
    skipDownload: z.boolean().optional().default(true),
    validateOnly: z.boolean().optional().default(false),
    updateDatabase: z.boolean().optional().default(false),
    timeout: z.number().min(30000).max(300000).optional().default(120000)
  }).optional().default({})
})

// Path to the Python scraper directory
const SCRAPERS_PATH = path.join(process.cwd(), 'scrapers')

// Helper function to execute Python scripts
async function executePythonScript(
  scriptPath: string, 
  args: string[] = [],
  options: { timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 60000 // 1 minute default for tests
    
    const pythonProcess = spawn('python3', [scriptPath, ...args], {
      cwd: SCRAPERS_PATH,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONPATH: SCRAPERS_PATH }
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

// Helper function to write job progress to file
async function writeJobProgress(jobId: JobId, progress: any) {
  const progressDir = path.join(process.cwd(), 'tmp', 'job-progress')
  try {
    await fs.mkdir(progressDir, { recursive: true })
    await fs.writeFile(
      path.join(progressDir, `${jobId}.json`),
      JSON.stringify({ 
        ...progress, 
        updatedAt: new Date().toISOString(),
        type: 'scraper-test'
      }, null, 2)
    )
  } catch (error) {
    console.error('Failed to write job progress:', error)
  }
}

// Helper function to find municipality by scraper name or ID
async function getMunicipalityForScraper(scraperName: string, municipalityId?: number) {
  if (municipalityId) {
    // Get specific municipality and verify it can use this scraper
    const { data: municipality, error } = await supabase
      .from('municipalities')
      .select('id, name, scraper_name, assigned_scrapers, active_scraper, status, last_run')
      .eq('id', municipalityId)
      .single()

    if (error || !municipality) {
      throw new Error(`Municipality not found with ID: ${municipalityId}`)
    }

    // Check if municipality has the scraper assigned in the new schema
    const hasScraperAssigned = municipality.assigned_scrapers?.includes(scraperName) || 
                              municipality.active_scraper === scraperName ||
                              municipality.scraper_name === scraperName // fallback for compatibility

    if (!hasScraperAssigned) {
      const currentAssignments = municipality.assigned_scrapers?.join(', ') || municipality.scraper_name || 'none'
      throw new Error(`Municipality '${municipality.name}' does not have scraper '${scraperName}' assigned. Current assignments: ${currentAssignments}`)
    }

    return municipality
  } else {
    // Find municipality by scraper assignment using new schema first, fallback to old
    let { data: municipality, error } = await supabase
      .from('municipalities')
      .select('id, name, scraper_name, assigned_scrapers, active_scraper, status, last_run')
      .contains('assigned_scrapers', [scraperName])
      .single()

    if (error) {
      // Fallback to old schema for compatibility
      const { data: fallbackMunicipality, error: fallbackError } = await supabase
        .from('municipalities')
        .select('id, name, scraper_name, assigned_scrapers, active_scraper, status, last_run')
        .eq('scraper_name', scraperName)
        .single()

      if (fallbackError) {
        throw new Error(`No municipality found assigned to scraper: ${scraperName}`)
      }

      municipality = fallbackMunicipality
    }

    return municipality
  }
}

// Helper function to check if scraper exists in filesystem
async function validateScraperExists(scraperName: string): Promise<boolean> {
  try {
    const scraperPath = path.join(SCRAPERS_PATH, `${scraperName}.py`)
    await fs.access(scraperPath)
    return true
  } catch {
    return false
  }
}

// POST /api/scrapers/[name]/test - Test individual scraper against municipality
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const scraperName = name
    const body = await request.json().catch(() => ({}))
    
    const validation = scraperTestSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid test request',
          details: validation.error.format(),
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    const { municipalityId, testMode, maxPages, options } = validation.data

    // Validate scraper exists in filesystem
    const scraperExists = await validateScraperExists(scraperName)
    if (!scraperExists) {
      return NextResponse.json(
        { 
          error: 'Scraper not found',
          message: `Scraper file '${scraperName}.py' not found in filesystem`,
          timestamp: new Date().toISOString()
        },
        { status: 404 }
      )
    }

    // Find municipality for this scraper
    let municipality
    try {
      municipality = await getMunicipalityForScraper(scraperName, municipalityId)
    } catch (error) {
      return NextResponse.json(
        { 
          error: 'Municipality/Scraper mismatch',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        },
        { status: 404 }
      )
    }

    // Generate job ID for tracking
    const jobId = `scraper-test-${scraperName}-${Date.now()}` as JobId

    // Update municipality status to testing
    await supabase
      .from('municipalities')
      .update({ 
        status: 'testing',
        updated_at: new Date().toISOString()
      })
      .eq('id', municipality.id)

    // Write initial progress
    await writeJobProgress(jobId, {
      jobId,
      scraperName,
      municipalityId: municipality.id,
      municipalityName: municipality.name,
      status: 'running',
      progress: 0,
      message: `Starting ${testMode} test for scraper '${scraperName}' against municipality '${municipality.name}'`,
      stage: 'initializing',
      startTime: new Date().toISOString()
    })

    // Start the test process asynchronously
    setImmediate(async () => {
      let testResult = {
        success: false,
        documentsFound: 0,
        errors: [] as string[],
        duration: 0,
        stage: 'testing'
      }

      const startTime = Date.now()

      try {
        // Update progress - starting test
        await writeJobProgress(jobId, {
          jobId,
          scraperName,
          municipalityId: municipality.id,
          municipalityName: municipality.name,
          status: 'running',
          progress: 10,
          message: 'Executing scraper test',
          stage: 'testing'
        })

        // Prepare Python script arguments
        const args = [
          '--municipality-id', municipality.id.toString(),
          '--test-mode', testMode,
          '--max-pages', maxPages.toString()
        ]

        if (options.skipDownload) args.push('--skip-download')
        if (options.validateOnly) args.push('--validate-only')
        if (!options.updateDatabase) args.push('--dry-run')

        // Execute the scraper test with specific scraper name
        const { stdout, stderr, exitCode } = await executePythonScript(
          'local_runner.py',
          [...args, '--scraper-name', scraperName],
          { timeout: options.timeout || 120000 }
        )

        const duration = Date.now() - startTime

        // Parse test results
        try {
          if (stdout) {
            const result = JSON.parse(stdout)
            testResult = {
              success: exitCode === 0,
              documentsFound: result.documents_found || 0,
              errors: result.errors || (stderr ? [stderr] : []),
              duration: Math.round(duration / 1000),
              stage: 'completed'
            }
          }
        } catch (parseError) {
          testResult = {
            success: exitCode === 0,
            documentsFound: 0,
            errors: stderr ? [stderr] : ['Failed to parse test results'],
            duration: Math.round(duration / 1000),
            stage: 'completed'
          }
        }

        // Update municipality status based on test result
        const newStatus = testResult.success ? 'confirmed' : 'error'
        await supabase
          .from('municipalities')
          .update({ 
            status: newStatus,
            last_run: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', municipality.id)

        // Create scrape log entry
        await supabase
          .from('scrape_logs')
          .insert({
            municipality_id: municipality.id,
            status: testResult.success ? 'success' : 'error',
            documents_found: testResult.documentsFound,
            documents_new: 0, // Test runs don't create new documents
            error_message: testResult.errors.join('; ') || null,
            duration_seconds: testResult.duration,
            scrape_date: new Date().toISOString()
          })

        // Write final progress
        await writeJobProgress(jobId, {
          jobId,
          scraperName,
          municipalityId: municipality.id,
          municipalityName: municipality.name,
          status: testResult.success ? 'completed' : 'failed',
          progress: 100,
          message: testResult.success 
            ? `Test completed successfully - found ${testResult.documentsFound} documents`
            : `Test failed: ${testResult.errors.join(', ')}`,
          stage: 'completed',
          endTime: new Date().toISOString(),
          result: testResult,
          error: testResult.success ? null : testResult.errors.join('; ')
        })

      } catch (error) {
        console.error('Error in scraper test process:', error)
        
        // Update municipality status to error
        await supabase
          .from('municipalities')
          .update({ 
            status: 'error',
            updated_at: new Date().toISOString()
          })
          .eq('id', municipality.id)

        // Write error progress
        await writeJobProgress(jobId, {
          jobId,
          scraperName,
          municipalityId: municipality.id,
          municipalityName: municipality.name,
          status: 'failed',
          progress: 0,
          message: 'Test process encountered an error',
          stage: 'error',
          endTime: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    return NextResponse.json(
      {
        data: {
          jobId,
          scraperName,
          municipalityId: municipality.id,
          municipalityName: municipality.name,
          testMode,
          maxPages,
          options,
          progressUrl: `/api/processing/progress/${jobId}`
        },
        message: 'Scraper test started successfully',
        timestamp: new Date().toISOString()
      },
      { status: 201 }
    )

  } catch (error) {
    console.error('Unexpected error in POST /api/scrapers/[name]/test:', error)
    return NextResponse.json(
      { 
        error: 'Failed to start scraper test',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}