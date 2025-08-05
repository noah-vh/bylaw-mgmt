import { spawn, ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import type {
  BulkJobId,
  BulkProcessingOperation,
  MunicipalityId,
  JobStatus,
  ProgressFileData,
  BulkProcessingJobResult,
  createBulkJobId
} from '@/types/database'

// ============================================================================
// CONFIGURATION
// ============================================================================

const PYTHON_ENV_PATH = process.env.PYTHON_ENV_PATH || path.join(process.cwd(), 'python-env')
const PYTHON_EXECUTABLE = path.join(PYTHON_ENV_PATH, 'bin', 'python')
const SCRAPERS_DIR = path.join(process.cwd(), 'scrapers')
const PROGRESS_DIR = path.join(process.cwd(), 'scraper_output', 'progress')
const RESULTS_DIR = path.join(process.cwd(), 'scraper_output', 'results')
const LOGS_DIR = path.join(process.cwd(), 'scraper_output', 'logs')

// Supabase connection configuration for Python scripts
const SUPABASE_CONFIG = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY, // Server-side key for Python
}

// ============================================================================
// TYPES
// ============================================================================

interface PythonScriptOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeout?: number
  onStdout?: (data: string) => void
  onStderr?: (data: string) => void
  onProgress?: (progress: ProgressFileData) => void
}

interface ScriptResult {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  duration: number
  error?: Error
}

// ============================================================================
// DIRECTORY UTILITIES
// ============================================================================

/**
 * Ensure required directories exist
 */
export async function ensureDirectories(): Promise<void> {
  const dirs = [PROGRESS_DIR, RESULTS_DIR, LOGS_DIR]
  
  await Promise.all(
    dirs.map(async (dir) => {
      try {
        await fs.mkdir(dir, { recursive: true })
      } catch (error) {
        console.warn(`Failed to create directory ${dir}:`, error)
      }
    })
  )
}

/**
 * Clean up old progress and result files
 */
export async function cleanupOldFiles(maxAgeHours: number = 24): Promise<void> {
  const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000)
  
  const cleanupDir = async (dirPath: string) => {
    try {
      const files = await fs.readdir(dirPath)
      
      await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(dirPath, file)
          const stats = await fs.stat(filePath)
          
          if (stats.mtime.getTime() < cutoffTime) {
            await fs.unlink(filePath)
            console.log(`Cleaned up old file: ${filePath}`)
          }
        })
      )
    } catch (error) {
      console.warn(`Failed to cleanup directory ${dirPath}:`, error)
    }
  }
  
  await Promise.all([
    cleanupDir(PROGRESS_DIR),
    cleanupDir(RESULTS_DIR),
    cleanupDir(LOGS_DIR),
  ])
}

// ============================================================================
// PROGRESS FILE UTILITIES
// ============================================================================

/**
 * Get progress file path for a job
 */
export function getProgressFilePath(jobId: BulkJobId): string {
  return path.join(PROGRESS_DIR, `${jobId}.json`)
}

/**
 * Write progress data to file
 */
export async function writeProgressFile(jobId: BulkJobId, data: ProgressFileData): Promise<void> {
  await ensureDirectories()
  const filePath = getProgressFilePath(jobId)
  
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
  } catch (error) {
    console.error(`Failed to write progress file for job ${jobId}:`, error)
    throw error
  }
}

/**
 * Read progress data from file
 */
export async function readProgressFile(jobId: BulkJobId): Promise<ProgressFileData | null> {
  const filePath = getProgressFilePath(jobId)
  
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as ProgressFileData
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return null // File doesn't exist
    }
    console.error(`Failed to read progress file for job ${jobId}:`, error)
    throw error
  }
}

/**
 * Update progress file with new data
 */
export async function updateProgressFile(
  jobId: BulkJobId, 
  updates: Partial<ProgressFileData>
): Promise<void> {
  const existing = await readProgressFile(jobId)
  if (!existing) {
    throw new Error(`Progress file for job ${jobId} does not exist`)
  }
  
  const updated: ProgressFileData = {
    ...existing,
    ...updates,
    lastUpdate: new Date().toISOString(),
  }
  
  await writeProgressFile(jobId, updated)
}

/**
 * Initialize progress file for a new job
 */
export async function initializeProgressFile(
  jobId: BulkJobId,
  operation: BulkProcessingOperation,
  totalOperations: number
): Promise<void> {
  const initialData: ProgressFileData = {
    jobId,
    operation,
    status: 'queued',
    startTime: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
    totalOperations,
    completedOperations: 0,
    failedOperations: 0,
    errors: [],
  }
  
  await writeProgressFile(jobId, initialData)
}

// ============================================================================
// PYTHON SCRIPT EXECUTION
// ============================================================================

/**
 * Execute a Python script with proper error handling and progress tracking
 */
