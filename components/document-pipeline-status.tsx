"use client"

import React from "react"
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Search, 
  FileText, 
  Brain, 
  Download,
  RefreshCw,
  Play,
  Square,
  MoreHorizontal
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Progress } from "@/components/ui/progress"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { format } from "date-fns"
import type { 
  PdfDocument, 
  DownloadStatus, 
  ExtractionStatus, 
  AnalysisStatus,
  DocumentId 
} from "@/types/database"

interface DocumentPipelineStatusProps {
  document: PdfDocument & { municipality_name?: string }
  size?: 'sm' | 'md' | 'lg'
  showActions?: boolean
  showTimestamps?: boolean
  onReprocess?: (documentId: DocumentId, stage: 'download' | 'extract' | 'analyze') => void
  className?: string
}

interface PipelineStage {
  id: 'scraping' | 'extraction' | 'analysis'
  label: string
  icon: React.ComponentType<{ className?: string }>
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  timestamp?: string | null
  error?: string | null
  canReprocess?: boolean
}

export function DocumentPipelineStatus({ 
  document, 
  size = 'md', 
  showActions = false,
  showTimestamps = false,
  onReprocess,
  className = ""
}: DocumentPipelineStatusProps) {
  // Determine pipeline stages based on document status
  const stages: PipelineStage[] = React.useMemo(() => {
    const stages: PipelineStage[] = [
      {
        id: 'scraping',
        label: 'Scraped',
        icon: Search,
        status: document.download_status === 'completed' ? 'completed' : 
                document.download_status === 'failed' ? 'failed' :
                document.download_status === 'downloading' ? 'processing' : 'pending',
        timestamp: document.date_found,
        canReprocess: document.download_status === 'failed'
      },
      {
        id: 'extraction',
        label: 'Extracted',
        icon: FileText,
        status: !document.extraction_status ? 'pending' :
                document.extraction_status === 'completed' ? 'completed' :
                document.extraction_status === 'failed' ? 'failed' :
                document.extraction_status === 'processing' ? 'processing' : 'pending',
        timestamp: document.content_text ? document.date_found : null,
        canReprocess: document.extraction_status === 'failed' || document.download_status === 'completed'
      },
      {
        id: 'analysis',
        label: 'Analyzed',
        icon: Brain,
        status: !document.analysis_status ? 'pending' :
                document.analysis_status === 'completed' ? 'completed' :
                document.analysis_status === 'failed' ? 'failed' :
                document.analysis_status === 'processing' ? 'processing' : 'pending',
        timestamp: document.analysis_date,
        error: document.analysis_error,
        canReprocess: document.analysis_status === 'failed' || 
                     (document.extraction_status === 'completed' && document.content_text)
      }
    ]

    // Skip stages if prerequisites aren't met
    if (document.download_status !== 'completed') {
      stages[1].status = 'skipped'
      stages[2].status = 'skipped'
    } else if (document.extraction_status !== 'completed' || !document.content_text) {
      stages[2].status = 'skipped'
    }

    return stages
  }, [document])

  const getStatusColor = (status: PipelineStage['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'processing':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'failed':
        return 'text-red-600 bg-red-50 border-red-200'
      case 'skipped':
        return 'text-gray-400 bg-gray-50 border-gray-200'
      default:
        return 'text-gray-500 bg-gray-50 border-gray-200'
    }
  }

  const getStatusIcon = (stage: PipelineStage) => {
    const IconComponent = stage.icon
    switch (stage.status) {
      case 'completed':
        return <CheckCircle2 className="h-3 w-3 text-green-600" />
      case 'processing':
        return <RefreshCw className="h-3 w-3 text-blue-600 animate-spin" />
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-600" />
      case 'skipped':
        return <IconComponent className="h-3 w-3 text-gray-400" />
      default:
        return <Clock className="h-3 w-3 text-gray-500" />
    }
  }

  const calculateProgress = () => {
    const completedStages = stages.filter(s => s.status === 'completed').length
    const totalStages = stages.filter(s => s.status !== 'skipped').length
    return totalStages > 0 ? (completedStages / totalStages) * 100 : 0
  }

  const getOverallStatus = () => {
    const hasProcessing = stages.some(s => s.status === 'processing')
    const hasFailed = stages.some(s => s.status === 'failed')
    const allCompleted = stages.filter(s => s.status !== 'skipped').every(s => s.status === 'completed')
    
    if (hasProcessing) return { label: 'Processing', color: 'bg-blue-100 text-blue-800' }
    if (hasFailed) return { label: 'Failed', color: 'bg-red-100 text-red-800' }
    if (allCompleted) return { label: 'Complete', color: 'bg-green-100 text-green-800' }
    return { label: 'Pending', color: 'bg-gray-100 text-gray-800' }
  }

  const handleReprocess = (stage: PipelineStage) => {
    if (!onReprocess) return
    
    const stageMap = {
      'scraping': 'download' as const,
      'extraction': 'extract' as const,
      'analysis': 'analyze' as const
    }
    
    onReprocess(document.id, stageMap[stage.id])
  }

  const overallStatus = getOverallStatus()
  const progress = calculateProgress()

  if (size === 'sm') {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <Badge className={`text-xs ${overallStatus.color}`}>
          {overallStatus.label}
        </Badge>
        <div className="flex items-center gap-1">
          {stages.map((stage) => (
            <TooltipProvider key={stage.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    {getStatusIcon(stage)}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">
                    <div className="font-medium">{stage.label}</div>
                    <div className="text-muted-foreground capitalize">{stage.status}</div>
                    {stage.timestamp && (
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(stage.timestamp), 'MMM d, yyyy')}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={`border rounded-lg p-4 bg-white ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">Processing Pipeline</h3>
          <Badge className={`text-xs ${overallStatus.color}`}>
            {overallStatus.label}
          </Badge>
        </div>
        {showActions && onReprocess && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {stages.filter(s => s.canReprocess).map((stage) => (
                <DropdownMenuItem
                  key={stage.id}
                  onClick={() => handleReprocess(stage)}
                  className="cursor-pointer"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Re-run {stage.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <Progress value={progress} className="h-2" />
        <div className="text-xs text-muted-foreground mt-1">
          {Math.round(progress)}% complete
        </div>
      </div>

      {/* Pipeline Stages */}
      <div className="space-y-3">
        {stages.map((stage, index) => {
          const IconComponent = stage.icon
          const isLast = index === stages.length - 1

          return (
            <div key={stage.id} className="relative">
              <div className="flex items-center gap-3">
                {/* Stage Icon */}
                <div className={`
                  flex items-center justify-center w-8 h-8 rounded-full border-2 
                  ${getStatusColor(stage.status)}
                  ${stage.status === 'processing' ? 'animate-pulse' : ''}
                `}>
                  {stage.status === 'processing' ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : stage.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : stage.status === 'failed' ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <IconComponent className="h-4 w-4" />
                  )}
                </div>

                {/* Stage Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{stage.label}</span>
                    <Badge 
                      variant="outline" 
                      className={`text-xs capitalize ${
                        stage.status === 'completed' ? 'border-green-200 text-green-700' :
                        stage.status === 'processing' ? 'border-blue-200 text-blue-700' :
                        stage.status === 'failed' ? 'border-red-200 text-red-700' :
                        'border-gray-200 text-gray-600'
                      }`}
                    >
                      {stage.status}
                    </Badge>
                  </div>
                  
                  {showTimestamps && stage.timestamp && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(new Date(stage.timestamp), 'MMM d, yyyy h:mm a')}
                    </div>
                  )}

                  {stage.error && (
                    <div className="text-xs text-red-600 mt-1 truncate">
                      Error: {stage.error}
                    </div>
                  )}
                </div>

                {/* Re-process Action */}
                {showActions && onReprocess && stage.canReprocess && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReprocess(stage)}
                    className="shrink-0"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                )}
              </div>

              {/* Connecting Line */}
              {!isLast && (
                <div className="absolute left-4 top-8 w-0.5 h-6 bg-gray-200" />
              )}
            </div>
          )
        })}
      </div>

      {/* Pipeline Metadata */}
      {size === 'lg' && (
        <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">
          <div className="grid grid-cols-2 gap-2">
            <div>Municipality: {document.municipality_name || 'Unknown'}</div>
            <div>Found: {format(new Date(document.date_found), 'MMM d, yyyy')}</div>
            {document.relevance_confidence && (
              <>
                <div>Relevance: {Math.round(document.relevance_confidence * 100)}%</div>
                <div>ADU Relevant: {document.is_adu_relevant ? 'Yes' : 'No'}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default DocumentPipelineStatus