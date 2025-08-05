import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { 
  MunicipalityId,
  ApiResponse,
  SuccessResponse
} from "@/types/database"
import type {
  ScrapingPhaseParams,
  ScrapingPhaseResult,
  ExtractionPhaseParams,
  ExtractionPhaseResult,
  AnalysisPhaseParams,
  AnalysisPhaseResult,
  CompletePipelineParams,
  CompletePipelineResult,
  ProgressReport,
  PipelineStage
} from "@/lib/service-types"

// Types for filesystem scrapers
export interface FilesystemScraper {
  name: string;
  displayName: string;
  filePath: string;
  version: string;
  description?: string;
  estimatedPages?: number;
  estimatedDocuments?: number;
  fileSize?: number;
  lastModified?: string;
  capabilities: string[];
  metadata: {
    author?: string;
    created?: string;
    dependencies?: string[];
    testUrl?: string;
  };
}

export interface FilesystemScraperStats {
  total: number;
  v1: number;
  v2: number;
  enhanced: number;
  totalSize: number;
  averageSize: number;
}

export interface TestScraperRequest {
  scraperName: string;
  municipalityId: MunicipalityId;
  options?: {
    dryRun?: boolean;
    maxPages?: number;
    timeout?: number;
    testMode?: 'test' | 'production';
    phase?: 'scraping' | 'extraction' | 'analysis' | 'complete';
  };
}

export interface PipelinePhaseRequest {
  phase: 'scraping' | 'extraction' | 'analysis' | 'complete';
  municipalities: MunicipalityId[];
  options?: {
    testMode?: boolean;
    resumeFrom?: string;
    config?: Record<string, unknown>;
    timeout?: number;
  };
}

export interface TestScraperResult {
  testResults: {
    success: boolean;
    documentsFound: number;
    pagesScraped: number;
    duration: number;
    errors: string[];
    warnings: string[];
    phase?: string;
    progressReports?: ProgressReport[];
  };
  scraper: {
    name: string;
    testedAgainst: {
      id: MunicipalityId;
      name: string;
      websiteUrl: string;
    };
  };
  testOptions: any;
}

export interface PipelinePhaseResult {
  phase: string;
  success: boolean;
  results: ScrapingPhaseResult | ExtractionPhaseResult | AnalysisPhaseResult | CompletePipelineResult;
  progressReports: ProgressReport[];
  duration: number;
  errors: string[];
  warnings: string[];
}

// Query key factory
const filesystemScraperKeys = {
  all: ['filesystem-scrapers'] as const,
  list: () => [...filesystemScraperKeys.all, 'list'] as const,
  test: (scraperName: string, municipalityId: MunicipalityId) => 
    [...filesystemScraperKeys.all, 'test', scraperName, municipalityId] as const,
  pipelinePhase: (phase: string, municipalities: MunicipalityId[]) =>
    [...filesystemScraperKeys.all, 'pipeline', phase, municipalities.sort().join(',')] as const,
}

// Fetch all scrapers from filesystem
async function fetchFilesystemScrapers(): Promise<{
  scrapers: FilesystemScraper[];
  stats: FilesystemScraperStats;
}> {
  const response = await fetch('/api/scrapers/filesystem')
  
  if (!response.ok) {
    throw new Error(`Failed to fetch filesystem scrapers: ${response.statusText}`)
  }
  
  const result: SuccessResponse<FilesystemScraper[]> & { stats: FilesystemScraperStats } = await response.json()
  return {
    scrapers: result.data,
    stats: result.stats
  }
}

