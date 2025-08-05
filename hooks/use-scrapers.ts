import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { 
  ScraperInfo,
  ScrapingJobRequest,
  BackgroundJob,
  DetailedJobStatus,
  MunicipalityId,
  JobId,
  ScraperId,
  Scraper,
  ScraperValidationStatus,
  ApiResponse,
  SuccessResponse
} from "@/types/database"

// Query key factory
const scraperKeys = {
  all: ['scrapers'] as const,
  list: () => [...scraperKeys.all, 'list'] as const,
  detail: (id: ScraperId) => [...scraperKeys.all, 'detail', id] as const,
  byMunicipality: (municipalityId: MunicipalityId) => [...scraperKeys.all, 'municipality', municipalityId] as const,
  jobs: () => [...scraperKeys.all, 'jobs'] as const,
  jobDetail: (id: JobId) => [...scraperKeys.jobs(), id] as const,
}

// Fetch available scrapers and their status
async function fetchScrapers(): Promise<ScraperInfo[]> {
  const response = await fetch('/api/scrapers')
  
  if (!response.ok) {
    throw new Error(`Failed to fetch scrapers: ${response.statusText}`)
  }
  
  const result: SuccessResponse<ScraperInfo[]> = await response.json()
  return result.data
}

// Start scraping job
async function startScrapingJob(request: ScrapingJobRequest): Promise<BackgroundJob> {
  const response = await fetch('/api/scrapers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to start scraping job')
  }
  
  const result: SuccessResponse<BackgroundJob> = await response.json()
  return result.data
}

// Fetch scraping job status
async function fetchScrapingJobStatus(jobId: JobId): Promise<DetailedJobStatus> {
  const response = await fetch(`/api/processing/${jobId}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch job status: ${response.statusText}`)
  }
  
  const result: SuccessResponse<DetailedJobStatus> = await response.json()
  return result.data
}

// Cancel scraping job
async function cancelScrapingJob(jobId: JobId): Promise<DetailedJobStatus> {
  const response = await fetch(`/api/processing/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to cancel scraping job')
  }
  
  const result: SuccessResponse<DetailedJobStatus> = await response.json()
  return result.data
}

// Delete scraping job
async function deleteScrapingJob(jobId: JobId): Promise<void> {
  const response = await fetch(`/api/processing/${jobId}`, {
    method: 'DELETE',
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete scraping job')
  }
}

// Fetch all scrapers from database
async function fetchScrapersFromDB(): Promise<Scraper[]> {
  const response = await fetch('/api/scrapers/database')
  
  if (!response.ok) {
    throw new Error(`Failed to fetch scrapers from database: ${response.statusText}`)
  }
  
  const result: SuccessResponse<Scraper[]> = await response.json()
  return result.data
}

// Fetch available filesystem scrapers
async function fetchFilesystemScrapers(): Promise<ScraperInfo[]> {
  const response = await fetch('/api/scrapers')
  
  if (!response.ok) {
    throw new Error(`Failed to fetch filesystem scrapers: ${response.statusText}`)
  }
  
  const result: SuccessResponse<ScraperInfo[]> = await response.json()
  return result.data
}

// Get all available scraper names for assignment
async function fetchAvailableScraperNames(): Promise<string[]> {
  try {
    const [filesystemScrapers, dbScrapers] = await Promise.all([
      fetchFilesystemScrapers(),
      fetchScrapersFromDB()
    ])
    
    // Get unique scraper names from both sources
    const filesystemNames = filesystemScrapers.map(s => s.name)
    const dbNames = dbScrapers.map(s => s.name)
    
    // Combine and deduplicate
    const allNames = Array.from(new Set([...filesystemNames, ...dbNames]))
    return allNames.sort()
  } catch (error) {
    console.error('Error fetching available scraper names:', error)
    return []
  }
}

// Update scraper status
async function updateScraperStatus(scraperId: ScraperId, status: ScraperValidationStatus, testNotes?: string): Promise<Scraper> {
  const response = await fetch(`/api/scrapers/database/${scraperId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      status, 
      test_notes: testNotes,
      last_tested: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update scraper status')
  }
  
  const result: SuccessResponse<Scraper> = await response.json()
  return result.data
}

// Test individual scraper
async function testScraper(scraperId: ScraperId): Promise<{
  success: boolean;
  documentsFound: number;
  errors: string[];
  duration: number;
}> {
  const response = await fetch(`/api/scrapers/test/${scraperId}`, {
    method: 'POST',
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to test scraper')
  }
  
  const result: SuccessResponse<{
    success: boolean;
    documentsFound: number;
    errors: string[];
    duration: number;
  }> = await response.json()
  return result.data
}

// Fetch scrapers by municipality
async function fetchScrapersByMunicipality(municipalityId: MunicipalityId): Promise<Scraper[]> {
  const response = await fetch(`/api/scrapers/database?municipality_id=${municipalityId}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch scrapers for municipality: ${response.statusText}`)
  }
  
  const result: SuccessResponse<Scraper[]> = await response.json()
  return result.data
}

// Custom hooks

/**
 * Hook to fetch available scrapers and their status
 */
export function useScrapers() {
  return useQuery({
    queryKey: scraperKeys.list(),
    queryFn: fetchScrapers,
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 1000 * 30, // Refetch every 30 seconds to keep status updated
  })
}

/**
 * Hook to fetch filesystem scrapers
 */
export function useFilesystemScrapers() {
  return useQuery({
    queryKey: [...scraperKeys.all, 'filesystem'],
    queryFn: fetchFilesystemScrapers,
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 1000 * 30, // Refetch every 30 seconds to keep status updated
  })
}

/**
 * Hook to fetch available scraper names for assignment
 */
export function useAvailableScraperNames() {
  return useQuery({
    queryKey: [...scraperKeys.all, 'available-names'],
    queryFn: fetchAvailableScraperNames,
    staleTime: 1000 * 60 * 5, // 5 minutes - names don't change often
  })
}

/**
 * Hook to start a scraping job
 */
export function useStartScrapingJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: startScrapingJob,
    onSuccess: (job) => {
      // Invalidate scrapers list to update status
      queryClient.invalidateQueries({ queryKey: scraperKeys.list() })
      
      // Add job to jobs cache if we have a jobs query
      queryClient.setQueryData(scraperKeys.jobDetail(job.id), job)
    },
  })
}

