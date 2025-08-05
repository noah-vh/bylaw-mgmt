"use client"

import * as React from "react"
import { cva } from "class-variance-authority"
import { 
  ChevronDown, 
  ChevronUp, 
  Download, 
  Pause, 
  Play, 
  Square, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Zap,
  Copy,
  ExternalLink
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast"

type LogLevel = "info" | "warning" | "error" | "success" | "debug"
type OperationStatus = "idle" | "running" | "paused" | "completed" | "error" | "cancelled"

interface LogEntry {
  id: string
  timestamp: Date
  level: LogLevel
  message: string
  details?: string
  source?: string
  metadata?: Record<string, any>
}

interface ProgressData {
  current: number
  total: number
  percentage: number
  rate?: number // items per second
  eta?: number // estimated time remaining in seconds
  stage?: string
  substage?: string
}

interface OperationState {
  status: OperationStatus
  startTime?: Date
  endTime?: Date
  progress: ProgressData
  logs: LogEntry[]
  canPause?: boolean
  canCancel?: boolean
  canResume?: boolean
}

const logLevelVariants = cva(
  "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
  {
    variants: {
      level: {
        info: "bg-accent-info/10 text-accent-info",
        warning: "bg-accent-warning/10 text-accent-warning",
        error: "bg-accent-error/10 text-accent-error",
        success: "bg-accent-success/10 text-accent-success",
        debug: "bg-muted text-muted-foreground",
      },
    },
  }
)

const statusVariants = cva(
  "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
  {
    variants: {
      status: {
        idle: "bg-muted text-muted-foreground",
        running: "bg-accent-info/10 text-accent-info animate-pulse",
        paused: "bg-accent-warning/10 text-accent-warning",
        completed: "bg-accent-success/10 text-accent-success",
        error: "bg-accent-error/10 text-accent-error",
        cancelled: "bg-muted text-muted-foreground",
      },
    },
  }
)

const getLogIcon = (level: LogLevel) => {
  switch (level) {
    case "info":
      return Clock
    case "warning":
      return AlertCircle
    case "error":
      return AlertCircle
    case "success":
      return CheckCircle
    case "debug":
      return Zap
    default:
      return Clock
  }
}

const getStatusIcon = (status: OperationStatus) => {
  switch (status) {
    case "idle":
      return Clock
    case "running":
      return Play
    case "paused":
      return Pause
    case "completed":
      return CheckCircle
    case "error":
      return AlertCircle
    case "cancelled":
      return Square
    default:
      return Clock
  }
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

const formatRate = (rate: number): string => {
  if (rate >= 1) {
    return `${rate.toFixed(1)}/s`
  }
  const perMinute = rate * 60
  if (perMinute >= 1) {
    return `${perMinute.toFixed(1)}/min`
  }
  const perHour = rate * 3600
  return `${perHour.toFixed(1)}/hr`
}

interface ProgressStreamDisplayProps {
  operationState: OperationState
  onPause?: () => void
  onResume?: () => void
  onCancel?: () => void
  onExportLogs?: () => void
  className?: string
  maxHeight?: string
  showControls?: boolean
  showTimings?: boolean
  autoScroll?: boolean
  compactMode?: boolean
}

function ProgressStreamDisplay({
  operationState,
  onPause,
  onResume,
  onCancel,
  onExportLogs,
  className,
  maxHeight = "400px",
  showControls = true,
  showTimings = true,
  autoScroll = true,
  compactMode = false
}: ProgressStreamDisplayProps) {
  const { toast } = useToast()
  const [showLogs, setShowLogs] = React.useState(true)
  const [filterLevel, setFilterLevel] = React.useState<LogLevel | "all">("all")
  const scrollAreaRef = React.useRef<HTMLDivElement>(null)
  const logEndRef = React.useRef<HTMLDivElement>(null)
  
  const { status, startTime, endTime, progress, logs } = operationState
  
  // Auto-scroll to bottom when new logs arrive
  React.useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs.length, autoScroll])
  
  // Calculate timing information
  const elapsed = startTime ? (endTime || new Date()).getTime() - startTime.getTime() : 0
  const elapsedSeconds = elapsed / 1000
  
  // Filter logs based on level
  const filteredLogs = React.useMemo(() => {
    if (filterLevel === "all") return logs
    return logs.filter(log => log.level === filterLevel)
  }, [logs, filterLevel])
  
  const handleCopyLogs = async () => {
    const logText = filteredLogs
      .map(log => `[${log.timestamp.toISOString()}] ${log.level.toUpperCase()}: ${log.message}`)
      .join('\n')
    
    try {
      await navigator.clipboard.writeText(logText)
      toast({
        title: "Logs copied",
        description: "Progress logs have been copied to clipboard"
      })
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Failed to copy logs to clipboard",
        variant: "destructive"
      })
    }
  }
  
  const StatusIcon = getStatusIcon(status)
  
  return (
    <TooltipProvider>
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader className={cn("pb-3", compactMode && "py-2")}>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2 text-base">
              <StatusIcon className={cn(
                "w-4 h-4",
                status === "running" && "animate-spin",
                status === "error" && "text-accent-error",
                status === "completed" && "text-accent-success",
                status === "paused" && "text-accent-warning"
              )} />
              <span>Operation Progress</span>
              <Badge className={statusVariants({ status })}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Badge>
            </CardTitle>
            
            {showControls && (
              <div className="flex items-center space-x-2">
                {status === "running" && operationState.canPause && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onPause}
                        className="h-8"
                      >
                        <Pause className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Pause operation</TooltipContent>
                  </Tooltip>
                )}
                
                {status === "paused" && operationState.canResume && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onResume}
                        className="h-8"
                      >
                        <Play className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Resume operation</TooltipContent>
                  </Tooltip>
                )}
                
                {(status === "running" || status === "paused") && operationState.canCancel && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={onCancel}
                        className="h-8"
                      >
                        <Square className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Cancel operation</TooltipContent>
                  </Tooltip>
                )}
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyLogs}
                      className="h-8"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy logs</TooltipContent>
                </Tooltip>
                
                {onExportLogs && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onExportLogs}
                        className="h-8"
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Export logs</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
          
          {/* Progress information */}
          <div className="space-y-3">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  {progress.stage && (
                    <span className="font-medium">{progress.stage}</span>
                  )}
                  {progress.substage && (
                    <span className="text-muted-foreground">• {progress.substage}</span>
                  )}
                </div>
                <div className="text-right">
                  <div>{progress.current.toLocaleString()} / {progress.total.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    {progress.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>
              
              <Progress 
                value={progress.percentage} 
                className="h-2"
              />
            </div>
            
            {/* Timing and rate information */}
            {showTimings && (startTime || progress.rate || progress.eta) && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center space-x-4">
                  {startTime && (
                    <div>Elapsed: {formatDuration(elapsedSeconds)}</div>
                  )}
                  {progress.rate && (
                    <div>Rate: {formatRate(progress.rate)}</div>
                  )}
                </div>
                {progress.eta && (
                  <div>ETA: {formatDuration(progress.eta)}</div>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className={cn("pt-0", compactMode && "px-3 pb-3")}>
          {/* Log controls */}
          <Collapsible open={showLogs} onOpenChange={setShowLogs}>
            <div className="flex items-center justify-between mb-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 p-0 font-medium">
                  <div className="flex items-center space-x-2">
                    {showLogs ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    <span>Logs ({filteredLogs.length})</span>
                  </div>
                </Button>
              </CollapsibleTrigger>
              
              {showLogs && (
                <div className="flex items-center space-x-2">
                  <select
                    value={filterLevel}
                    onChange={(e) => setFilterLevel(e.target.value as LogLevel | "all")}
                    className="text-xs border rounded px-2 py-1 bg-background"
                  >
                    <option value="all">All logs</option>
                    <option value="info">Info</option>
                    <option value="warning">Warnings</option>
                    <option value="error">Errors</option>
                    <option value="success">Success</option>
                    <option value="debug">Debug</option>
                  </select>
                </div>
              )}
            </div>
            
            <CollapsibleContent>
              <ScrollArea 
                ref={scrollAreaRef}
                className="border rounded-md p-3 bg-muted/30"
                style={{ maxHeight }}
              >
                <div className="space-y-2">
                  {filteredLogs.length === 0 ? (
                    <div className="text-center text-muted-foreground py-4">
                      No logs to display
                    </div>
                  ) : (
                    filteredLogs.map((log, index) => {
                      const Icon = getLogIcon(log.level)
                      
                      return (
                        <div key={log.id} className="space-y-1">
                          <div className="flex items-start space-x-2 text-sm">
                            <div className="flex items-center space-x-2 shrink-0">
                              <span className="text-xs text-muted-foreground font-mono">
                                {log.timestamp.toLocaleTimeString()}
                              </span>
                              <Badge className={logLevelVariants({ level: log.level })}>
                                <Icon className="w-3 h-3 mr-1" />
                                {log.level.toUpperCase()}
                              </Badge>
                              {log.source && (
                                <Badge variant="outline" className="text-xs">
                                  {log.source}
                                </Badge>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="break-words">{log.message}</div>
                              {log.details && (
                                <div className="text-xs text-muted-foreground mt-1 pl-4 border-l-2 border-muted">
                                  {log.details}
                                </div>
                              )}
                              {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  <details className="cursor-pointer">
                                    <summary>Metadata</summary>
                                    <pre className="mt-1 p-2 bg-background rounded text-xs overflow-x-auto">
                                      {JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                  </details>
                                </div>
                              )}
                            </div>
                          </div>
                          {index < filteredLogs.length - 1 && (
                            <Separator className="opacity-30" />
                          )}
                        </div>
                      )
                    })
                  )}
                  <div ref={logEndRef} />
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}

export { ProgressStreamDisplay, logLevelVariants, statusVariants }
export type { 
  LogEntry, 
  LogLevel, 
  ProgressData, 
  OperationState, 
  OperationStatus, 
  ProgressStreamDisplayProps 
}