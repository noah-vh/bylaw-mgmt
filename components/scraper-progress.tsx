"use client"

import { useState, useEffect, useCallback } from "react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useScrapingJobStatus } from "@/hooks/use-scrapers"
import type { JobId, DetailedJobStatus } from "@/types/database"
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Square,
  AlertCircle,
  FileText,
  Database,
  BarChart3
} from "lucide-react"

interface ScraperProgressProps {
  jobId: JobId
  compact?: boolean
  onCancel?: () => void
  onComplete?: (result: any) => void
}

interface ProgressFile {
  status: string
  progress: number
  message: string
  stage?: string
  documentsFound?: number
  documentsProcessed?: number
  estimatedTotal?: number
  startTime?: string
  error?: string
  result?: any
  updatedAt: string
}

// Fallback to file-based progress polling when the job status hook fails
async function fetchProgressFromFile(jobId: JobId): Promise<ProgressFile | null> {
  try {
    const response = await fetch(`/api/progress/${jobId}`)
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

export function ScraperProgress({ 
  jobId, 
  compact = false, 
  onCancel, 
  onComplete 
}: ScraperProgressProps) {
  const [fileProgress, setFileProgress] = useState<ProgressFile | null>(null)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null)
  
  // Primary job status from API
  const { 
    data: jobStatus, 
    isLoading: isLoadingJob,
    error: jobError 
  } = useScrapingJobStatus(jobId, {
    enabled: !!jobId,
    pollingInterval: 3000 // 3 seconds
  })

  // Fallback file-based polling
  const pollFileProgress = useCallback(async () => {
    if (!jobId) return
    
    try {
      const progress = await fetchProgressFromFile(jobId)
      setFileProgress(progress)
      
      // Calculate ETA based on progress and elapsed time
      if (progress && progress.startTime && progress.progress > 0) {
        const startTime = new Date(progress.startTime).getTime()
        const now = Date.now()
        const elapsed = now - startTime
        const progressRatio = progress.progress / 100
        
        if (progressRatio > 0.1) { // Only estimate after 10% progress
          const totalEstimated = elapsed / progressRatio
          const remaining = totalEstimated - elapsed
          setEstimatedTimeRemaining(Math.max(0, remaining))
        }
      }
    } catch (error) {
      console.error('Failed to fetch file progress:', error)
    }
  }, [jobId])

  // Set up polling
  useEffect(() => {
    if (!jobId) return

    // If the API job status is not available, use file polling
    if (jobError || (!jobStatus && !isLoadingJob)) {
      const interval = setInterval(pollFileProgress, 3000)
      pollFileProgress() // Initial fetch
      
      return () => clearInterval(interval)
    }
  }, [jobId, jobStatus, isLoadingJob, jobError, pollFileProgress])

  // Handle completion
  useEffect(() => {
    const status = jobStatus || fileProgress
    if (status && ['completed', 'failed', 'cancelled'].includes(status.status)) {
      if (status.status === 'completed' && onComplete) {
        onComplete(status.result || status)
      }
    }
  }, [jobStatus, fileProgress, onComplete])

  // Use API data if available, otherwise fall back to file data
  const currentStatus = jobStatus || fileProgress
  
  if (!jobId || (!currentStatus && !isLoadingJob)) {
    return null
  }

  if (isLoadingJob && !fileProgress) {
    if (compact) {
      return (
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary" />
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      )
    }
    
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Loading job status...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!currentStatus) {
    return compact ? (
      <div className="text-xs text-muted-foreground">No progress data</div>
    ) : (
      <Card>
        <CardContent className="p-4">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="h-6 w-6 mx-auto mb-2" />
            <p className="text-sm">No progress data available</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const progress = currentStatus.progress || 0
  const message = currentStatus.progress_message || currentStatus.message || 'Processing...'
  const status = currentStatus.status
  
  // Stage detection from message or status
  const getStageInfo = () => {
    const msg = message.toLowerCase()
    if (msg.includes('scraping') || msg.includes('scrape')) {
      return { label: 'Scraping', icon: <FileText className="h-3 w-3" /> }
    } else if (msg.includes('extracting') || msg.includes('extract')) {
      return { label: 'Extracting', icon: <Database className="h-3 w-3" /> }
    } else if (msg.includes('analyzing') || msg.includes('analyze')) {
      return { label: 'Analyzing', icon: <BarChart3 className="h-3 w-3" /> }
    } else {
      return { label: 'Processing', icon: <Activity className="h-3 w-3" /> }
    }
  }

  const stageInfo = getStageInfo()

  const getStatusBadge = () => {
    switch (status) {
      case 'running':
        return (
          <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50">
            <Activity className="h-3 w-3 mr-1" />
            Running
          </Badge>
        )
      case 'completed':
        return (
          <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        )
      case 'cancelled':
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <Square className="h-3 w-3 mr-1" />
            Cancelled
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
            <Clock className="h-3 w-3 mr-1" />
            Queued
          </Badge>
        )
    }
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            {stageInfo.icon}
            <span>{stageInfo.label}</span>
          </div>
          <span className="text-xs font-mono">{progress}%</span>
        </div>
        <Progress value={progress} className="h-1" />
        {status === 'running' && estimatedTimeRemaining && (
          <div className="text-xs text-muted-foreground">
            ~{formatTime(estimatedTimeRemaining)} remaining
          </div>
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {stageInfo.icon}
              <span className="font-medium">{stageInfo.label}</span>
              {getStatusBadge()}
            </div>
            <div className="flex items-center gap-2">
              {status === 'running' && onCancel && (
                <Button size="sm" variant="outline" onClick={onCancel}>
                  <Square className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{message}</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {currentStatus.documentsFound !== undefined && (
              <div>
                <span className="text-muted-foreground">Documents Found:</span>
                <span className="ml-2 font-mono">{currentStatus.documentsFound}</span>
              </div>
            )}
            
            {currentStatus.documentsProcessed !== undefined && (
              <div>
                <span className="text-muted-foreground">Processed:</span>
                <span className="ml-2 font-mono">{currentStatus.documentsProcessed}</span>
              </div>
            )}
            
            {status === 'running' && estimatedTimeRemaining && (
              <div>
                <span className="text-muted-foreground">ETA:</span>
                <span className="ml-2 font-mono">{formatTime(estimatedTimeRemaining)}</span>
              </div>
            )}

            {currentStatus.startTime && (
              <div>
                <span className="text-muted-foreground">Started:</span>
                <span className="ml-2 font-mono">
                  {new Date(currentStatus.startTime).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>

          {/* Error Message */}
          {status === 'failed' && currentStatus.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">{currentStatus.error}</p>
            </div>
          )}

          {/* Success Details */}
          {status === 'completed' && currentStatus.result && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md">
              <div className="text-sm text-emerald-700">
                <p className="font-medium mb-1">Job completed successfully!</p>
                {typeof currentStatus.result === 'object' && (
                  <div className="space-y-1">
                    {currentStatus.result.documentsFound && (
                      <p>• {currentStatus.result.documentsFound} documents found</p>
                    )}
                    {currentStatus.result.documentsNew && (
                      <p>• {currentStatus.result.documentsNew} new documents</p>
                    )}
                    {currentStatus.result.errors && currentStatus.result.errors.length > 0 && (
                      <p>• {currentStatus.result.errors.length} errors encountered</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}