/**
 * Hook to get scraping job status with automatic polling
 */
export function useScrapingJobStatus(jobId: JobId, options?: {
  enabled?: boolean
  pollingInterval?: number
}) {
  const { enabled = true, pollingInterval = 2000 } = options || {}
  
  return useQuery({
    queryKey: scraperKeys.jobDetail(jobId),
    queryFn: () => fetchScrapingJobStatus(jobId),
    enabled: enabled && !!jobId,
    refetchInterval: (data) => {
      // Stop polling if job is completed, failed, or cancelled
      if (data?.status && ['completed', 'failed', 'cancelled'].includes(data.status)) {
        return false
      }
      return pollingInterval
    },
    staleTime: 1000, // Very short stale time for active jobs
  })
}

/**
 * Hook to cancel a scraping job
 */
export function useCancelScrapingJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: cancelScrapingJob,
    onSuccess: (updatedJob) => {
      // Update job in cache
      queryClient.setQueryData(scraperKeys.jobDetail(updatedJob.id), updatedJob)
      
      // Invalidate scrapers list to update status
      queryClient.invalidateQueries({ queryKey: scraperKeys.list() })
    },
  })
}

/**
 * Hook to delete a scraping job
 */
export function useDeleteScrapingJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: deleteScrapingJob,
    onSuccess: (_, jobId) => {
      // Remove job from cache
      queryClient.removeQueries({ queryKey: scraperKeys.jobDetail(jobId) })
      
      // Invalidate scrapers list to update status
      queryClient.invalidateQueries({ queryKey: scraperKeys.list() })
    },
  })
}

/**
 * Hook for managing scraping operations with state
 */
