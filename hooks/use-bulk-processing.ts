import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import type { 
  BulkProcessingJob,
  BulkProcessingOperation,
  BulkJobId,
  MunicipalityId,
  JobStatus,
  JobPriority,
  ProgressFileData,
  BulkProcessingJobResult,
  ApiResponse,
  SuccessResponse,
  ErrorResponse
} from "@/types/database"

// Query key factory
const bulkProcessingKeys = {
  all: ['bulk-processing'] as const,
  jobs: () => [...bulkProcessingKeys.all, 'jobs'] as const,
  job: (id: BulkJobId) => [...bulkProcessingKeys.jobs(), id] as const,
  progress: (id: BulkJobId) => [...bulkProcessingKeys.job(id), 'progress'] as const,
  history: () => [...bulkProcessingKeys.all, 'history'] as const,
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Start a bulk processing operation
 */
async function startBulkProcessing(request: {
  operation: BulkProcessingOperation;
  municipalityIds?: MunicipalityId[] | 'all';
  priority?: JobPriority;
  options?: {
    skipExisting?: boolean;
    retryFailedJobs?: boolean;
    validateResults?: boolean;
    batchSize?: number;
  };
}): Promise<BulkProcessingJob> {
  const response = await fetch('/api/bulk-processing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  
  if (!response.ok) {
    const error: ErrorResponse = await response.json()
    throw new Error(error.error || 'Failed to start bulk processing job')
  }
  
  const result: SuccessResponse<BulkProcessingJob> = await response.json()
  return result.data
}

/**
 * Fetch bulk processing job details
 */
async function fetchBulkProcessingJob(jobId: BulkJobId): Promise<BulkProcessingJob> {
  const response = await fetch(`/api/bulk-processing/${jobId}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch bulk processing job: ${response.statusText}`)
  }
  
  const result: SuccessResponse<BulkProcessingJob> = await response.json()
  return result.data
}

/**
 * Fetch bulk processing job progress from file system
 */
async function fetchBulkProcessingProgress(jobId: BulkJobId): Promise<ProgressFileData | null> {
  const response = await fetch(`/api/bulk-processing/${jobId}/progress`)
  
  if (!response.ok) {
    if (response.status === 404) {
      return null // Progress file doesn't exist yet
    }
    throw new Error(`Failed to fetch bulk processing progress: ${response.statusText}`)
  }
  
  const result: SuccessResponse<ProgressFileData> = await response.json()
  return result.data
}

/**
 * Cancel a bulk processing job
 */
async function cancelBulkProcessingJob(jobId: BulkJobId): Promise<BulkProcessingJob> {
  const response = await fetch(`/api/bulk-processing/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  })
  
  if (!response.ok) {
    const error: ErrorResponse = await response.json()
    throw new Error(error.error || 'Failed to cancel bulk processing job')
  }
  
  const result: SuccessResponse<BulkProcessingJob> = await response.json()
  return result.data
}

/**
 * Delete a bulk processing job
 */
async function deleteBulkProcessingJob(jobId: BulkJobId): Promise<void> {
  const response = await fetch(`/api/bulk-processing/${jobId}`, {
    method: 'DELETE',
  })
  
  if (!response.ok) {
    const error: ErrorResponse = await response.json()
    throw new Error(error.error || 'Failed to delete bulk processing job')
  }
}

/**
 * Fetch bulk processing job history
 */
async function fetchBulkProcessingHistory(params?: {
  limit?: number;
  offset?: number;
  status?: JobStatus;
  operation?: BulkProcessingOperation;
}): Promise<{
  jobs: BulkProcessingJob[];
  total: number;
  hasMore: boolean;
}> {
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set('limit', params.limit.toString())
  if (params?.offset) searchParams.set('offset', params.offset.toString())
  if (params?.status) searchParams.set('status', params.status)
  if (params?.operation) searchParams.set('operation', params.operation)
  
  const response = await fetch(`/api/bulk-processing/history?${searchParams}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch bulk processing history: ${response.statusText}`)
  }
  
  const result: SuccessResponse<{
    jobs: BulkProcessingJob[];
    total: number;
    hasMore: boolean;
  }> = await response.json()
  return result.data
}

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

/**
 * Hook to start bulk processing operations
 */
export function useStartBulkProcessing() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: startBulkProcessing,
    onSuccess: (job) => {
      // Add job to cache
      queryClient.setQueryData(bulkProcessingKeys.job(job.id), job)
      
      // Invalidate jobs list to show new job
      queryClient.invalidateQueries({ queryKey: bulkProcessingKeys.jobs() })
      queryClient.invalidateQueries({ queryKey: bulkProcessingKeys.history() })
    },
  })
}

/**
 * Hook to track bulk processing job progress with file-based polling
 */
export function useBulkProcessingProgress(jobId: BulkJobId, options?: {
  enabled?: boolean;
  pollingInterval?: number;
}) {
  const { enabled = true, pollingInterval = 3000 } = options || {} // 3 seconds default
  
  // Fetch job details
  const jobQuery = useQuery({
    queryKey: bulkProcessingKeys.job(jobId),
    queryFn: () => fetchBulkProcessingJob(jobId),
    enabled: enabled && !!jobId,
    staleTime: 1000 * 30, // 30 seconds
  })
  
  // Fetch progress from file system
  const progressQuery = useQuery({
    queryKey: bulkProcessingKeys.progress(jobId),
    queryFn: () => fetchBulkProcessingProgress(jobId),
    enabled: enabled && !!jobId,
    refetchInterval: (data, query) => {
      const job = jobQuery.data
      // Stop polling if job is completed, failed, or cancelled
      if (job?.status && ['completed', 'failed', 'cancelled'].includes(job.status)) {
        return false
      }
      return pollingInterval
    },
    staleTime: 1000, // Very short stale time for active progress
    retry: (failureCount, error) => {
      // Retry up to 3 times for progress file reads (file might not exist initially)
      return failureCount < 3
    },
  })
  
  const job = jobQuery.data
  const progress = progressQuery.data
  
  // Compute derived values
  const progressPercentage = job 
    ? Math.round((job.completed_operations / Math.max(job.total_operations, 1)) * 100)
    : 0
  
  const isRunning = job?.status === 'running' || job?.status === 'queued'
  const isCompleted = job?.status === 'completed'
  const isFailed = job?.status === 'failed'
  const isCancelled = job?.status === 'cancelled'
  
  // Estimate time remaining based on progress
  const estimatedTimeRemaining = (() => {
    if (!job || !progress || !isRunning || job.completed_operations === 0) {
      return undefined
    }
    
    const startTime = new Date(progress.startTime).getTime()
    const currentTime = new Date().getTime()
    const elapsedMs = currentTime - startTime
    const completionRate = job.completed_operations / (elapsedMs / 1000) // operations per second
    const remainingOperations = job.total_operations - job.completed_operations
    
    return Math.round(remainingOperations / completionRate) * 1000 // in milliseconds
  })()
  
  return {
    // Data
    job,
    progress,
    progressPercentage,
    estimatedTimeRemaining,
    
    // Status flags
    isRunning,
    isCompleted,
    isFailed,
    isCancelled,
    
    // Loading states
    isLoadingJob: jobQuery.isLoading,
    isLoadingProgress: progressQuery.isLoading,
    isLoading: jobQuery.isLoading || progressQuery.isLoading,
    
    // Error states
    jobError: jobQuery.error,
    progressError: progressQuery.error,
    hasError: !!jobQuery.error || !!progressQuery.error,
    
    // Actions
    refetch: () => Promise.all([jobQuery.refetch(), progressQuery.refetch()]),
    refetchJob: jobQuery.refetch,
    refetchProgress: progressQuery.refetch,
  }
}

/**
 * Hook to manage bulk processing job
 */
export function useBulkProcessingJob(jobId: BulkJobId) {
  const queryClient = useQueryClient()
  
  const cancelMutation = useMutation({
    mutationFn: () => cancelBulkProcessingJob(jobId),
    onSuccess: (updatedJob) => {
      queryClient.setQueryData(bulkProcessingKeys.job(jobId), updatedJob)
      queryClient.invalidateQueries({ queryKey: bulkProcessingKeys.history() })
    },
  })
  
  const deleteMutation = useMutation({
    mutationFn: () => deleteBulkProcessingJob(jobId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: bulkProcessingKeys.job(jobId) })
      queryClient.removeQueries({ queryKey: bulkProcessingKeys.progress(jobId) })
      queryClient.invalidateQueries({ queryKey: bulkProcessingKeys.history() })
    },
  })
  
  return {
    cancel: cancelMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}

/**
 * Hook to fetch bulk processing history
 */
export function useBulkProcessingHistory(params?: {
  limit?: number;
  offset?: number;
  status?: JobStatus;
  operation?: BulkProcessingOperation;
}) {
  return useQuery({
    queryKey: [...bulkProcessingKeys.history(), params],
    queryFn: () => fetchBulkProcessingHistory(params),
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

/**
 * Comprehensive bulk processing management hook
 */
export function useBulkProcessingManager() {
  const [activeJobs, setActiveJobs] = useState<Set<BulkJobId>>(new Set())
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<MunicipalityId[]>([])
  
  const startJob = useStartBulkProcessing()
  const history = useBulkProcessingHistory({ limit: 10 })
  
  // Start bulk processing operation
  const startBulkOperation = async (
    operation: BulkProcessingOperation,
    options?: {
      municipalityIds?: MunicipalityId[] | 'all';
      priority?: JobPriority;
      skipExisting?: boolean;
      retryFailedJobs?: boolean;
      validateResults?: boolean;
      batchSize?: number;
    }
  ) => {
    const municipalityIds = options?.municipalityIds || 
      (selectedMunicipalities.length > 0 ? selectedMunicipalities : 'all')
    
    const job = await startJob.mutateAsync({
      operation,
      municipalityIds,
      priority: options?.priority || 'normal',
      options: {
        skipExisting: options?.skipExisting ?? true,
        retryFailedJobs: options?.retryFailedJobs ?? false,
        validateResults: options?.validateResults ?? true,
        batchSize: options?.batchSize ?? 5,
      }
    })
    
    setActiveJobs(prev => new Set([...prev, job.id]))
    return job
  }
  
  // Quick start functions for common operations
  const startScrapeAll = (options?: Parameters<typeof startBulkOperation>[1]) => 
    startBulkOperation('scrape_all', options)
  
  const startAnalyzeAll = (options?: Parameters<typeof startBulkOperation>[1]) => 
    startBulkOperation('analyze_all', options)
  
  const startExtractAll = (options?: Parameters<typeof startBulkOperation>[1]) => 
    startBulkOperation('extract_all', options)
  
  const startFullPipeline = (options?: Parameters<typeof startBulkOperation>[1]) => 
    startBulkOperation('full_pipeline_all', options)
  
  const startMunicipalityBatch = (municipalityIds: MunicipalityId[], options?: Parameters<typeof startBulkOperation>[1]) => 
    startBulkOperation('municipality_batch', { ...options, municipalityIds })
  
  // Remove job from active tracking
  const removeActiveJob = (jobId: BulkJobId) => {
    setActiveJobs(prev => {
      const next = new Set(prev)
      next.delete(jobId)
      return next
    })
  }
  
  // Get running jobs from history
  const runningJobs = history.data?.jobs.filter(job => 
    ['queued', 'running'].includes(job.status)
  ) || []
  
  const completedJobs = history.data?.jobs.filter(job => 
    job.status === 'completed'
  ) || []
  
  const failedJobs = history.data?.jobs.filter(job => 
    job.status === 'failed'
  ) || []
  
  return {
    // Data
    activeJobs: Array.from(activeJobs),
    runningJobs,
    completedJobs,
    failedJobs,
    allJobs: history.data?.jobs || [],
    selectedMunicipalities,
    
    // Loading states
    isStarting: startJob.isPending,
    isLoadingHistory: history.isLoading,
    
    // Actions
    setSelectedMunicipalities,
    startBulkOperation,
    startScrapeAll,
    startAnalyzeAll,
    startExtractAll,
    startFullPipeline,
    startMunicipalityBatch,
    removeActiveJob,
    
    // Utilities
    refetchHistory: history.refetch,
    hasRunningJobs: runningJobs.length > 0,
    hasSelection: selectedMunicipalities.length > 0,
    
    // Selection helpers
    selectAll: () => {
      // This would need municipalities data - could be passed as prop or fetched
      // For now, clear selection to indicate "all"
      setSelectedMunicipalities([])
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
 * Hook to track multiple bulk processing jobs
 */
export function useMultipleBulkProcessingJobs(jobIds: BulkJobId[]) {
  const queries = jobIds.map(jobId => ({
    queryKey: bulkProcessingKeys.job(jobId),
    queryFn: () => fetchBulkProcessingJob(jobId),
    enabled: !!jobId,
    staleTime: 1000 * 30, // 30 seconds
  }))

  const results = queries.map(({ queryKey, ...queryOptions }) => 
    useQuery({ queryKey, ...queryOptions })
  )

  return {
    jobs: results.map(r => r.data).filter(Boolean) as BulkProcessingJob[],
    isLoading: results.some(r => r.isLoading),
    isError: results.some(r => r.isError),
    errors: results.map(r => r.error).filter(Boolean),
    refetchAll: () => Promise.all(results.map(r => r.refetch())),
  }
}