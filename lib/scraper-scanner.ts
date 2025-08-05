/**
 * Scraper Scanner - Filesystem-based scraper discovery and metadata extraction
 * 
 * This module scans the /scrapers/ directory for Python scraper files and extracts
 * metadata including class names, versions, descriptions, and capabilities.
 * It provides a complete view of all available scrapers beyond just database registry.
 */

import fs from 'fs/promises'
import path from 'path'
import { supabase } from './supabase'
import type { 
  ScraperInfo, 
  ScraperStatus, 
  MunicipalityId 
} from '@/types/database'

// ============================================================================
// TYPES
// ============================================================================

/** Raw scraper metadata extracted from Python files */
export interface ScraperMetadata {
  readonly filename: string
  readonly moduleName: string
  readonly className: string | null
  readonly municipalityName: string | null
  readonly baseUrl: string | null
  readonly searchUrl: string | null
  readonly description: string | null
  readonly version: string
  readonly capabilities: readonly string[]
  readonly estimatedPages: number | null
  readonly estimatedDocuments: number | null
  readonly lastModified: string
  readonly fileSize: number
}

/** Combined scraper information with database data */
export interface FilesystemScraperInfo extends ScraperInfo {
  readonly metadata: ScraperMetadata
  readonly isRegistered: boolean
  readonly registrationStatus: 'registered' | 'unregistered' | 'orphaned'
}