export function useScrapingManager() {
  const [activeJobs, setActiveJobs] = useState<Set<JobId>>(new Set())
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<MunicipalityId[]>([])
  
  const scrapers = useScrapers()
  const startJob = useStartScrapingJob()
  const cancelJob = useCancelScrapingJob()
  const deleteJob = useDeleteScrapingJob()

  // Start scraping for selected municipalities
  const startScraping = async (options?: {
    priority?: 'low' | 'normal' | 'high' | 'urgent'
    forceUpdate?: boolean
    skipRecentlyRun?: boolean
    scheduleNext?: boolean
  }) => {
    if (selectedMunicipalities.length === 0) {
      throw new Error('No municipalities selected')
    }

    const request: ScrapingJobRequest = {
      municipalityIds: selectedMunicipalities,
      options: {
        priority: 'normal',
        forceUpdate: false,
        skipRecentlyRun: true,
        scheduleNext: true,
        ...options
      }
    }

    const job = await startJob.mutateAsync(request)
    setActiveJobs(prev => new Set([...prev, job.id]))
    return job
  }

  // Start scraping for all municipalities
  const startScrapingAll = async (options?: {
    priority?: 'low' | 'normal' | 'high' | 'urgent'
    forceUpdate?: boolean
    skipRecentlyRun?: boolean
    scheduleNext?: boolean
  }) => {
    const request: ScrapingJobRequest = {
      municipalityIds: 'all',
      options: {
        priority: 'normal',
        forceUpdate: false,
        skipRecentlyRun: true,
        scheduleNext: true,
        ...options
      }
    }

    const job = await startJob.mutateAsync(request)
    setActiveJobs(prev => new Set([...prev, job.id]))
    return job
  }

  // Cancel job and remove from active jobs
  const cancelActiveJob = async (jobId: JobId) => {
    await cancelJob.mutateAsync(jobId)
    setActiveJobs(prev => {
      const next = new Set(prev)
      next.delete(jobId)
      return next
    })
  }

  // Delete job and remove from active jobs
  const deleteActiveJob = async (jobId: JobId) => {
    await deleteJob.mutateAsync(jobId)
    setActiveJobs(prev => {
      const next = new Set(prev)
      next.delete(jobId)
      return next
    })
  }

  // Helper to get available scrapers (not busy)
  const availableScrapers = scrapers.data?.filter(s => s.status === 'available') || []
  const busyScrapers = scrapers.data?.filter(s => s.status === 'busy') || []
  const errorScrapers = scrapers.data?.filter(s => s.status === 'error') || []

  return {
    // Data
    scrapers: scrapers.data || [],
    availableScrapers,
    busyScrapers,
    errorScrapers,
    activeJobs: Array.from(activeJobs),
    selectedMunicipalities,
    
    // Loading states
    isLoadingScrapers: scrapers.isLoading,
    isStartingJob: startJob.isPending,
    isCancellingJob: cancelJob.isPending,
    isDeletingJob: deleteJob.isPending,
    
    // Actions
    setSelectedMunicipalities,
    startScraping,
    startScrapingAll,
    cancelActiveJob,
    deleteActiveJob,
    
    // Utilities
    refetchScrapers: scrapers.refetch,
    hasAvailableScrapers: availableScrapers.length > 0,
    hasSelection: selectedMunicipalities.length > 0,
    
    // Selection helpers
    selectAll: () => {
      const allIds = availableScrapers
        .filter(s => s.municipalityId)
        .map(s => s.municipalityId!)
      setSelectedMunicipalities(allIds)
    },
    selectNone: () => setSelectedMunicipalities([]),
    toggleMunicipality: (id: MunicipalityId) => {
      setSelectedMunicipalities(prev => 
        prev.includes(id) 
          ? prev.filter(x => x !== id)
          : [...prev, id]
      )
    },
  }
}

/**
 * Hook to track multiple job statuses at once
 */
export function useMultipleJobStatuses(jobIds: JobId[]) {
  const queries = jobIds.map(jobId => ({
    queryKey: scraperKeys.jobDetail(jobId),
    queryFn: () => fetchScrapingJobStatus(jobId),
    enabled: !!jobId,
    refetchInterval: (data: DetailedJobStatus | undefined) => {
      // Stop polling if job is completed, failed, or cancelled
      if (data?.status && ['completed', 'failed', 'cancelled'].includes(data.status)) {
        return false
      }
      return 2000 // 2 seconds
    },
    staleTime: 1000,
  }))

  const results = queries.map(({ queryKey, ...queryOptions }) => 
    useQuery({ queryKey, ...queryOptions })
  )

  return {
    jobs: results.map(r => r.data).filter(Boolean) as DetailedJobStatus[],
    isLoading: results.some(r => r.isLoading),
    isError: results.some(r => r.isError),
    errors: results.map(r => r.error).filter(Boolean),
    refetchAll: () => Promise.all(results.map(r => r.refetch())),
  }
}

/**
 * Hook to fetch scrapers from database with enhanced information
 */
export function useScrapersDB() {
  return useQuery({
    queryKey: scraperKeys.list(),
    queryFn: fetchScrapersFromDB,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchInterval: false, // Only manual refresh for database scrapers
  })
}

/**
 * Hook to update scraper validation status
 */