// Test scraper against municipality
async function testScraperAgainstMunicipality(request: TestScraperRequest): Promise<TestScraperResult> {
  console.log('DEBUG - Client sending test request:', request)
  
  const response = await fetch('/api/scrapers/test-against-municipality', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  
  if (!response.ok) {
    const error = await response.json()
    console.log('DEBUG - Server error response:', error)
    throw new Error(error.error || 'Failed to test scraper')
  }
  
  const result: SuccessResponse<TestScraperResult> = await response.json()
  return result.data
}

// Run pipeline phase
async function runPipelinePhase(request: PipelinePhaseRequest): Promise<PipelinePhaseResult> {
  console.log('DEBUG - Client sending pipeline phase request:', request)
  
  const response = await fetch(`/api/pipeline/${request.phase}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      municipalities: request.municipalities,
      ...request.options
    }),
  })
  
  if (!response.ok) {
    const error = await response.json()
    console.log('DEBUG - Pipeline phase error response:', error)
    throw new Error(error.error || `Failed to run ${request.phase} phase`)
  }
  
  const result: SuccessResponse<PipelinePhaseResult> = await response.json()
  return result.data
}

// Test individual phase against municipality
async function testPhaseAgainstMunicipality(
  phase: 'scraping' | 'extraction' | 'analysis',
  municipalityIds: MunicipalityId[],
  options: Record<string, unknown> = {}
): Promise<PipelinePhaseResult> {
  const request: PipelinePhaseRequest = {
    phase,
    municipalities: municipalityIds,
    options: {
      testMode: true,
      ...options
    }
  }
  
  return runPipelinePhase(request)
}

/**
 * Hook to fetch all scrapers from filesystem
 */
export function useFilesystemScrapers() {
  return useQuery({
    queryKey: filesystemScraperKeys.list(),
    queryFn: fetchFilesystemScrapers,
    staleTime: 1000 * 60 * 10, // 10 minutes - filesystem doesn't change often
    refetchInterval: false, // Only manual refresh for filesystem scrapers
  })
}

/**
 * Hook to test a scraper against a municipality
 */
export function useTestScraperAgainstMunicipality() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: testScraperAgainstMunicipality,
    onSuccess: (result) => {
      // Cache the test result for quick access
      queryClient.setQueryData(
        filesystemScraperKeys.test(result.scraper.name, result.scraper.testedAgainst.id),
        result
      )
    },
  })
}

/**
 * Hook to run pipeline phases
 */
export function usePipelinePhase() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: runPipelinePhase,
    onSuccess: (result, variables) => {
      // Cache the phase result
      queryClient.setQueryData(
        filesystemScraperKeys.pipelinePhase(variables.phase, variables.municipalities),
        result
      )
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['scrape-logs'] })
    },
  })
}

/**
 * Hook to test individual phases
 */
export function useTestPhaseAgainstMunicipality() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ phase, municipalityIds, options = {} }: {
      phase: 'scraping' | 'extraction' | 'analysis';
      municipalityIds: MunicipalityId[];
      options?: Record<string, unknown>;
    }) => testPhaseAgainstMunicipality(phase, municipalityIds, options),
    onSuccess: (result, variables) => {
      // Cache the test result
      queryClient.setQueryData(
        filesystemScraperKeys.pipelinePhase(variables.phase, variables.municipalityIds),
        result
      )
    },
  })
}

/**
 * Enhanced filesystem scraper management hook
 */
export function useFilesystemScraperManagement() {
  const [testingScrapers, setTestingScrapers] = useState<Set<string>>(new Set())
  const [selectedScrapers, setSelectedScrapers] = useState<string[]>([])
  const [runningPhases, setRunningPhases] = useState<Set<string>>(new Set())
  const [progressReports, setProgressReports] = useState<Map<string, ProgressReport[]>>(new Map())
  
  const { data, isLoading, error, refetch } = useFilesystemScrapers()
  const testScraper = useTestScraperAgainstMunicipality()
  const pipelinePhase = usePipelinePhase()
  const testPhase = useTestPhaseAgainstMunicipality()

  // Start test for a scraper against a municipality
  const startTest = async (scraperName: string, municipalityId: MunicipalityId, options?: TestScraperRequest['options']) => {
    setTestingScrapers(prev => new Set([...prev, scraperName]))
    
    try {
      const result = await testScraper.mutateAsync({
        scraperName,
        municipalityId,
        options
      })
      return result
    } finally {
      setTestingScrapers(prev => {
        const next = new Set(prev)
        next.delete(scraperName)
        return next
      })
    }
  }

  // Run pipeline phase
  const runPhase = async (
    phase: 'scraping' | 'extraction' | 'analysis' | 'complete',
    municipalities: MunicipalityId[],
    options: Record<string, unknown> = {}
  ) => {
    const phaseKey = `${phase}-${municipalities.join(',')}`
    setRunningPhases(prev => new Set([...prev, phaseKey]))
    setProgressReports(prev => new Map(prev.set(phaseKey, [])))
    
    try {
      const result = await pipelinePhase.mutateAsync({
        phase,
        municipalities,
        options
      })
      return result
    } finally {
      setRunningPhases(prev => {
        const next = new Set(prev)
        next.delete(phaseKey)
        return next
      })
    }
  }

  // Test individual phase
  const testPipelinePhase = async (
    phase: 'scraping' | 'extraction' | 'analysis',
    municipalityIds: MunicipalityId[],
    options: Record<string, unknown> = {}
  ) => {
    const phaseKey = `test-${phase}-${municipalityIds.join(',')}`
    setRunningPhases(prev => new Set([...prev, phaseKey]))
    setProgressReports(prev => new Map(prev.set(phaseKey, [])))
    
    try {
      const result = await testPhase.mutateAsync({
        phase,
        municipalityIds,
        options
      })
      return result
    } finally {
      setRunningPhases(prev => {
        const next = new Set(prev)
        next.delete(phaseKey)
        return next
      })
    }
  }

  // Update progress for a specific operation
  const updateProgress = (operationKey: string, progress: ProgressReport) => {
    setProgressReports(prev => {
      const current = prev.get(operationKey) || []
      return new Map(prev.set(operationKey, [...current, progress]))
    })
  }

  // Filter scrapers by version
  const scrapersByVersion = {
    all: data?.scrapers || [],
    v1: data?.scrapers.filter(s => s.version === 'v1') || [],
    v2: data?.scrapers.filter(s => s.version === 'v2') || [],
    enhanced: data?.scrapers.filter(s => s.version === 'enhanced') || [],
  }

  // Get scrapers with specific capabilities
  const getScrapersWithCapability = (capability: string) => {
    return data?.scrapers.filter(s => s.capabilities.includes(capability)) || []
  }

  return {
    // Data
    scrapers: data?.scrapers || [],
    stats: data?.stats,
    scrapersByVersion,
    selectedScrapers,
    testingScrapers: Array.from(testingScrapers),
    runningPhases: Array.from(runningPhases),
    progressReports,
    
    // Loading states
    isLoading,
    isTesting: testScraper.isPending || testingScrapers.size > 0,
    isRunningPhase: pipelinePhase.isPending || testPhase.isPending || runningPhases.size > 0,
    error,
    
    // Actions
    setSelectedScrapers,
    startTest,
    runPhase,
    testPipelinePhase,
    updateProgress,
    refetch,
    
    // Utilities
    hasScrapers: (data?.scrapers.length || 0) > 0,
    hasSelection: selectedScrapers.length > 0,
    getScrapersWithCapability,
    
    // Selection helpers
    selectAll: () => setSelectedScrapers(data?.scrapers.map(s => s.name) || []),
    selectNone: () => setSelectedScrapers([]),
    selectByVersion: (version: string) => {
      const scrapers = version === 'all' 
        ? data?.scrapers || []
        : data?.scrapers.filter(s => s.version === version) || []
      setSelectedScrapers(scrapers.map(s => s.name))
    },
    toggleScraper: (name: string) => {
      setSelectedScrapers(prev => 
        prev.includes(name) 
          ? prev.filter(x => x !== name)
          : [...prev, name]
      )
    },
  }
}