/** Scraper scan summary statistics */
export interface ScraperScanSummary {
  readonly totalFiles: number
  readonly validScrapers: number
  readonly registeredScrapers: number
  readonly unregisteredScrapers: number
  readonly orphanedRegistrations: number
  readonly lastScanDate: string
  readonly scanDuration: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SCRAPERS_PATH = path.join(process.cwd(), 'scrapers')
const PYTHON_FILE_PATTERN = /\.py$/
const VERSION_PATTERNS = [
  /class\s+\w+ScraperV(\d+)/i,
  /_v(\d+)\.py$/i,
  /version\s*=\s*["']v?(\d+(?:\.\d+)*)["']/i,
  /VERSION\s*=\s*["']v?(\d+(?:\.\d+)*)["']/i
]

// Known base classes and their capabilities
const BASE_CLASS_CAPABILITIES: Record<string, readonly string[]> = {
  'BaseSupabaseScraper': ['scrape', 'download', 'extract', 'supabase'],
  'BaseScraper': ['scrape', 'download', 'extract'],
  'BaseScraperV2': ['scrape', 'download', 'extract', 'enhanced'],
  'EnhancedBaseScraper': ['scrape', 'download', 'extract', 'enhanced', 'validation']
}

// Files to ignore during scanning
const IGNORED_FILES = new Set([
  '__init__.py',
  'base.py',
  'base_v2.py',
  'base_supabase.py',
  'enhanced_base.py',
  'template.py',
  'manager.py',
  'enhanced_manager.py',
  'batch_coordinator.py',
  'local_runner.py',
  'node_bridge.py',
  'config_manager.py',
  'data_validation.py',
  'logging_system.py',
  'municipality_processor.py',
  'pdf_extractor.py',
  'progress_reporter.py',
  'queue_manager.py',
  'supabase_client.py',
  'list_registry.py'
])

const IGNORED_DIRECTORIES = new Set([
  'config',
  'scripts',
  'utils',
  '__pycache__',
  '.git'
])

// ============================================================================
// CORE SCANNER FUNCTIONS
// ============================================================================

/**
 * Scans the filesystem for all Python scraper files and extracts metadata
 */
export async function scanScrapersFromFilesystem(): Promise<{
  scrapers: readonly FilesystemScraperInfo[]
  summary: ScraperScanSummary
}> {
  const startTime = Date.now()
  
  try {
    // Check if scrapers directory exists
    const scrapersExist = await fs.access(SCRAPERS_PATH).then(() => true).catch(() => false)
    if (!scrapersExist) {
      throw new Error(`Scrapers directory not found: ${SCRAPERS_PATH}`)
    }

    // Get all Python files from the scrapers directory
    const pythonFiles = await findPythonScraperFiles(SCRAPERS_PATH)
    
    // Extract metadata from each file
    const scraperMetadata = await Promise.all(
      pythonFiles.map(async (filePath) => {
        try {
          return await extractScraperMetadata(filePath)
        } catch (error) {
          console.warn(`Failed to extract metadata from ${filePath}:`, error)
          return null
        }
      })
    )

    // Filter out failed extractions
    const validMetadata = scraperMetadata.filter((metadata): metadata is ScraperMetadata => 
      metadata !== null
    )

    // Get database registry for comparison
    const databaseScrapers = await getDatabaseScrapers()
    const municipalities = await getMunicipalities()

    // Combine filesystem and database data
    const combinedScrapers = await combineScrapersWithDatabaseData(
      validMetadata,
      databaseScrapers,
      municipalities
    )

    const scanDuration = Date.now() - startTime
    const summary: ScraperScanSummary = {
      totalFiles: pythonFiles.length,
      validScrapers: validMetadata.length,
      registeredScrapers: combinedScrapers.filter(s => s.isRegistered).length,
      unregisteredScrapers: combinedScrapers.filter(s => !s.isRegistered).length,
      orphanedRegistrations: databaseScrapers.length - combinedScrapers.filter(s => s.isRegistered).length,
      lastScanDate: new Date().toISOString(),
      scanDuration
    }

    return {
      scrapers: combinedScrapers,
      summary
    }

  } catch (error) {
    console.error('Error scanning scrapers from filesystem:', error)
    throw error
  }
}

/**
 * Recursively finds all Python scraper files in the directory
 */
async function findPythonScraperFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = []
  
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name)
      
      if (entry.isDirectory()) {
        // Skip ignored directories
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          const subdirFiles = await findPythonScraperFiles(fullPath)
          files.push(...subdirFiles)
        }
      } else if (entry.isFile()) {
        // Include Python files that are not in the ignored list
        if (PYTHON_FILE_PATTERN.test(entry.name) && !IGNORED_FILES.has(entry.name)) {
          files.push(fullPath)
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${directory}:`, error)
  }
  
  return files
}

/**
 * Extracts metadata from a single Python scraper file
 */
async function extractScraperMetadata(filePath: string): Promise<ScraperMetadata> {
  const filename = path.basename(filePath)
  const moduleName = filename.replace('.py', '')
  const stats = await fs.stat(filePath)
  const content = await fs.readFile(filePath, 'utf-8')

  // Extract class name
  const className = extractClassName(content)
  
  // Extract municipality name
  const municipalityName = extractMunicipalityName(content, filename)
  
  // Extract URLs
  const baseUrl = extractPattern(content, /base_url\s*=\s*["']([^"']+)["']/i)
  const searchUrl = extractPattern(content, /search_url\s*=\s*["']([^"']+)["']/i)
  
  // Extract description
  const description = extractDescription(content, municipalityName)
  
  // Extract version
  const version = extractVersion(content, filename)
  
  // Determine capabilities
  const capabilities = extractCapabilities(content)
  
  // Extract estimated values
  const estimatedPages = extractNumber(content, /estimated_pages\s*[=:]\s*(\d+)/i)
  const estimatedDocuments = extractNumber(content, /estimated_(?:pdfs?|documents?)\s*[=:]\s*(\d+)/i)

  return {
    filename,
    moduleName,
    className,
    municipalityName,
    baseUrl,
    searchUrl,
    description,
    version,
    capabilities,
    estimatedPages,
    estimatedDocuments,
    lastModified: stats.mtime.toISOString(),
    fileSize: stats.size
  }
}

/**
 * Extracts the main scraper class name from Python code
 */
function extractClassName(content: string): string | null {
  // Look for class definitions that likely represent scrapers
  const classPatterns = [
    /class\s+(\w+Scraper(?:V\d+)?)\s*\(/,
    /class\s+(\w+)(?:Scraper)?\s*\(\s*Base/,
    /class\s+(\w+)\s*\(\s*\w*Base\w*Scraper/
  ]
  
  for (const pattern of classPatterns) {
    const match = content.match(pattern)
    if (match) {
      return match[1]
    }
  }
  
  return null
}

/**
 * Extracts municipality name from various sources
 */
function extractMunicipalityName(content: string, filename: string): string | null {
  // Try to extract from municipality_name parameter
  let municipalityName = extractPattern(content, /municipality_name\s*=\s*["']([^"']+)["']/i)
  
  if (!municipalityName) {
    // Try to extract from docstring or comments
    const docstringMatch = content.match(/"""([^"]*(?:city|town|municipality)[^"]*)"""/i)
    if (docstringMatch) {
      const docstring = docstringMatch[1]
      const cityMatch = docstring.match(/(?:city|town|municipality)\s+of\s+(\w+)/i)
      if (cityMatch) {
        municipalityName = cityMatch[1]
      }
    }
  }
  
  if (!municipalityName) {
    // Try to infer from filename
    const fileBaseName = filename.replace(/_v?\d+\.py$/i, '').replace(/\.py$/, '')
    municipalityName = fileBaseName
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }
  
  return municipalityName
}

/**
 * Extracts description from docstring or comments
 */
function extractDescription(content: string, municipalityName: string | null): string | null {
  // Try to get from module docstring
  const docstringMatch = content.match(/^(?:\s*#.*\n)*\s*"""([^"]+)"""/m)
  if (docstringMatch) {
    return docstringMatch[1].trim()
  }
  
  // Try to get from class docstring
  const classDocMatch = content.match(/class\s+\w+[^{]*"""([^"]+)"""/s)
  if (classDocMatch) {
    return classDocMatch[1].trim()
  }
  
  // Generate default description
  if (municipalityName) {
    return `Scraper for ${municipalityName} municipality bylaws and documents`
  }
  
  return null
}

/**
 * Extracts version information from various sources
 */
function extractVersion(content: string, filename: string): string {
  // Try each version pattern
  for (const pattern of VERSION_PATTERNS) {
    const match = content.match(pattern) || filename.match(pattern)
    if (match) {
      return match[1].startsWith('v') ? match[1] : `v${match[1]}`
    }
  }
  
  // Default version
  return 'v1'
}

/**
 * Determines scraper capabilities based on code analysis
 */
function extractCapabilities(content: string): readonly string[] {
  const capabilities = new Set<string>(['scrape']) // All scrapers can scrape
  
  // Check for base class inheritance
  for (const [baseClass, baseCapabilities] of Object.entries(BASE_CLASS_CAPABILITIES)) {
    if (content.includes(baseClass)) {
      baseCapabilities.forEach(cap => capabilities.add(cap))
      break
    }
  }
  
  // Check for specific method implementations
  if (content.includes('def download_pdf') || content.includes('download_file')) {
    capabilities.add('download')
  }
  
  if (content.includes('def extract_') || content.includes('extract_text')) {
    capabilities.add('extract')
  }
  
  if (content.includes('supabase') || content.includes('BaseSupabase')) {
    capabilities.add('supabase')
  }
  
  if (content.includes('find_additional_pdfs') || content.includes('get_category_urls')) {
    capabilities.add('advanced')
  }
  
  if (content.includes('validate_') || content.includes('data_validation')) {
    capabilities.add('validation')
  }
  
  return Array.from(capabilities).sort()
}

/**
 * Utility function to extract a pattern from content
 */
function extractPattern(content: string, pattern: RegExp): string | null {
  const match = content.match(pattern)
  return match ? match[1] : null
}

/**
 * Utility function to extract a number from content
 */
function extractNumber(content: string, pattern: RegExp): number | null {
  const match = content.match(pattern)
  return match ? parseInt(match[1], 10) : null
}

// ============================================================================
// DATABASE INTEGRATION FUNCTIONS
// ============================================================================

/**
 * Gets all scrapers from the database registry
 */
async function getDatabaseScrapers() {
  try {
    const { data: scrapers, error } = await supabase
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
        success_rate,
        last_tested,
        estimated_pages,
        estimated_pdfs
      `)
    
    if (error) {
      console.error('Error fetching database scrapers:', error)
      return []
    }
    
    return scrapers || []
  } catch (error) {
    console.error('Error in getDatabaseScrapers:', error)
    return []
  }
}