export function useUpdateScraperStatus() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ scraperId, status, testNotes }: {
      scraperId: ScraperId;
      status: ScraperValidationStatus;
      testNotes?: string;
    }) => updateScraperStatus(scraperId, status, testNotes),
    onSuccess: (updatedScraper) => {
      // Update scraper in cache
      queryClient.setQueryData(scraperKeys.detail(updatedScraper.id), updatedScraper)
      
      // Invalidate scrapers list to reflect changes
      queryClient.invalidateQueries({ queryKey: scraperKeys.list() })
      
      // Invalidate municipality-specific queries if applicable
      if (updatedScraper.municipality_id) {
        queryClient.invalidateQueries({ 
          queryKey: scraperKeys.byMunicipality(updatedScraper.municipality_id) 
        })
      }
    },
  })
}

/**
 * Hook to test individual scraper
 */
export function useTestScraper() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: testScraper,
    onSuccess: (testResult, scraperId) => {
      // Update scraper status based on test result
      const status: ScraperValidationStatus = testResult.success ? 'validated' : 'failed'
      const testNotes = testResult.success 
        ? `Test passed: ${testResult.documentsFound} documents found in ${testResult.duration}ms`
        : `Test failed: ${testResult.errors.join(', ')}`
      
      // Auto-update scraper status after test
      queryClient.invalidateQueries({ queryKey: scraperKeys.list() })
    },
  })
}

/**
 * Hook to fetch scrapers by municipality
 */
