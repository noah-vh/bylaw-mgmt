"use client"

import React, { useState } from "react"
import { 
  Play, 
  Pause, 
  Square, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  FileText,
  Download,
  Brain,
  X,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Eye,
  Activity
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { ProcessingStatusBadge, ProcessingControls } from "@/components/processing-status"
import type { ProcessingJob, ProcessingPhase, ProcessingStatus } from "@/components/processing-status"
import { format, formatDistanceToNow } from "date-fns"

interface OperationPhaseDetails {
  phase: ProcessingPhase
  status: ProcessingStatus
  progress: number
  total: number
  startedAt?: Date
  completedAt?: Date
  error?: string
  details?: {
    currentItem?: string
    itemsProcessed?: number
    itemsTotal?: number
    estimatedTimeRemaining?: number
    logs?: string[]
  }
}

interface OperationProgress {
  id: string
  municipalityId: number
  municipalityName: string
  operationType: 'full-pipeline' | 'scraping-only' | 'extraction-only' | 'analysis-only'
  status: ProcessingStatus
  startedAt: Date
  completedAt?: Date
  phases: OperationPhaseDetails[]
  canCancel: boolean
  canPause: boolean
  canResume: boolean
  totalDocuments?: number
  processedDocuments?: number
  errors: Array<{
    phase: ProcessingPhase
    error: string
    timestamp: Date
  }>
}

interface OperationProgressTrackerProps {
  operations: OperationProgress[]
  onCancel?: (operationId: string) => void
  onPause?: (operationId: string) => void
  onResume?: (operationId: string) => void
  onRetry?: (operationId: string) => void
  onViewLogs?: (operationId: string) => void
  className?: string
}

export function OperationProgressTracker({
  operations,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onViewLogs,
  className = ""
}: OperationProgressTrackerProps) {
  const [expandedOperations, setExpandedOperations] = useState<Set<string>>(new Set())

  const toggleExpanded = (operationId: string) => {
    const newExpanded = new Set(expandedOperations)
    if (newExpanded.has(operationId)) {
      newExpanded.delete(operationId)
    } else {
      newExpanded.add(operationId)
    }
    setExpandedOperations(newExpanded)
  }

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'full-pipeline':
        return <Activity className="h-4 w-4" />
      case 'scraping-only':
        return <Download className="h-4 w-4" />
      case 'extraction-only':
        return <FileText className="h-4 w-4" />
      case 'analysis-only':
        return <Brain className="h-4 w-4" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const getOperationTypeLabel = (type: string) => {
    switch (type) {
      case 'full-pipeline':
        return 'Full Pipeline'
      case 'scraping-only':
        return 'Scraping Only'
      case 'extraction-only':
        return 'Extraction Only'
      case 'analysis-only':
        return 'Analysis Only'
      default:
        return type
    }
  }

  const getOverallProgress = (operation: OperationProgress) => {
    if (operation.status === 'completed') return 100
    if (operation.status === 'failed') return 0
    
    const completedPhases = operation.phases.filter(p => p.status === 'completed').length
    const totalPhases = operation.phases.length
    const currentPhase = operation.phases.find(p => p.status === 'running')
    
    if (currentPhase) {
      const phaseProgress = currentPhase.total > 0 ? (currentPhase.progress / currentPhase.total) : 0
      return ((completedPhases + phaseProgress) / totalPhases) * 100
    }
    
    return (completedPhases / totalPhases) * 100
  }

  if (operations.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No active operations</p>
          <p className="text-sm text-muted-foreground mt-2">
            Start a processing operation to track its progress here
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {operations.map((operation) => {
        const isExpanded = expandedOperations.has(operation.id)
        const overallProgress = getOverallProgress(operation)
        const currentPhase = operation.phases.find(p => p.status === 'running')
        const hasErrors = operation.errors.length > 0

        return (
          <Card key={operation.id} className={hasErrors ? 'border-red-200' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Collapsible>
                    <CollapsibleTrigger
                      onClick={() => toggleExpanded(operation.id)}
                      className="flex items-center gap-2 hover:bg-muted p-1 rounded transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      {getOperationIcon(operation.operationType)}
                    </CollapsibleTrigger>
                  </Collapsible>
                  <div>
                    <CardTitle className="text-base">
                      {operation.municipalityName} - {getOperationTypeLabel(operation.operationType)}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <span>Started {formatDistanceToNow(operation.startedAt)} ago</span>
                      {currentPhase && (
                        <>
                          • <span className="capitalize">{currentPhase.phase}</span>
                        </>
                      )}
                    </CardDescription>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <ProcessingStatusBadge status={operation.status} size="sm" />
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onViewLogs && (
                        <DropdownMenuItem onClick={() => onViewLogs(operation.id)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Logs
                        </DropdownMenuItem>
                      )}
                      {operation.canPause && operation.status === 'running' && onPause && (
                        <DropdownMenuItem onClick={() => onPause(operation.id)}>
                          <Pause className="h-4 w-4 mr-2" />
                          Pause
                        </DropdownMenuItem>
                      )}
                      {operation.canResume && operation.status === 'paused' && onResume && (
                        <DropdownMenuItem onClick={() => onResume(operation.id)}>
                          <Play className="h-4 w-4 mr-2" />
                          Resume
                        </DropdownMenuItem>
                      )}
                      {operation.status === 'failed' && onRetry && (
                        <DropdownMenuItem onClick={() => onRetry(operation.id)}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Retry
                        </DropdownMenuItem>
                      )}
                      {operation.canCancel && operation.status !== 'completed' && onCancel && (
                        <DropdownMenuItem 
                          onClick={() => onCancel(operation.id)}
                          className="text-red-600"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              {/* Overall Progress */}
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span>Overall Progress</span>
                  <span className="font-medium">{Math.round(overallProgress)}%</span>
                </div>
                <Progress value={overallProgress} className="h-2" />
                {operation.totalDocuments && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {operation.processedDocuments || 0} / {operation.totalDocuments} documents
                    </span>
                    {currentPhase?.details?.estimatedTimeRemaining && (
                      <span>
                        ~{Math.round(currentPhase.details.estimatedTimeRemaining / 60)}m remaining
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Errors Summary */}
              {hasErrors && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2 text-red-800 text-sm font-medium mb-2">
                    <AlertCircle className="h-4 w-4" />
                    {operation.errors.length} Error{operation.errors.length > 1 ? 's' : ''} Encountered
                  </div>
                  {operation.errors.slice(-2).map((error, index) => (
                    <div key={index} className="text-xs text-red-700">
                      <span className="font-medium capitalize">{error.phase}:</span> {error.error}
                    </div>
                  ))}
                </div>
              )}

              {/* Current Phase Info */}
              {currentPhase && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-800 text-sm font-medium mb-2">
                    <Activity className="h-4 w-4" />
                    Currently {currentPhase.phase}
                  </div>
                  {currentPhase.details?.currentItem && (
                    <div className="text-xs text-blue-700 truncate">
                      Processing: {currentPhase.details.currentItem}
                    </div>
                  )}
                  {currentPhase.details?.itemsProcessed !== undefined && (
                    <div className="text-xs text-blue-700">
                      {currentPhase.details.itemsProcessed} / {currentPhase.details.itemsTotal || '?'} items
                    </div>
                  )}
                </div>
              )}

              {/* Detailed Phase Breakdown */}
              <Collapsible open={isExpanded}>
                <CollapsibleContent className="space-y-3">
                  <Separator className="my-4" />
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Phase Details</h4>
                    {operation.phases.map((phase, index) => (
                      <PhaseProgressCard
                        key={`${phase.phase}-${index}`}
                        phase={phase}
                      />
                    ))}
                  </div>
                  
                  {/* Operation Timeline */}
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium mb-3">Timeline</h4>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Started:</span>
                        <span>{format(operation.startedAt, 'MMM d, yyyy HH:mm:ss')}</span>
                      </div>
                      {operation.completedAt && (
                        <div className="flex justify-between">
                          <span>Completed:</span>
                          <span>{format(operation.completedAt, 'MMM d, yyyy HH:mm:ss')}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Duration:</span>
                        <span>
                          {formatDistanceToNow(operation.startedAt, { addSuffix: false })}
                        </span>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

interface PhaseProgressCardProps {
  phase: OperationPhaseDetails
}

function PhaseProgressCard({ phase }: PhaseProgressCardProps) {
  const getPhaseIcon = () => {
    switch (phase.phase) {
      case 'scraping':
        return <Download className="h-4 w-4" />
      case 'extraction':
        return <FileText className="h-4 w-4" />
      case 'analysis':
        return <Brain className="h-4 w-4" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const progress = phase.total > 0 ? (phase.progress / phase.total) * 100 : 0

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getPhaseIcon()}
          <span className="text-sm font-medium capitalize">{phase.phase}</span>
          <ProcessingStatusBadge status={phase.status} size="sm" />
        </div>
        {phase.status !== 'idle' && (
          <span className="text-xs text-muted-foreground">
            {Math.round(progress)}%
          </span>
        )}
      </div>

      {phase.status !== 'idle' && (
        <div className="space-y-2">
          <Progress value={progress} className="h-1" />
          
          {phase.details?.currentItem && (
            <div className="text-xs text-muted-foreground truncate">
              {phase.details.currentItem}
            </div>
          )}
          
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {phase.progress} / {phase.total}
            </span>
            {phase.details?.estimatedTimeRemaining && (
              <span>
                ~{Math.round(phase.details.estimatedTimeRemaining / 60)}m
              </span>
            )}
          </div>

          {phase.error && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
              {phase.error}
            </div>
          )}
        </div>
      )}

      {phase.startedAt && (
        <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Started:</span>
            <span>{format(phase.startedAt, 'HH:mm:ss')}</span>
          </div>
          {phase.completedAt && (
            <div className="flex justify-between">
              <span>Completed:</span>
              <span>{format(phase.completedAt, 'HH:mm:ss')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Mock data generator for testing
export function generateMockOperations(): OperationProgress[] {
  return [
    {
      id: '1',
      municipalityId: 1,
      municipalityName: 'Toronto',
      operationType: 'full-pipeline',
      status: 'running',
      startedAt: new Date(Date.now() - 900000), // 15 minutes ago
      canCancel: true,
      canPause: true,
      canResume: false,
      totalDocuments: 150,
      processedDocuments: 67,
      phases: [
        {
          phase: 'scraping',
          status: 'completed',
          progress: 150,
          total: 150,
          startedAt: new Date(Date.now() - 900000),
          completedAt: new Date(Date.now() - 600000),
        },
        {
          phase: 'extraction',
          status: 'running',
          progress: 67,
          total: 150,
          startedAt: new Date(Date.now() - 600000),
          details: {
            currentItem: 'Zoning Bylaw Amendment 234-2024.pdf',
            itemsProcessed: 67,
            itemsTotal: 150,
            estimatedTimeRemaining: 420
          }
        },
        {
          phase: 'analysis',
          status: 'pending',
          progress: 0,
          total: 150,
        }
      ],
      errors: []
    },
    {
      id: '2',
      municipalityId: 2,
      municipalityName: 'Ottawa',
      operationType: 'analysis-only',
      status: 'failed',
      startedAt: new Date(Date.now() - 1800000), // 30 minutes ago
      canCancel: false,
      canPause: false,
      canResume: false,
      totalDocuments: 25,
      processedDocuments: 8,
      phases: [
        {
          phase: 'analysis',
          status: 'failed',
          progress: 8,
          total: 25,
          startedAt: new Date(Date.now() - 1800000),
          error: 'Database connection timeout after processing 8 documents'
        }
      ],
      errors: [
        {
          phase: 'analysis',
          error: 'Database connection timeout',
          timestamp: new Date(Date.now() - 300000)
        }
      ]
    }
  ]
}