/**
 * Gets all municipalities for matching with scrapers
 */
async function getMunicipalities() {
  try {
    const { data: municipalities, error } = await supabase
      .from('municipalities')
      .select(`
        id,
        name,
        scraper_name,
        status,
        last_run,
        next_run,
        schedule_active
      `)
    
    if (error) {
      console.error('Error fetching municipalities:', error)
      return []
    }
    
    return municipalities || []
  } catch (error) {
    console.error('Error in getMunicipalities:', error)
    return []
  }
}

/**
 * Combines filesystem metadata with database data
 */
async function combineScrapersWithDatabaseData(
  filesystemScrapers: readonly ScraperMetadata[],
  databaseScrapers: any[],
  municipalities: any[]
): Promise<readonly FilesystemScraperInfo[]> {
  
  const combined: FilesystemScraperInfo[] = []
  
  // Create lookup maps
  const dbScrapersByModule = new Map(
    databaseScrapers.map(scraper => [scraper.module_name || scraper.name, scraper])
  )
  
  const municipalitiesByScraperName = new Map(
    municipalities.map(muni => [muni.scraper_name, muni])
  )
  
  const municipalitiesById = new Map(
    municipalities.map(muni => [muni.id, muni])
  )

  // Process each filesystem scraper
  for (const metadata of filesystemScrapers) {
    const dbScraper = dbScrapersByModule.get(metadata.moduleName)
    const municipality = municipalitiesByScraperName.get(metadata.moduleName) ||
                        municipalitiesById.get(dbScraper?.municipality_id)
    
    // Determine scraper status
    let status: ScraperStatus = 'available'
    if (municipality) {
      if (municipality.status === 'running') status = 'busy'
      else if (municipality.status === 'error') status = 'error'
      else if (!municipality.schedule_active) status = 'offline'
    }
    
    // Determine registration status
    let registrationStatus: 'registered' | 'unregistered' | 'orphaned' = 'unregistered'
    if (dbScraper) {
      registrationStatus = municipality ? 'registered' : 'orphaned'
    }
    
    const scraperInfo: FilesystemScraperInfo = {
      name: metadata.moduleName,
      displayName: metadata.municipalityName || metadata.moduleName,
      status,
      municipalityId: municipality?.id || null,
      lastRun: municipality?.last_run || dbScraper?.last_tested || null,
      nextRun: municipality?.next_run || null,
      isActive: municipality?.schedule_active ?? dbScraper?.is_active ?? true,
      description: metadata.description || `Scraper for ${metadata.municipalityName || metadata.moduleName}`,
      capabilities: metadata.capabilities,
      version: metadata.version,
      successRate: dbScraper?.success_rate || null,
      lastTestDate: dbScraper?.last_tested || null,
      estimatedPages: metadata.estimatedPages || dbScraper?.estimated_pages || null,
      estimatedDocuments: metadata.estimatedDocuments || dbScraper?.estimated_pdfs || null,
      metadata,
      isRegistered: !!dbScraper,
      registrationStatus
    }
    
    combined.push(scraperInfo)
  }
  
  // Sort by display name
  return combined.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

let cachedScrapers: {
  scrapers: readonly FilesystemScraperInfo[]
  summary: ScraperScanSummary
} | null = null

let cacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

/**
 * Gets scrapers with caching support
 */
export async function getCachedScrapersFromFilesystem(forceRefresh = false): Promise<{
  scrapers: readonly FilesystemScraperInfo[]
  summary: ScraperScanSummary
}> {
  const now = Date.now()
  
  if (!forceRefresh && cachedScrapers && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedScrapers
  }
  
  const result = await scanScrapersFromFilesystem()
  cachedScrapers = result
  cacheTimestamp = now
  
  return result
}

/**
 * Invalidates the scrapers cache
 */
export function invalidateScrapersCache(): void {
  cachedScrapers = null
  cacheTimestamp = 0
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Filters scrapers by various criteria
 */
export function filterScrapers(
  scrapers: readonly FilesystemScraperInfo[],
  filters: {
    readonly status?: ScraperStatus
    readonly isActive?: boolean
    readonly isRegistered?: boolean
    readonly hasSuccessRate?: boolean
    readonly municipalityId?: MunicipalityId
    readonly search?: string
  }
): readonly FilesystemScraperInfo[] {
  
  return scrapers.filter(scraper => {
    if (filters.status && scraper.status !== filters.status) return false
    if (filters.isActive !== undefined && scraper.isActive !== filters.isActive) return false
    if (filters.isRegistered !== undefined && scraper.isRegistered !== filters.isRegistered) return false
    if (filters.hasSuccessRate && !scraper.successRate) return false
    if (filters.municipalityId && scraper.municipalityId !== filters.municipalityId) return false
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const matchesName = scraper.name.toLowerCase().includes(searchLower)
      const matchesDisplay = scraper.displayName.toLowerCase().includes(searchLower)
      const matchesDescription = scraper.description?.toLowerCase().includes(searchLower)
      
      if (!matchesName && !matchesDisplay && !matchesDescription) return false
    }
    
    return true
  })
}

/**
 * Gets scraper statistics
 */
export function getScraperStatistics(scrapers: readonly FilesystemScraperInfo[]) {
  return {
    total: scrapers.length,
    registered: scrapers.filter(s => s.isRegistered).length,
    unregistered: scrapers.filter(s => !s.isRegistered).length,
    active: scrapers.filter(s => s.isActive).length,
    available: scrapers.filter(s => s.status === 'available').length,
    busy: scrapers.filter(s => s.status === 'busy').length,
    offline: scrapers.filter(s => s.status === 'offline').length,
    error: scrapers.filter(s => s.status === 'error').length,
    withSuccessRate: scrapers.filter(s => s.successRate !== null).length,
    averageSuccessRate: scrapers.length > 0 
      ? Math.round(scrapers.reduce((sum, s) => sum + (s.successRate || 0), 0) / scrapers.length)
      : 0,
    byVersion: Object.fromEntries(
      Object.entries(
        scrapers.reduce((acc, s) => {
          acc[s.version] = (acc[s.version] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      ).sort(([a], [b]) => b.localeCompare(a))
    )
  }
}