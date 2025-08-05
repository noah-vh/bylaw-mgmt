"use client"

import React from "react"
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  Download, 
  FileText, 
  Brain,
  XCircle,
  Loader2,
  Play,
  Pause,
  Square
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

// Types for processing status
export type ProcessingPhase = 'scraping' | 'extraction' | 'analysis'
export type ProcessingStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'paused'

export interface ProcessingJob {
  id: string
  municipalityId?: number
  municipalityName?: string
  phase: ProcessingPhase
  status: ProcessingStatus
  progress?: number
  total?: number
  startedAt?: Date
  completedAt?: Date
  error?: string
  details?: {
    documentsProcessed?: number
    documentsTotal?: number
    currentDocument?: string
    estimatedTimeRemaining?: number
  }
}

// Processing Status Badge Component
interface ProcessingStatusBadgeProps {
  status: ProcessingStatus
  phase?: ProcessingPhase
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

export function ProcessingStatusBadge({ 
  status, 
  phase, 
  size = 'md', 
  showIcon = true 
}: ProcessingStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'idle':
        return {
          variant: 'outline' as const,
          label: 'Idle',
          icon: Clock,
          className: 'border-gray-300 text-gray-600'
        }
      case 'pending':
        return {
          variant: 'outline' as const,
          label: 'Pending',
          icon: Clock,
          className: 'border-yellow-300 text-yellow-700 bg-yellow-50'
        }
      case 'running':
        return {
          variant: 'default' as const,
          label: phase ? `${phase.charAt(0).toUpperCase() + phase.slice(1)}...` : 'Running',
          icon: RefreshCw,
          className: 'bg-blue-600 text-white animate-pulse'
        }
      case 'completed':
        return {
          variant: 'secondary' as const,
          label: 'Completed',
          icon: CheckCircle,
          className: 'bg-green-100 text-green-800 border-green-300'
        }
      case 'failed':
        return {
          variant: 'destructive' as const,
          label: 'Failed',
          icon: AlertCircle,
          className: 'bg-red-100 text-red-800 border-red-300'
        }
      case 'paused':
        return {
          variant: 'outline' as const,
          label: 'Paused',
          icon: Pause,
          className: 'border-orange-300 text-orange-700 bg-orange-50'
        }
      default:
        return {
          variant: 'outline' as const,
          label: status,
          icon: Clock,
          className: ''
        }
    }
  }

  const config = getStatusConfig()
  const IconComponent = config.icon
  const isAnimated = status === 'running'

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  }

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }

  return (
    <Badge 
      variant={config.variant} 
      className={`${config.className} ${sizeClasses[size]} inline-flex items-center gap-1.5`}
    >
      {showIcon && (
        <IconComponent 
          className={`${iconSizes[size]} ${isAnimated ? 'animate-spin' : ''}`} 
        />
      )}
      <span>{config.label}</span>
    </Badge>
  )
}

// Progress Indicator Component
interface ProcessingProgressProps {
  job: ProcessingJob
  showDetails?: boolean
  className?: string
}

