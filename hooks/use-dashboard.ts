import { useQuery } from "@tanstack/react-query"
import type { 
  BackgroundJob, 
  JobStatus,
  JobType,
  Municipality,
  PdfDocument,
  MunicipalityId
} from "@/types/database"

// Dashboard statistics interface
interface DashboardStats {
  totalMunicipalities: number
  totalDocuments: number
  relevantDocuments: number
  activeJobs: number
  completedJobsToday: number
  successRate: number
  averageConfidence: number
  recentActivity: Array<{
    id: string
    type: 'scrape' | 'analysis' | 'document_added' | 'municipality_added'
    message: string
    timestamp: string
    status?: 'success' | 'error' | 'warning'
    municipalityId?: MunicipalityId
    municipalityName?: string
  }>
}

// Recent documents interface
interface RecentDocument extends PdfDocument {
  municipality?: Pick<Municipality, 'id' | 'name'>
}

// Query key factory
const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
  activity: () => [...dashboardKeys.all, 'activity'] as const,
  recentDocuments: () => [...dashboardKeys.all, 'recent-documents'] as const,
  activeJobs: () => [...dashboardKeys.all, 'active-jobs'] as const,
  quickStats: () => [...dashboardKeys.all, 'quick-stats'] as const,
}

// Fetch dashboard statistics
async function fetchDashboardStats(): Promise<DashboardStats> {
  const response = await fetch('/api/dashboard/stats')
  
  if (!response.ok) {
    throw new Error(`Failed to fetch dashboard stats: ${response.statusText}`)
  }
  
  return response.json()
}

// Fetch recent documents
async function fetchRecentDocuments(limit = 10): Promise<RecentDocument[]> {
  const response = await fetch(`/api/documents?limit=${limit}&sort=date_found&order=desc`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch recent documents: ${response.statusText}`)
  }
  
  const result = await response.json()
  return result.data
}

// Fetch active jobs
async function fetchActiveJobs(): Promise<BackgroundJob[]> {
  const response = await fetch('/api/background-jobs?status=pending,running&limit=20')
  
  if (!response.ok) {
    throw new Error(`Failed to fetch active jobs: ${response.statusText}`)
  }
  
  const result = await response.json()
  return result.data || []
}

// Fetch quick stats for overview cards
async function fetchQuickStats(): Promise<{
  municipalities: { total: number; active: number; pending: number }
  documents: { total: number; analyzed: number; relevant: number }
  jobs: { active: number; completed: number; failed: number }
}> {
  const response = await fetch('/api/dashboard/quick-stats')
  
  if (!response.ok) {
    throw new Error(`Failed to fetch quick stats: ${response.statusText}`)
  }
  
  const result = await response.json()
  return result
}

// Custom hooks
export function useDashboardStats() {
  return useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: fetchDashboardStats,
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 1000 * 60 * 5, // Auto-refresh every 5 minutes
  })
}

export function useRecentDocuments(limit = 10) {
  return useQuery({
    queryKey: dashboardKeys.recentDocuments(),
    queryFn: () => fetchRecentDocuments(limit),
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

export function useActiveJobs() {
  return useQuery({
    queryKey: dashboardKeys.activeJobs(),
    queryFn: fetchActiveJobs,
    staleTime: 1000 * 15, // 15 seconds - more frequent for active jobs
    refetchInterval: 1000 * 30, // Auto-refresh every 30 seconds
  })
}

export function useQuickStats() {
  return useQuery({
    queryKey: dashboardKeys.quickStats(),
    queryFn: fetchQuickStats,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Auto-refresh every minute
  })
}

// Comprehensive dashboard hook
export function useDashboard() {
  const stats = useDashboardStats()
  const recentDocuments = useRecentDocuments()
  const activeJobs = useActiveJobs()
  const quickStats = useQuickStats()

  const isLoading = stats.isLoading || recentDocuments.isLoading || activeJobs.isLoading || quickStats.isLoading
  const isError = stats.isError || recentDocuments.isError || activeJobs.isError || quickStats.isError

  const refresh = () => {
    stats.refetch()
    recentDocuments.refetch()
    activeJobs.refetch()
    quickStats.refetch()
  }

  return {
    stats: stats.data,
    recentDocuments: recentDocuments.data,
    activeJobs: activeJobs.data,
    quickStats: quickStats.data,
    isLoading,
    isError,
    refresh,
    // Individual loading states
    statsLoading: stats.isLoading,
    documentsLoading: recentDocuments.isLoading,
    jobsLoading: activeJobs.isLoading,
    quickStatsLoading: quickStats.isLoading,
  }
}


// Activity feed hook
export function useActivityFeed(limit = 20) {
  return useQuery({
    queryKey: [...dashboardKeys.activity(), limit],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/activity?limit=${limit}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch activity feed: ${response.statusText}`)
      }
      
      return response.json()
    },
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 2, // Auto-refresh every 2 minutes
  })
}

// Job progress tracking hook
export function useJobProgress(jobId?: string) {
  return useQuery({
    queryKey: ['job-progress', jobId],
    queryFn: async () => {
      if (!jobId) return null
      
      const response = await fetch(`/api/jobs/${jobId}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch job progress: ${response.statusText}`)
      }
      
      return response.json()
    },
    enabled: !!jobId,
    staleTime: 1000 * 10, // 10 seconds
    refetchInterval: (data) => {
      // Refetch more frequently for active jobs
      if (data?.status === 'running' || data?.status === 'pending') {
        return 1000 * 5 // 5 seconds
      }
      return false // Don't refetch completed jobs
    },
  })
}

// Performance metrics hook
export function usePerformanceMetrics() {
  return useQuery({
    queryKey: ['dashboard', 'performance'],
    queryFn: async () => {
      const response = await fetch('/api/dashboard/performance')
      
      if (!response.ok) {
        throw new Error(`Failed to fetch performance metrics: ${response.statusText}`)
      }
      
      return response.json()
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchInterval: 1000 * 60 * 10, // Auto-refresh every 10 minutes
  })
}

// System health hook
export function useSystemHealth() {
  return useQuery({
    queryKey: ['dashboard', 'health'],
    queryFn: async () => {
      const response = await fetch('/api/health')
      
      if (!response.ok) {
        throw new Error(`Failed to fetch system health: ${response.statusText}`)
      }
      
      return response.json()
    },
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Auto-refresh every minute
    retry: (failureCount, error) => {
      // Don't retry if health endpoint is completely down
      return failureCount < 2
    },
  })
}

// Export types for use in components
export type { DashboardStats, RecentDocument }