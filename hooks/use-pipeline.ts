"use client"

import { useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MunicipalityId } from '@/types/database'

// Pipeline operation types
export type PipelinePhase = 'scraping' | 'extraction' | 'analysis' | 'complete'

export interface PipelineOptions {
  skipExisting?: boolean
  batchSize?: number
  maxRetries?: number
}

export interface PipelineResult {
  success: boolean
  phase: PipelinePhase
  totalDocuments?: number
  newDocuments?: number
  duration?: number
  municipalities: {
    id: number
    name: string
    success: boolean
    documentsFound?: number
    documentsNew?: number
    error?: string
  }[]
}

export interface PipelineStatus {
  isRunning: boolean
  currentPhase?: PipelinePhase
  progress?: number
  totalMunicipalities?: number
  completedMunicipalities?: number
  currentMunicipality?: {
    id: number
    name: string
  }
  startTime?: string
  estimatedTimeRemaining?: number
}

// Hook for running individual pipeline phases
export function usePipelinePhase() {
  const queryClient = useQueryClient()

  const runPhase = useCallback(async (
    phase: PipelinePhase,
    municipalities: MunicipalityId[] | 'all',
    options: PipelineOptions = {}
  ): Promise<PipelineResult> => {
    const endpoint = phase === 'complete' ? '/api/pipeline/complete' : `/api/pipeline/${phase}`
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        municipalities,
        options
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || `Failed to run ${phase} phase`)
    }

    const result = await response.json()
    return result.data
  }, [])

  const scrapingMutation = useMutation({
    mutationFn: ({ municipalities, options }: { municipalities: MunicipalityId[] | 'all', options?: PipelineOptions }) =>
      runPhase('scraping', municipalities, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['municipalities'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-status'] })
    }
  })

  const extractionMutation = useMutation({
    mutationFn: ({ municipalities, options }: { municipalities: MunicipalityId[] | 'all', options?: PipelineOptions }) =>
      runPhase('extraction', municipalities, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['municipalities'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-status'] })
    }
  })

  const analysisMutation = useMutation({
    mutationFn: ({ municipalities, options }: { municipalities: MunicipalityId[] | 'all', options?: PipelineOptions }) =>
      runPhase('analysis', municipalities, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['municipalities'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-status'] })
    }
  })

  const completePipelineMutation = useMutation({
    mutationFn: ({ municipalities, options }: { municipalities: MunicipalityId[] | 'all', options?: PipelineOptions }) =>
      runPhase('complete', municipalities, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['municipalities'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-status'] })
    }
  })

  return {
    runScraping: scrapingMutation.mutateAsync,
    runExtraction: extractionMutation.mutateAsync,
    runAnalysis: analysisMutation.mutateAsync,
    runCompletePipeline: completePipelineMutation.mutateAsync,
    isRunning: scrapingMutation.isPending || extractionMutation.isPending || 
               analysisMutation.isPending || completePipelineMutation.isPending,
    scrapingStatus: {
      isPending: scrapingMutation.isPending,
      isError: scrapingMutation.isError,
      error: scrapingMutation.error,
      data: scrapingMutation.data
    },
    extractionStatus: {
      isPending: extractionMutation.isPending,
      isError: extractionMutation.isError,
      error: extractionMutation.error,
      data: extractionMutation.data
    },
    analysisStatus: {
      isPending: analysisMutation.isPending,
      isError: analysisMutation.isError,
      error: analysisMutation.error,
      data: analysisMutation.data
    },
    completePipelineStatus: {
      isPending: completePipelineMutation.isPending,
      isError: completePipelineMutation.isError,
      error: completePipelineMutation.error,
      data: completePipelineMutation.data
    }
  }
}

// Hook for getting pipeline status
export function usePipelineStatus() {
  return useQuery({
    queryKey: ['pipeline-status'],
    queryFn: async (): Promise<PipelineStatus> => {
      const response = await fetch('/api/pipeline/status')
      if (!response.ok) {
        throw new Error('Failed to fetch pipeline status')
      }
      const result = await response.json()
      return result.data
    },
    refetchInterval: 2000, // Refetch every 2 seconds when there's an active job
    refetchIntervalInBackground: false
  })
}

// Hook for managing municipality pipeline states
export function useMunicipalityPipelineStates() {
  const [municipalityStates, setMunicipalityStates] = useState<Record<number, {
    currentPhase?: PipelinePhase
    isProcessing: boolean
    lastRun?: string
    status?: 'idle' | 'running' | 'success' | 'error'
    error?: string
  }>>({})

  const updateMunicipalityState = useCallback((
    municipalityId: number,
    updates: Partial<typeof municipalityStates[number]>
  ) => {
    setMunicipalityStates(prev => ({
      ...prev,
      [municipalityId]: {
        ...prev[municipalityId],
        ...updates
      }
    }))
  }, [])

  const clearMunicipalityState = useCallback((municipalityId: number) => {
    setMunicipalityStates(prev => {
      const { [municipalityId]: _, ...rest } = prev
      return rest
    })
  }, [])

  const clearAllStates = useCallback(() => {
    setMunicipalityStates({})
  }, [])

  return {
    municipalityStates,
    updateMunicipalityState,
    clearMunicipalityState,
    clearAllStates
  }
}

// Hook for bulk pipeline operations
export function useBulkPipelineOperations() {
  const { runScraping, runExtraction, runAnalysis, runCompletePipeline, isRunning } = usePipelinePhase()
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<number[]>([])
  const [operationStatus, setOperationStatus] = useState<{
    operation?: PipelinePhase
    progress: number
    currentMunicipality?: string
    completed: number
    total: number
    errors: string[]
  }>({
    progress: 0,
    completed: 0,
    total: 0,
    errors: []
  })

  const runBulkOperation = useCallback(async (
    operation: PipelinePhase,
    municipalities: number[] | 'all',
    options: PipelineOptions = {}
  ) => {
    setOperationStatus({
      operation,
      progress: 0,
      completed: 0,
      total: Array.isArray(municipalities) ? municipalities.length : 25, // Approximate for 'all'
      errors: []
    })

    try {
      let result: PipelineResult
      
      switch (operation) {
        case 'scraping':
          result = await runScraping({ municipalities: municipalities as MunicipalityId[] | 'all', options })
          break
        case 'extraction':
          result = await runExtraction({ municipalities: municipalities as MunicipalityId[] | 'all', options })
          break
        case 'analysis':
          result = await runAnalysis({ municipalities: municipalities as MunicipalityId[] | 'all', options })
          break
        case 'complete':
          result = await runCompletePipeline({ municipalities: municipalities as MunicipalityId[] | 'all', options })
          break
        default:
          throw new Error(`Unknown operation: ${operation}`)
      }

      setOperationStatus(prev => ({
        ...prev,
        progress: 100,
        completed: result.municipalities.filter(m => m.success).length,
        errors: result.municipalities.filter(m => !m.success).map(m => m.error || 'Unknown error')
      }))

      return result
    } catch (error) {
      setOperationStatus(prev => ({
        ...prev,
        errors: [...prev.errors, error instanceof Error ? error.message : 'Unknown error']
      }))
      throw error
    }
  }, [runScraping, runExtraction, runAnalysis, runCompletePipeline])

  const resetOperationStatus = useCallback(() => {
    setOperationStatus({
      progress: 0,
      completed: 0,
      total: 0,
      errors: []
    })
  }, [])

  return {
    selectedMunicipalities,
    setSelectedMunicipalities,
    operationStatus,
    runBulkOperation,
    resetOperationStatus,
    isRunning
  }
}

// Pipeline phase utilities
export const getPipelinePhaseColor = (phase: PipelinePhase) => {
  switch (phase) {
    case 'scraping': return 'bg-blue-500'
    case 'extraction': return 'bg-yellow-500'
    case 'analysis': return 'bg-green-500'
    case 'complete': return 'bg-purple-500'
    default: return 'bg-gray-500'
  }
}

export const getPipelinePhaseIcon = (phase: PipelinePhase) => {
  switch (phase) {
    case 'scraping': return 'Download'
    case 'extraction': return 'FileText'
    case 'analysis': return 'Brain'
    case 'complete': return 'CheckCircle'
    default: return 'Circle'
  }
}

export const getPipelinePhaseLabel = (phase: PipelinePhase) => {
  switch (phase) {
    case 'scraping': return 'Scraping'
    case 'extraction': return 'Extraction'
    case 'analysis': return 'Analysis'
    case 'complete': return 'Complete Pipeline'
    default: return 'Unknown'
  }
}