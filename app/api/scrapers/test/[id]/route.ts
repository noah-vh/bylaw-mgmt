import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase'
import { z } from 'zod'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import type { 
  Scraper,
  ScraperId,
  JobId,
  SuccessResponse,
  ErrorResponse
} from '@/types/database'

// Validation schema for test request
const scraperTestSchema = z.object({
  testMode: z.enum(['quick', 'full', 'validate']).optional().default('quick'),
  maxPages: z.number().min(1).max(50).optional().default(5),
  options: z.object({
    skipDownload: z.boolean().optional().default(true),
    validateOnly: z.boolean().optional().default(false),
    updateDatabase: z.boolean().optional().default(false),
    timeout: z.number().min(30000).max(300000).optional().default(120000) // 30s to 5min
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
    const timeout = options.timeout || 120000 // 2 minutes default
    
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
        type: 'scraper-test-by-id'
      }, null, 2)
    )
  } catch (error) {
    console.error('Failed to write job progress:', error)
  }
}

// Helper function to fetch scraper by ID with municipality data
async function fetchScraperById(scraperId: ScraperId) {
  const { data: scraper, error } = await supabase
    .from('scrapers')
    .select(`
      id,
      name,
      version,
      status,
      municipality_id,
      module_name,
      class_name,
      is_active,
      municipalities!scrapers_municipality_id_fkey (
        id,
        name,
        website_url,
        scraper_name,
        status as municipality_status
      )
    `)
    .eq('id', scraperId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch scraper: ${error.message}`)
  }

  return scraper
}

// POST /api/scrapers/test/[id] - Test individual scraper by ID and update database
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const scraperId = parseInt(params.id) as ScraperId
    
    if (isNaN(scraperId) || scraperId <= 0) {
      return NextResponse.json(
        { 
          error: 'Invalid scraper ID',
          message: 'Scraper ID must be a positive integer',
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    
    const validation = scraperTestSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid test request',
          details: validation.error.format(),
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 400 }
      )
    }

    const { testMode, maxPages, options } = validation.data

    // Fetch scraper details
    let scraper
    try {
      scraper = await fetchScraperById(scraperId)
    } catch (error) {
      return NextResponse.json(
        { 
          error: 'Scraper not found',
          message: `No scraper found with ID: ${scraperId}`,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 404 }
      )
    }

    // Check if scraper is active
    if (!scraper.is_active) {
      return NextResponse.json(
        { 
          error: 'Scraper is inactive',
          message: `Scraper '${scraper.name}' is currently inactive and cannot be tested`,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 400 }
      )
    }

    // Check if municipality exists
    if (!scraper.municipalities) {
      return NextResponse.json(
        { 
          error: 'Municipality not found',
          message: `No municipality found for scraper '${scraper.name}'`,
          timestamp: new Date().toISOString()
        } satisfies ErrorResponse,
        { status: 404 }
      )
    }

    const municipality = scraper.municipalities
    const jobId = `scraper-test-${scraperId}-${Date.now()}` as JobId

    // Update scraper status to testing
    await supabase
      .from('scrapers')
      .update({ 
        status: 'testing',
        updated_at: new Date().toISOString()
      })
      .eq('id', scraperId)

    // Also update municipality status to testing
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
      scraperId,
      scraperName: scraper.name,
      municipalityId: municipality.id,
      municipalityName: municipality.name,
      status: 'running',
      progress: 0,
      message: `Starting ${testMode} test for scraper '${scraper.name}'`,
      stage: 'initializing',
      startTime: new Date().toISOString(),
      testMode,
      maxPages,
      options
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
          scraperId,
          scraperName: scraper.name,
          municipalityId: municipality.id,
          municipalityName: municipality.name,
          status: 'running',
          progress: 10,
          message: 'Executing scraper test',
          stage: 'testing'
        })

        // Prepare Python script arguments for the specific scraper
        const args = [
          '--scraper-id', scraperId.toString(),
          '--municipality-id', municipality.id.toString(),
          '--test-mode', testMode,
          '--max-pages', maxPages.toString()
        ]

        if (options.skipDownload) args.push('--skip-download')
        if (options.validateOnly) args.push('--validate-only')
        if (!options.updateDatabase) args.push('--dry-run')

        // Execute the scraper test using the local runner
        const { stdout, stderr, exitCode } = await executePythonScript(
          'local_runner.py',
          args,
          { timeout: options.timeout || 120000 }
        )

        const duration = Date.now() - startTime

        // Parse test results
        try {
          if (stdout) {
            const result = JSON.parse(stdout)
            testResult = {
              success: exitCode === 0 && (result.success !== false),
              documentsFound: result.documents_found || result.documentsFound || 0,
              errors: result.errors || (stderr ? [stderr] : []),
              duration: Math.round(duration / 1000),
              stage: 'completed'
            }
          } else {
            testResult = {
              success: exitCode === 0,
              documentsFound: 0,
              errors: stderr ? [stderr] : ['No output from scraper test'],
              duration: Math.round(duration / 1000),
              stage: 'completed'
            }
          }
        } catch (parseError) {
          testResult = {
            success: false,
            documentsFound: 0,
            errors: [
              'Failed to parse test results',
              stderr || 'No error details available',
              stdout ? `Raw output: ${stdout}` : 'No output from test'
            ].filter(Boolean),
            duration: Math.round(duration / 1000),
            stage: 'completed'
          }
        }

        // Update progress - processing results
        await writeJobProgress(jobId, {
          jobId,
          scraperId,
          scraperName: scraper.name,
          municipalityId: municipality.id,
          municipalityName: municipality.name,
          status: 'running',
          progress: 80,
          message: 'Processing test results',
          stage: 'processing-results'
        })

        // Calculate success rate (simple heuristic based on documents found and errors)
        let successRate = 0
        if (testResult.success) {
          if (testResult.documentsFound > 0) {
            successRate = Math.min(100, 70 + (testResult.documentsFound * 3))
          } else {
            successRate = 50 // Success but no documents might be expected for some scrapers
          }
        } else {
          successRate = Math.max(0, 30 - (testResult.errors.length * 10))
        }

        // Update scraper status and test results in database
        const newScraperStatus = testResult.success ? 'validated' : 'failed'
        const testNotes = testResult.success 
          ? `Test passed: ${testResult.documentsFound} documents found in ${testResult.duration}s`
          : `Test failed: ${testResult.errors.slice(0, 3).join('; ')}`

        await supabase
          .from('scrapers')
          .update({ 
            status: newScraperStatus,
            last_tested: new Date().toISOString(),
            success_rate: successRate,
            test_notes: testNotes,
            updated_at: new Date().toISOString()
          })
          .eq('id', scraperId)

        // Update municipality status
        const newMunicipalityStatus = testResult.success ? 'confirmed' : 'error'
        await supabase
          .from('municipalities')
          .update({ 
            status: newMunicipalityStatus,
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
            error_message: testResult.errors.length > 0 ? testResult.errors.join('; ') : null,
            duration_seconds: testResult.duration,
            scrape_date: new Date().toISOString()
          })

        // Write final progress
        await writeJobProgress(jobId, {
          jobId,
          scraperId,
          scraperName: scraper.name,
          municipalityId: municipality.id,
          municipalityName: municipality.name,
          status: testResult.success ? 'completed' : 'failed',
          progress: 100,
          message: testResult.success 
            ? `Test completed successfully - found ${testResult.documentsFound} documents`
            : `Test failed: ${testResult.errors.slice(0, 2).join(', ')}`,
          stage: 'completed',
          endTime: new Date().toISOString(),
          result: {
            ...testResult,
            successRate,
            newScraperStatus,
            testNotes
          },
          error: testResult.success ? null : testResult.errors.join('; ')
        })

      } catch (error) {
        console.error('Error in scraper test process:', error)
        
        // Update scraper status to failed
        await supabase
          .from('scrapers')
          .update({ 
            status: 'failed',
            last_tested: new Date().toISOString(),
            success_rate: 0,
            test_notes: `Test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', scraperId)

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
          scraperId,
          scraperName: scraper.name,
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

    // Return immediate response with job tracking info
    return NextResponse.json(
      {
        data: {
          success: true,
          documentsFound: 0, // Will be updated asynchronously
          errors: [],
          duration: 0, // Will be updated asynchronously
          jobId,
          scraperId,
          scraperName: scraper.name,
          municipalityId: municipality.id,
          municipalityName: municipality.name,
          testMode,
          maxPages,
          options,
          progressUrl: `/api/processing/progress/${jobId}`,
          status: 'started'
        },
        message: 'Scraper test started successfully',
        timestamp: new Date().toISOString()
      } satisfies SuccessResponse<{
        success: boolean;
        documentsFound: number;
        errors: string[];
        duration: number;
        jobId: JobId;
        scraperId: ScraperId;
        scraperName: string;
        municipalityId: number;
        municipalityName: string;
        testMode: string;
        maxPages: number;
        options: any;
        progressUrl: string;
        status: string;
      }>,
      { status: 201 }
    )

  } catch (error) {
    console.error('Unexpected error in POST /api/scrapers/test/[id]:', error)
    return NextResponse.json(
      { 
        error: 'Failed to start scraper test',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      } satisfies ErrorResponse,
      { status: 500 }
    )
  }
}