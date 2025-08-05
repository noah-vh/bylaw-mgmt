import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { 
  ProcessingJobRequest,
  ProcessingOperation,
  BackgroundJob,
  DetailedJobStatus,
  MunicipalityId,
  DocumentId,
  JobId,
  JobPriority,
  ApiResponse,
  SuccessResponse
} from "@/types/database"

// Query key factory
const processingKeys = {
  all: ['processing'] as const,
  jobs: () => [...processingKeys.all, 'jobs'] as const,
  jobDetail: (id: JobId) => [...processingKeys.jobs(), id] as const,
  byOperation: (operation: ProcessingOperation) => [...processingKeys.jobs(), operation] as const,
}

// Start processing job
async function startProcessingJob(request: ProcessingJobRequest): Promise<BackgroundJob> {
  const response = await fetch('/api/processing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to start processing job')
  }
  
  const result: SuccessResponse<BackgroundJob> = await response.json()
  return result.data
}

// Fetch processing job status
async function fetchProcessingJobStatus(jobId: JobId): Promise<DetailedJobStatus> {
  const response = await fetch(`/api/processing/${jobId}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch job status: ${response.statusText}`)
  }
  
  const result: SuccessResponse<DetailedJobStatus> = await response.json()
  return result.data
}

// Cancel processing job
async function cancelProcessingJob(jobId: JobId): Promise<DetailedJobStatus> {
  const response = await fetch(`/api/processing/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to cancel processing job')
  }
  
  const result: SuccessResponse<DetailedJobStatus> = await response.json()
  return result.data
}

// Delete processing job
async function deleteProcessingJob(jobId: JobId): Promise<void> {
  const response = await fetch(`/api/processing/${jobId}`, {
    method: 'DELETE',
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete processing job')
  }
}

// Custom hooks

/**
 * Hook to start a processing job
 */
export function useStartProcessingJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: startProcessingJob,
    onSuccess: (job) => {
      // Add job to cache
      queryClient.setQueryData(processingKeys.jobDetail(job.id), job)
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: processingKeys.jobs() })
    },
  })
}

/**
 * Hook to get processing job status with automatic polling
 */
export function useProcessingJobStatus(jobId: JobId, options?: {
  enabled?: boolean
  pollingInterval?: number
}) {
  const { enabled = true, pollingInterval = 2000 } = options || {}
  
  return useQuery({
    queryKey: processingKeys.jobDetail(jobId),
    queryFn: () => fetchProcessingJobStatus(jobId),
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
 * Hook to cancel a processing job
 */
export function useCancelProcessingJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: cancelProcessingJob,
    onSuccess: (updatedJob) => {
      // Update job in cache
      queryClient.setQueryData(processingKeys.jobDetail(updatedJob.id), updatedJob)
      
      // Invalidate jobs list
      queryClient.invalidateQueries({ queryKey: processingKeys.jobs() })
    },
  })
}

/**
 * Hook to delete a processing job
 */
export function useDeleteProcessingJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: deleteProcessingJob,
    onSuccess: (_, jobId) => {
      // Remove job from cache
      queryClient.removeQueries({ queryKey: processingKeys.jobDetail(jobId) })
      
      // Invalidate jobs list
      queryClient.invalidateQueries({ queryKey: processingKeys.jobs() })
    },
  })
}

/**
 * Hook for managing document processing operations
 */
export function useDocumentProcessing() {
  const [selectedDocuments, setSelectedDocuments] = useState<DocumentId[]>([])
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<MunicipalityId[]>([])
  const [activeJobs, setActiveJobs] = useState<Set<JobId>>(new Set())
  
  const startJob = useStartProcessingJob()
  const cancelJob = useCancelProcessingJob()
  const deleteJob = useDeleteProcessingJob()

  // Start extraction job
  const startExtraction = async (options?: {
    priority?: JobPriority
    skipExisting?: boolean
    retryFailedJobs?: boolean
    validateResults?: boolean
    batchSize?: number
  }) => {
    if (selectedDocuments.length === 0 && selectedMunicipalities.length === 0) {
      throw new Error('No documents or municipalities selected')
    }

    const request: ProcessingJobRequest = {
      operation: 'extract',
      ...(selectedMunicipalities.length > 0 && { municipalityIds: selectedMunicipalities }),
      ...(selectedDocuments.length > 0 && { documentIds: selectedDocuments }),
      options: {
        priority: 'normal',
        skipExisting: false,
        retryFailedJobs: true,
        validateResults: true,
        batchSize: 10,
        ...options
      }
    }

    const job = await startJob.mutateAsync(request)
    setActiveJobs(prev => new Set([...prev, job.id]))
    return job
  }

  // Start analysis job
  const startAnalysis = async (options?: {
    priority?: JobPriority
    skipExisting?: boolean
    retryFailedJobs?: boolean
    validateResults?: boolean
    batchSize?: number
  }) => {
    if (selectedDocuments.length === 0 && selectedMunicipalities.length === 0) {
      throw new Error('No documents or municipalities selected')
    }

    const request: ProcessingJobRequest = {
      operation: 'analyze',
      ...(selectedMunicipalities.length > 0 && { municipalityIds: selectedMunicipalities }),
      ...(selectedDocuments.length > 0 && { documentIds: selectedDocuments }),
      options: {
        priority: 'normal',
        skipExisting: false,
        retryFailedJobs: true,
        validateResults: true,
        batchSize: 5, // Smaller batch size for analysis
        ...options
      }
    }

    const job = await startJob.mutateAsync(request)
    setActiveJobs(prev => new Set([...prev, job.id]))
    return job
  }

  // Start full pipeline (scrape + extract + analyze)
  const startFullPipeline = async (municipalityIds: MunicipalityId[], options?: {
    priority?: JobPriority
    skipExisting?: boolean
    retryFailedJobs?: boolean
    validateResults?: boolean
    batchSize?: number
  }) => {
    if (municipalityIds.length === 0) {
      throw new Error('No municipalities specified')
    }

    const request: ProcessingJobRequest = {
      operation: 'full_pipeline',
      municipalityIds,
      options: {
        priority: 'normal',
        skipExisting: false,
        retryFailedJobs: true,
        validateResults: true,
        batchSize: 5,
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

  return {
    // State
    selectedDocuments,
    selectedMunicipalities,
    activeJobs: Array.from(activeJobs),
    
    // Loading states
    isStartingJob: startJob.isPending,
    isCancellingJob: cancelJob.isPending,
    isDeletingJob: deleteJob.isPending,
    
    // Actions
    setSelectedDocuments,
    setSelectedMunicipalities,
    startExtraction,
    startAnalysis,
    startFullPipeline,
    cancelActiveJob,
    deleteActiveJob,
    
    // Selection utilities
    hasDocumentSelection: selectedDocuments.length > 0,
    hasMunicipalitySelection: selectedMunicipalities.length > 0,
    hasSelection: selectedDocuments.length > 0 || selectedMunicipalities.length > 0,
    
    // Selection helpers
    selectAllDocuments: (documentIds: DocumentId[]) => setSelectedDocuments(documentIds),
    selectAllMunicipalities: (municipalityIds: MunicipalityId[]) => setSelectedMunicipalities(municipalityIds),
    clearDocumentSelection: () => setSelectedDocuments([]),
    clearMunicipalitySelection: () => setSelectedMunicipalities([]),
    clearAllSelections: () => {
      setSelectedDocuments([])
      setSelectedMunicipalities([])
    },
    
    toggleDocument: (id: DocumentId) => {
      setSelectedDocuments(prev => 
        prev.includes(id) 
          ? prev.filter(x => x !== id)
          : [...prev, id]
      )
    },
    
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
 * Hook for batch processing operations
 */
export function useBatchProcessing() {
  const processing = useDocumentProcessing()
  
  // Batch extract documents by municipality
  const batchExtractByMunicipality = async (
    municipalityIds: MunicipalityId[],
    options?: { priority?: JobPriority; batchSize?: number }
  ) => {
    const jobs: BackgroundJob[] = []
    
    // Process municipalities in smaller batches to avoid overwhelming the system
    const batchSize = options?.batchSize || 3
    for (let i = 0; i < municipalityIds.length; i += batchSize) {
      const batch = municipalityIds.slice(i, i + batchSize)
      
      const request: ProcessingJobRequest = {
        operation: 'extract',
        municipalityIds: batch,
        options: {
          priority: options?.priority || 'normal',
          skipExisting: true,
          retryFailedJobs: true,
          validateResults: true,
          batchSize: 10
        }
      }
      
      const job = await processing.startJob.mutateAsync(request)
      jobs.push(job)
      
      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < municipalityIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    return jobs
  }

  // Batch analyze documents
  const batchAnalyzeDocuments = async (
    documentIds: DocumentId[],
    options?: { priority?: JobPriority; batchSize?: number }
  ) => {
    const jobs: BackgroundJob[] = []
    
    // Process documents in smaller batches
    const batchSize = options?.batchSize || 20
    for (let i = 0; i < documentIds.length; i += batchSize) {
      const batch = documentIds.slice(i, i + batchSize)
      
      const request: ProcessingJobRequest = {
        operation: 'analyze',
        documentIds: batch,
        options: {
          priority: options?.priority || 'normal',
          skipExisting: true,
          retryFailedJobs: true,
          validateResults: true,
          batchSize: 5
        }
      }
      
      const job = await processing.startJob.mutateAsync(request)
      jobs.push(job)
      
      // Small delay between batches
      if (i + batchSize < documentIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    return jobs
  }

  return {
    ...processing,
    batchExtractByMunicipality,
    batchAnalyzeDocuments,
  }
}

/**
 * Hook to track multiple job statuses at once
 */
export function useMultipleProcessingJobStatuses(jobIds: JobId[]) {
  const queries = jobIds.map(jobId => ({
    queryKey: processingKeys.jobDetail(jobId),
    queryFn: () => fetchProcessingJobStatus(jobId),
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

  const jobs = results.map(r => r.data).filter(Boolean) as DetailedJobStatus[]
  
  // Calculate aggregate statistics
  const stats = {
    total: jobs.length,
    running: jobs.filter(j => j.status === 'running').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    cancelled: jobs.filter(j => j.status === 'cancelled').length,
    queued: jobs.filter(j => j.status === 'queued' || j.status === 'pending').length,
    averageProgress: jobs.length > 0 
      ? Math.round(jobs.reduce((sum, job) => sum + job.progress, 0) / jobs.length)
      : 0
  }

  return {
    jobs,
    stats,
    isLoading: results.some(r => r.isLoading),
    isError: results.some(r => r.isError),
    errors: results.map(r => r.error).filter(Boolean),
    refetchAll: () => Promise.all(results.map(r => r.refetch())),
    
    // Convenience getters
    runningJobs: jobs.filter(j => j.status === 'running'),
    completedJobs: jobs.filter(j => j.status === 'completed'),
    failedJobs: jobs.filter(j => j.status === 'failed'),
    queuedJobs: jobs.filter(j => j.status === 'queued' || j.status === 'pending'),
    
    // Check if all jobs are done
    allCompleted: stats.running === 0 && stats.queued === 0,
    hasFailures: stats.failed > 0,
    isProcessing: stats.running > 0 || stats.queued > 0,
  }
}

/**
 * Hook for processing workflow management
 */
export function useProcessingWorkflow() {
  const [workflow, setWorkflow] = useState<{
    currentStep: ProcessingOperation | null
    municipalityIds: MunicipalityId[]
    completedSteps: ProcessingOperation[]
    activeJobIds: JobId[]
  }>({
    currentStep: null,
    municipalityIds: [],
    completedSteps: [],
    activeJobIds: []
  })

  const startJob = useStartProcessingJob()
  const jobStatuses = useMultipleProcessingJobStatuses(workflow.activeJobIds)

  // Start a complete processing workflow for municipalities
  const startWorkflow = async (municipalityIds: MunicipalityId[]) => {
    setWorkflow({
      currentStep: 'scrape',
      municipalityIds,
      completedSteps: [],
      activeJobIds: []
    })

    // Start with scraping
    const scrapeRequest: ProcessingJobRequest = {
      operation: 'scrape',
      municipalityIds,
      options: { priority: 'normal', skipExisting: false }
    }

    const scrapeJob = await startJob.mutateAsync(scrapeRequest)
    setWorkflow(prev => ({
      ...prev,
      activeJobIds: [scrapeJob.id]
    }))

    return scrapeJob
  }

  // Continue to next step when current step completes
  const continueWorkflow = async () => {
    const { currentStep, municipalityIds, completedSteps } = workflow
    
    if (!currentStep) return

    const nextSteps: Record<ProcessingOperation, ProcessingOperation | null> = {
      'scrape': 'extract',
      'extract': 'analyze',
      'analyze': null,
      'full_pipeline': null
    }

    const nextStep = nextSteps[currentStep]
    if (!nextStep) {
      // Workflow complete
      setWorkflow(prev => ({
        ...prev,
        currentStep: null,
        completedSteps: [...prev.completedSteps, currentStep]
      }))
      return
    }

    // Start next step
    const request: ProcessingJobRequest = {
      operation: nextStep,
      municipalityIds,
      options: { priority: 'normal', skipExisting: false }
    }

    const job = await startJob.mutateAsync(request)
    setWorkflow(prev => ({
      ...prev,
      currentStep: nextStep,
      completedSteps: [...prev.completedSteps, currentStep],
      activeJobIds: [job.id]
    }))

    return job
  }

  // Reset workflow
  const resetWorkflow = () => {
    setWorkflow({
      currentStep: null,
      municipalityIds: [],
      completedSteps: [],
      activeJobIds: []
    })
  }

  return {
    workflow,
    jobStatuses,
    startWorkflow,
    continueWorkflow,
    resetWorkflow,
    
    // Status helpers
    isWorkflowActive: workflow.currentStep !== null,
    isWorkflowComplete: workflow.currentStep === null && workflow.completedSteps.length > 0,
    canContinue: jobStatuses.allCompleted && workflow.currentStep !== null,
    hasErrors: jobStatuses.hasFailures,
  }
}