export function useScrapersByMunicipality(municipalityId: MunicipalityId) {
  return useQuery({
    queryKey: scraperKeys.byMunicipality(municipalityId),
    queryFn: () => fetchScrapersByMunicipality(municipalityId),
    enabled: !!municipalityId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Enhanced scraper management hook with database and filesystem integration
 */
export function useScraperManagement() {
  const [selectedScrapers, setSelectedScrapers] = useState<ScraperId[]>([])
  const [testingScrapers, setTestingScrapers] = useState<Set<ScraperId>>(new Set())
  
  const scrapers = useScrapersDB()
  const filesystemScrapers = useFilesystemScrapers()
  const availableScraperNames = useAvailableScraperNames()
  const updateStatus = useUpdateScraperStatus()
  const testScraper = useTestScraper()

  // Test multiple scrapers
  const testSelected = async () => {
    if (selectedScrapers.length === 0) {
      throw new Error('No scrapers selected')
    }

    setTestingScrapers(new Set(selectedScrapers))
    
    try {
      const results = await Promise.allSettled(
        selectedScrapers.map(scraperId => testScraper.mutateAsync(scraperId))
      )
      
      // Update status for each scraper based on test results
      await Promise.allSettled(
        selectedScrapers.map(async (scraperId, index) => {
          const result = results[index]
          if (result.status === 'fulfilled') {
            const status: ScraperValidationStatus = result.value.success ? 'validated' : 'failed'
            const testNotes = result.value.success 
              ? `Test passed: ${result.value.documentsFound} documents found in ${result.value.duration}ms`
              : `Test failed: ${result.value.errors.join(', ')}`
            
            await updateStatus.mutateAsync({ scraperId, status, testNotes })
          } else {
            await updateStatus.mutateAsync({ 
              scraperId, 
              status: 'failed', 
              testNotes: `Test error: ${result.reason}` 
            })
          }
        })
      )
    } finally {
      setTestingScrapers(new Set())
    }
  }

  // Bulk status update
  const updateSelectedStatus = async (status: ScraperValidationStatus, notes?: string) => {
    if (selectedScrapers.length === 0) {
      throw new Error('No scrapers selected')
    }

    await Promise.allSettled(
      selectedScrapers.map(scraperId => 
        updateStatus.mutateAsync({ scraperId, status, testNotes: notes })
      )
    )
  }

  // Filter scrapers by status
  const validatedScrapers = scrapers.data?.filter(s => s.status === 'validated') || []
  const pendingScrapers = scrapers.data?.filter(s => s.status === 'pending') || []
  const failedScrapers = scrapers.data?.filter(s => s.status === 'failed') || []
  const testingScrapersData = scrapers.data?.filter(s => s.status === 'testing') || []

  return {
    // Data
    scrapers: scrapers.data || [],
    filesystemScrapers: filesystemScrapers.data || [],
    availableScraperNames: availableScraperNames.data || [],
    validatedScrapers,
    pendingScrapers,
    failedScrapers,
    testingScrapersData,
    selectedScrapers,
    testingScrapers: Array.from(testingScrapers),
    
    // Loading states
    isLoading: scrapers.isLoading || filesystemScrapers.isLoading,
    isLoadingNames: availableScraperNames.isLoading,
    isTesting: testScraper.isPending || testingScrapers.size > 0,
    isUpdating: updateStatus.isPending,
    
    // Actions
    setSelectedScrapers,
    testSelected,
    updateSelectedStatus,
    
    // Individual actions
    updateScraperStatus: (scraperId: ScraperId, status: ScraperValidationStatus, notes?: string) =>
      updateStatus.mutateAsync({ scraperId, status, testNotes: notes }),
    testScraper: (scraperId: ScraperId) => testScraper.mutateAsync(scraperId),
    
    // Utilities
    refetch: () => Promise.all([scrapers.refetch(), filesystemScrapers.refetch(), availableScraperNames.refetch()]),
    refetchScrapers: scrapers.refetch,
    refetchFilesystemScrapers: filesystemScrapers.refetch,
    refetchAvailableNames: availableScraperNames.refetch,
    hasSelection: selectedScrapers.length > 0,
    
    // Enhanced utilities
    getScraperByName: (name: string) => scrapers.data?.find(s => s.name === name),
    getFilesystemScraperByName: (name: string) => filesystemScrapers.data?.find(s => s.name === name),
    isScraperAvailable: (name: string) => availableScraperNames.data?.includes(name) || false,
    
    // Selection helpers
    selectAll: () => setSelectedScrapers(scrapers.data?.map(s => s.id) || []),
    selectNone: () => setSelectedScrapers([]),
    selectByStatus: (status: ScraperValidationStatus) => {
      const scraperIds = scrapers.data?.filter(s => s.status === status).map(s => s.id) || []
      setSelectedScrapers(scraperIds)
    },
    toggleScraper: (id: ScraperId) => {
      setSelectedScrapers(prev => 
        prev.includes(id) 
          ? prev.filter(x => x !== id)
          : [...prev, id]
      )
    },
  }
}

/**
 * Comprehensive hook that integrates filesystem scrapers with database scrapers
 * and municipality assignments for complete scraper management
 */
export function useIntegratedScraperManagement() {
  const [selectedItems, setSelectedItems] = useState<{
    scraperIds: ScraperId[];
    municipalityIds: MunicipalityId[];
  }>({
    scraperIds: [],
    municipalityIds: []
  })
  
  // Get all data sources
  const scraperManagement = useScraperManagement()
  const filesystemScrapers = useFilesystemScrapers()
  const availableNames = useAvailableScraperNames()
  
  // Combined data view
  const getAllScrapersWithStatus = () => {
    const dbScrapers = scraperManagement.scrapers
    const fsScrapers = filesystemScrapers.data || []
    
    // Create a comprehensive view combining both sources
    const combinedScrapers = new Map<string, {
      name: string;
      source: 'database' | 'filesystem' | 'both';
      dbScraper?: typeof dbScrapers[0];
      fsScraper?: typeof fsScrapers[0];
      isActive: boolean;
      isValidated: boolean;
      municipalityId?: MunicipalityId;
      municipalityName?: string;
      status: string;
      lastRun?: string;
      successRate?: number;
    }>()
    
    // Add database scrapers
    dbScrapers.forEach(scraper => {
      combinedScrapers.set(scraper.name, {
        name: scraper.name,
        source: 'database',
        dbScraper: scraper,
        isActive: scraper.is_active,
        isValidated: scraper.status === 'validated',
        municipalityId: scraper.municipality_id,
        municipalityName: scraper.municipality_name,
        status: scraper.status,
        successRate: scraper.success_rate || undefined
      })
    })
    
    // Add or update with filesystem scrapers
    fsScrapers.forEach(scraper => {
      const existing = combinedScrapers.get(scraper.name)
      if (existing) {
        existing.source = 'both'
        existing.fsScraper = scraper
        existing.lastRun = scraper.lastRun || existing.lastRun
      } else {
        combinedScrapers.set(scraper.name, {
          name: scraper.name,
          source: 'filesystem',
          fsScraper: scraper,
          isActive: scraper.isActive,
          isValidated: false, // Filesystem scrapers need database validation
          municipalityId: scraper.municipalityId || undefined,
          municipalityName: scraper.displayName,
          status: scraper.status,
          lastRun: scraper.lastRun || undefined,
          successRate: scraper.successRate || undefined
        })
      }
    })
    
    return Array.from(combinedScrapers.values())
  }
  
  // Statistics and analysis
  const getIntegratedStats = () => {
    const allScrapers = getAllScrapersWithStatus()
    const dbOnly = allScrapers.filter(s => s.source === 'database')
    const fsOnly = allScrapers.filter(s => s.source === 'filesystem')
    const both = allScrapers.filter(s => s.source === 'both')
    const validated = allScrapers.filter(s => s.isValidated)
    const active = allScrapers.filter(s => s.isActive)
    const assigned = allScrapers.filter(s => s.municipalityId)
    
    return {
      total: allScrapers.length,
      databaseOnly: dbOnly.length,
      filesystemOnly: fsOnly.length,
      integrated: both.length,
      validated: validated.length,
      active: active.length,
      assigned: assigned.length,
      unassigned: allScrapers.length - assigned.length,
      validationRate: allScrapers.length > 0 
        ? Math.round((validated.length / allScrapers.length) * 100) 
        : 0,
      assignmentRate: allScrapers.length > 0 
        ? Math.round((assigned.length / allScrapers.length) * 100) 
        : 0
    }
  }
  
  // Enhanced operations
  const syncFilesystemToDatabase = async () => {
    const fsScrapers = filesystemScrapers.data || []
    const dbScrapers = scraperManagement.scrapers
    
    const fsScrapersNotInDb = fsScrapers.filter(fs => 
      !dbScrapers.some(db => db.name === fs.name)
    )
    
    if (fsScrapersNotInDb.length === 0) {
      return { message: 'All filesystem scrapers are already in database', synced: 0 }
    }
    
    // This would require an API endpoint to bulk create scrapers
    // For now, return information about what would be synced
    return {
      message: `Found ${fsScrapersNotInDb.length} filesystem scrapers not in database`,
      scrapers: fsScrapersNotInDb.map(s => ({
        name: s.name,
        displayName: s.displayName,
        municipalityId: s.municipalityId
      })),
      synced: 0 // Would be implemented with actual API call
    }
  }
  
  const validateIntegrity = () => {
    const allScrapers = getAllScrapersWithStatus()
    const issues: string[] = []
    
    // Check for scrapers in database but not in filesystem
    const dbOnly = allScrapers.filter(s => s.source === 'database')
    if (dbOnly.length > 0) {
      issues.push(`${dbOnly.length} scrapers exist in database but not in filesystem`)
    }
    
    // Check for active scrapers without validation
    const activeUnvalidated = allScrapers.filter(s => s.isActive && !s.isValidated)
    if (activeUnvalidated.length > 0) {
      issues.push(`${activeUnvalidated.length} active scrapers are not validated`)
    }
    
    // Check for scrapers without municipality assignments
    const unassigned = allScrapers.filter(s => !s.municipalityId)
    if (unassigned.length > 0) {
      issues.push(`${unassigned.length} scrapers are not assigned to municipalities`)
    }
    
    return {
      isHealthy: issues.length === 0,
      issues,
      checkedScrapers: allScrapers.length
    }
  }
  
  return {
    // Integrated data
    allScrapers: getAllScrapersWithStatus(),
    integratedStats: getIntegratedStats(),
    availableScraperNames: availableNames.data || [],
    
    // Loading states
    isLoading: scraperManagement.isLoading || filesystemScrapers.isLoading || availableNames.isLoading,
    
    // Selection state
    selectedItems,
    setSelectedItems,
    hasSelection: selectedItems.scraperIds.length > 0 || selectedItems.municipalityIds.length > 0,
    
    // Operations
    syncFilesystemToDatabase,
    validateIntegrity,
    
    // Access to underlying hooks
    scraperManagement,
    filesystemScrapers: {
      data: filesystemScrapers.data || [],
      isLoading: filesystemScrapers.isLoading,
      refetch: filesystemScrapers.refetch
    },
    
    // Utilities
    refetchAll: async () => {
      await Promise.all([
        scraperManagement.refetch(),
        filesystemScrapers.refetch(),
        availableNames.refetch()
      ])
    },
    
    // Filtering helpers
    getScrapersBySource: (source: 'database' | 'filesystem' | 'both') => 
      getAllScrapersWithStatus().filter(s => s.source === source),
    getValidatedScrapers: () => getAllScrapersWithStatus().filter(s => s.isValidated),
    getUnvalidatedScrapers: () => getAllScrapersWithStatus().filter(s => !s.isValidated),
    getActiveScrapers: () => getAllScrapersWithStatus().filter(s => s.isActive),
    getAssignedScrapers: () => getAllScrapersWithStatus().filter(s => s.municipalityId),
    getUnassignedScrapers: () => getAllScrapersWithStatus().filter(s => !s.municipalityId),
  }
}