export function ProcessingProgress({ 
  job, 
  showDetails = true, 
  className = "" 
}: ProcessingProgressProps) {
  const getProgressValue = () => {
    if (job.status === 'completed') return 100
    if (job.status === 'failed') return 0
    if (job.progress !== undefined && job.total !== undefined) {
      return Math.round((job.progress / job.total) * 100)
    }
    if (job.details?.documentsProcessed !== undefined && job.details?.documentsTotal !== undefined) {
      return Math.round((job.details.documentsProcessed / job.details.documentsTotal) * 100)
    }
    if (job.status === 'running') return 50 // Indeterminate progress
    return 0
  }

  const progress = getProgressValue()
  const isIndeterminate = job.status === 'running' && progress === 50

  const formatTimeRemaining = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${Math.round(seconds / 3600)}h`
  }

  const getPhaseIcon = () => {
    switch (job.phase) {
      case 'scraping':
        return Download
      case 'extraction':
        return FileText
      case 'analysis':
        return Brain
      default:
        return RefreshCw
    }
  }

  const PhaseIcon = getPhaseIcon()

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PhaseIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {job.phase.charAt(0).toUpperCase() + job.phase.slice(1)}
          </span>
          <ProcessingStatusBadge status={job.status} size="sm" />
        </div>
        {showDetails && job.details?.estimatedTimeRemaining && (
          <span className="text-xs text-muted-foreground">
            ~{formatTimeRemaining(job.details.estimatedTimeRemaining)} remaining
          </span>
        )}
      </div>
      
      {job.status !== 'idle' && (
        <div className="space-y-1">
          <Progress 
            value={progress} 
            className={`h-2 ${isIndeterminate ? 'animate-pulse' : ''}`}
          />
          {showDetails && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {job.details?.documentsProcessed || job.progress || 0} / {job.details?.documentsTotal || job.total || '?'}
              </span>
              <span>{progress}%</span>
            </div>
          )}
        </div>
      )}
      
      {job.error && (
        <div className="text-xs text-destructive bg-destructive/5 p-2 rounded">
          {job.error}
        </div>
      )}
      
      {showDetails && job.details?.currentDocument && (
        <div className="text-xs text-muted-foreground truncate">
          Processing: {job.details.currentDocument}
        </div>
      )}
    </div>
  )
}

// Job Control Buttons Component
interface ProcessingControlsProps {
  job: ProcessingJob
  onStart?: () => void
  onPause?: () => void
  onStop?: () => void
  onRetry?: () => void
  disabled?: boolean
}

export function ProcessingControls({
  job,
  onStart,
  onPause,
  onStop,
  onRetry,
  disabled = false
}: ProcessingControlsProps) {
  const canStart = job.status === 'idle' || job.status === 'failed'
  const canPause = job.status === 'running'
  const canStop = job.status === 'running' || job.status === 'paused'
  const canRetry = job.status === 'failed'

  return (
    <div className="flex items-center gap-1">
      <TooltipProvider>
        {canStart && onStart && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onStart}
                disabled={disabled}
              >
                <Play className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Start processing</TooltipContent>
          </Tooltip>
        )}
        
        {canPause && onPause && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onPause}
                disabled={disabled}
              >
                <Pause className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pause processing</TooltipContent>
          </Tooltip>
        )}
        
        {canStop && onStop && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onStop}
                disabled={disabled}
              >
                <Square className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop processing</TooltipContent>
          </Tooltip>
        )}
        
        {canRetry && onRetry && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                disabled={disabled}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Retry processing</TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  )
}

// Processing Job Card Component
interface ProcessingJobCardProps {
  job: ProcessingJob
  onStart?: () => void
  onPause?: () => void
  onStop?: () => void
  onRetry?: () => void
  showMunicipality?: boolean
  className?: string
}

export function ProcessingJobCard({
  job,
  onStart,
  onPause,
  onStop,
  onRetry,
  showMunicipality = true,
  className = ""
}: ProcessingJobCardProps) {
  const formatDuration = (start?: Date, end?: Date) => {
    if (!start) return null
    const endTime = end || new Date()
    const durationMs = endTime.getTime() - start.getTime()
    const durationSec = Math.round(durationMs / 1000)
    
    if (durationSec < 60) return `${durationSec}s`
    if (durationSec < 3600) return `${Math.round(durationSec / 60)}m`
    return `${Math.round(durationSec / 3600)}h`
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">
              {job.phase.charAt(0).toUpperCase() + job.phase.slice(1)} Job
            </CardTitle>
            {showMunicipality && job.municipalityName && (
              <CardDescription>{job.municipalityName}</CardDescription>
            )}
          </div>
          <ProcessingControls
            job={job}
            onStart={onStart}
            onPause={onPause}
            onStop={onStop}
            onRetry={onRetry}
          />
        </div>
      </CardHeader>
      <CardContent>
        <ProcessingProgress job={job} />
        
        {(job.startedAt || job.completedAt) && (
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            <div className="flex justify-between">
              {job.startedAt && (
                <span>Started: {job.startedAt.toLocaleTimeString()}</span>
              )}
              {job.completedAt && (
                <span>Completed: {job.completedAt.toLocaleTimeString()}</span>
              )}
              {job.startedAt && !job.completedAt && job.status === 'running' && (
                <span>Duration: {formatDuration(job.startedAt)}</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Municipality Processing Overview Component
interface MunicipalityProcessingOverviewProps {
  municipalityId: number
  municipalityName: string
  jobs: ProcessingJob[]
  onStartScraping?: () => void
  onStartExtraction?: () => void
  onStartAnalysis?: () => void
  onStartFullPipeline?: () => void
  className?: string
}

export function MunicipalityProcessingOverview({
  municipalityId,
  municipalityName,
  jobs,
  onStartScraping,
  onStartExtraction,
  onStartAnalysis,
  onStartFullPipeline,
  className = ""
}: MunicipalityProcessingOverviewProps) {
  const getJobByPhase = (phase: ProcessingPhase) => 
    jobs.find(job => job.phase === phase && job.municipalityId === municipalityId)

  const scrapingJob = getJobByPhase('scraping')
  const extractionJob = getJobByPhase('extraction')
  const analysisJob = getJobByPhase('analysis')

  const hasRunningJobs = jobs.some(job => job.status === 'running')

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{municipalityName}</CardTitle>
            <CardDescription>Processing pipeline status</CardDescription>
          </div>
          {onStartFullPipeline && (
            <Button 
              onClick={onStartFullPipeline}
              disabled={hasRunningJobs}
              size="sm"
            >
              <Play className="h-4 w-4 mr-2" />
              Run Pipeline
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Scraping Phase */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {scrapingJob ? (
                <ProcessingProgress job={scrapingJob} showDetails={false} />
              ) : (
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Scraping</span>
                  <ProcessingStatusBadge status="idle" size="sm" showIcon={false} />
                </div>
              )}
            </div>
            {onStartScraping && !scrapingJob?.status.match(/running|pending/) && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={onStartScraping}
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Extraction Phase */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {extractionJob ? (
                <ProcessingProgress job={extractionJob} showDetails={false} />
              ) : (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Extraction</span>
                  <ProcessingStatusBadge status="idle" size="sm" showIcon={false} />
                </div>
              )}
            </div>
            {onStartExtraction && !extractionJob?.status.match(/running|pending/) && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={onStartExtraction}
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Analysis Phase */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {analysisJob ? (
                <ProcessingProgress job={analysisJob} showDetails={false} />
              ) : (
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Analysis</span>
                  <ProcessingStatusBadge status="idle" size="sm" showIcon={false} />
                </div>
              )}
            </div>
            {onStartAnalysis && !analysisJob?.status.match(/running|pending/) && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={onStartAnalysis}
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}