export async function executePythonScript(
  scriptPath: string,
  args: string[] = [],
  options: PythonScriptOptions = {}
): Promise<ScriptResult> {
  const startTime = Date.now()
  
  // Ensure Python environment exists
  try {
    await fs.access(PYTHON_EXECUTABLE)
  } catch {
    throw new Error(`Python executable not found at ${PYTHON_EXECUTABLE}`)
  }
  
  return new Promise<ScriptResult>((resolve) => {
    const {
      cwd = SCRAPERS_DIR,
      env = {},
      timeout = 30 * 60 * 1000, // 30 minutes default
      onStdout,
      onStderr,
    } = options
    
    // Prepare environment variables
    const processEnv = {
      ...process.env,
      ...env,
      SUPABASE_URL: SUPABASE_CONFIG.url!,
      SUPABASE_SERVICE_ROLE_KEY: SUPABASE_CONFIG.serviceKey!,
      PYTHONPATH: SCRAPERS_DIR,
      PYTHONUNBUFFERED: '1', // Ensure real-time output
    }
    
    let stdout = ''
    let stderr = ''
    let timedOut = false
    
    // Spawn Python process
    const child: ChildProcess = spawn(PYTHON_EXECUTABLE, [scriptPath, ...args], {
      cwd,
      env: processEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    
    // Set timeout
    const timeoutId = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      
      // Force kill after 5 seconds
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
      }, 5000)
    }, timeout)
    
    // Handle stdout
    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      stdout += text
      onStdout?.(text)
    })
    
    // Handle stderr
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      stderr += text
      onStderr?.(text)
    })
    
    // Handle process completion
    child.on('close', (code: number | null) => {
      clearTimeout(timeoutId)
      
      const duration = Date.now() - startTime
      const exitCode = code ?? -1
      
      resolve({
        success: exitCode === 0 && !timedOut,
        exitCode,
        stdout,
        stderr,
        duration,
        error: timedOut 
          ? new Error(`Script timed out after ${timeout}ms`)
          : exitCode !== 0 
            ? new Error(`Script failed with exit code ${exitCode}`)
            : undefined,
      })
    })
    
    // Handle process errors
    child.on('error', (error: Error) => {
      clearTimeout(timeoutId)
      
      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr,
        duration: Date.now() - startTime,
        error,
      })
    })
  })
}

// ============================================================================
// BULK PROCESSING UTILITIES
// ============================================================================

/**
 * Start a bulk processing operation using Python batch coordinator
 */
export async function startBulkProcessingJob(
  jobId: BulkJobId,
  operation: BulkProcessingOperation,
  municipalityIds: MunicipalityId[] | 'all',
  options: {
    priority?: 'low' | 'normal' | 'high' | 'urgent'
    skipExisting?: boolean
    retryFailedJobs?: boolean
    validateResults?: boolean
    batchSize?: number
  } = {}
): Promise<ScriptResult> {
  await ensureDirectories()
  
  // Initialize progress file
  const totalMunicipalities = municipalityIds === 'all' ? 25 : municipalityIds.length // Approximate
  await initializeProgressFile(jobId, operation, totalMunicipalities)
  
  // Prepare script arguments
  const args = [
    '--job-id', jobId,
    '--operation', operation,
    '--municipalities', municipalityIds === 'all' ? 'all' : municipalityIds.join(','),
    '--progress-file', getProgressFilePath(jobId),
  ]
  
  if (options.priority) args.push('--priority', options.priority)
  if (options.skipExisting) args.push('--skip-existing')
  if (options.retryFailedJobs) args.push('--retry-failed')
  if (options.validateResults) args.push('--validate-results')
  if (options.batchSize) args.push('--batch-size', options.batchSize.toString())
  
  // Execute batch coordinator script
  return executePythonScript('batch_coordinator.py', args, {
    timeout: 60 * 60 * 1000, // 1 hour for bulk operations
    onStdout: (data) => {
      console.log(`[${jobId}] ${data.trim()}`)
    },
    onStderr: (data) => {
      console.error(`[${jobId}] ${data.trim()}`)
    },
  })
}

/**
 * Test a single scraper
 */
export async function testScraper(
  scraperId: number,
  municipalityId: MunicipalityId
): Promise<{
  success: boolean
  documentsFound: number
  errors: string[]
  duration: number
}> {
  const startTime = Date.now()
  
  const result = await executePythonScript('local_runner.py', [
    '--test-mode',
    '--municipality-id', municipalityId.toString(),
    '--limit', '5', // Limit test to 5 documents
  ], {
    timeout: 5 * 60 * 1000, // 5 minutes for testing
  })
  
  const duration = Date.now() - startTime
  
  if (!result.success) {
    return {
      success: false,
      documentsFound: 0,
      errors: [result.error?.message || 'Unknown error', result.stderr].filter(Boolean),
      duration,
    }
  }
  
  // Parse output for document count
  const documentMatches = result.stdout.match(/Found (\d+) documents/g)
  const documentsFound = documentMatches
    ? documentMatches.reduce((sum, match) => {
        const count = parseInt(match.match(/\d+/)?.[0] || '0', 10)
        return sum + count
      }, 0)
    : 0
  
  return {
    success: true,
    documentsFound,
    errors: [],
    duration,
  }
}

// ============================================================================
// SUPABASE INTEGRATION UTILITIES
// ============================================================================

/**
 * Create a Python script that updates Supabase directly
 * This generates a temporary Python file for database operations
 */
export async function createSupabaseUpdateScript(
  operation: string,
  data: Record<string, any>
): Promise<string> {
  const scriptContent = `
import os
import json
from supabase import create_client, Client

# Initialize Supabase client
url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
supabase: Client = create_client(url, key)

def main():
    try:
        data = ${JSON.stringify(data, null, 2)}
        
        if "${operation}" == "update_scraper_status":
            result = supabase.table('scrapers').update({
                'status': data['status'],
                'test_notes': data['test_notes'],
                'last_tested': data['last_tested'],
                'updated_at': data['updated_at']
            }).eq('id', data['scraper_id']).execute()
            
        elif "${operation}" == "update_bulk_job":
            result = supabase.table('bulk_processing_jobs').update({
                'status': data['status'],
                'completed_operations': data['completed_operations'],
                'failed_operations': data['failed_operations'],
                'progress_file_path': data['progress_file_path']
            }).eq('id', data['job_id']).execute()
            
        else:
            raise ValueError(f"Unknown operation: ${operation}")
            
        print(json.dumps({"success": True, "data": result.data}))
        
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    main()
`
  
  const scriptPath = path.join(SCRAPERS_DIR, `temp_${Date.now()}.py`)
  await fs.writeFile(scriptPath, scriptContent, 'utf8')
  
  return scriptPath
}

/**
 * Execute a Supabase operation from Python
 */
export async function executeSupabaseOperation(
  operation: string,
  data: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  const scriptPath = await createSupabaseUpdateScript(operation, data)
  
  try {
    const result = await executePythonScript(scriptPath, [], {
      timeout: 30 * 1000, // 30 seconds
    })
    
    if (!result.success) {
      return { success: false, error: result.error?.message || 'Unknown error' }
    }
    
    try {
      return JSON.parse(result.stdout.trim())
    } catch {
      return { success: false, error: 'Failed to parse result' }
    }
  } finally {
    // Clean up temporary script
    try {
      await fs.unlink(scriptPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// MONITORING AND HEALTH CHECK
// ============================================================================

/**
 * Check if Python environment is properly set up
 */
export async function checkPythonEnvironment(): Promise<{
  available: boolean
  version?: string
  packages: { name: string; installed: boolean; version?: string }[]
  error?: string
}> {
  try {
    const versionResult = await executePythonScript('-c', ['import sys; print(sys.version)'], {
      timeout: 10 * 1000,
    })
    
    if (!versionResult.success) {
      return { available: false, packages: [], error: 'Python not available' }
    }
    
    // Check required packages
    const requiredPackages = ['supabase', 'requests', 'beautifulsoup4', 'lxml']
    const packageChecks = await Promise.all(
      requiredPackages.map(async (pkg) => {
        const result = await executePythonScript('-c', [
          `import ${pkg === 'beautifulsoup4' ? 'bs4' : pkg}; print('OK')`
        ], { timeout: 5 * 1000 })
        
        return {
          name: pkg,
          installed: result.success,
          version: result.success ? 'installed' : undefined,
        }
      })
    )
    
    return {
      available: true,
      version: versionResult.stdout.trim(),
      packages: packageChecks,
    }
  } catch (error) {
    return {
      available: false,
      packages: [],
      error: (error as Error).message,
    }
  }
}

/**
 * Get system health status
 */
export async function getSystemHealth(): Promise<{
  python: Awaited<ReturnType<typeof checkPythonEnvironment>>
  directories: { path: string; exists: boolean; writable: boolean }[]
  diskSpace: { available: number; total: number } | null
}> {
  const python = await checkPythonEnvironment()
  
  // Check directory status
  const directories = await Promise.all(
    [PROGRESS_DIR, RESULTS_DIR, LOGS_DIR].map(async (dir) => {
      try {
        await fs.access(dir, fs.constants.F_OK)
        await fs.access(dir, fs.constants.W_OK)
        return { path: dir, exists: true, writable: true }
      } catch {
        try {
          await fs.access(dir, fs.constants.F_OK)
          return { path: dir, exists: true, writable: false }
        } catch {
          return { path: dir, exists: false, writable: false }
        }
      }
    })
  )
  
  // Get disk space (simplified)
  let diskSpace = null
  try {
    const stats = await fs.stat(PROGRESS_DIR)
    // Note: This is a simplified version. In production, you'd use a proper disk space library
    diskSpace = { available: 1000000000, total: 10000000000 } // Placeholder values
  } catch {
    // Ignore disk space errors
  }
  
  return {
    python,
    directories,
    diskSpace,
  }
}

// Export utility functions
export {
  PYTHON_EXECUTABLE,
  SCRAPERS_DIR,
  PROGRESS_DIR,
  RESULTS_DIR,
  LOGS_DIR,
}