"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { CheckCircle, Circle, AlertCircle, Clock, Play, Pause } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type StageStatus = "pending" | "running" | "completed" | "error" | "paused"

interface Stage {
  id: string
  label: string
  status: StageStatus
  description?: string
  startTime?: Date
  endTime?: Date
  errorMessage?: string
}

const stageVariants = cva(
  "relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300",
  {
    variants: {
      status: {
        pending: "border-muted-foreground/30 bg-background text-muted-foreground",
        running: "border-accent-info bg-accent-info/10 text-accent-info animate-pulse",
        completed: "border-accent-success bg-accent-success/10 text-accent-success",
        error: "border-accent-error bg-accent-error/10 text-accent-error",
        paused: "border-accent-warning bg-accent-warning/10 text-accent-warning",
      },
    },
    defaultVariants: {
      status: "pending",
    },
  }
)

const connectorVariants = cva(
  "absolute top-1/2 -translate-y-1/2 h-0.5 bg-border transition-all duration-500",
  {
    variants: {
      active: {
        true: "bg-accent-success",
        false: "bg-border",
      },
    },
    defaultVariants: {
      active: false,
    },
  }
)

const getStageIcon = (status: StageStatus) => {
  switch (status) {
    case "pending":
      return Circle
    case "running":
      return Play
    case "completed":
      return CheckCircle
    case "error":
      return AlertCircle
    case "paused":
      return Pause
    default:
      return Circle
  }
}

const getStatusText = (status: StageStatus) => {
  switch (status) {
    case "pending":
      return "Pending"
    case "running":
      return "Running"
    case "completed":
      return "Completed"
    case "error":
      return "Error"
    case "paused":
      return "Paused"
    default:
      return "Unknown"
  }
}

const formatDuration = (start?: Date, end?: Date) => {
  if (!start) return null
  const endTime = end || new Date()
  const duration = endTime.getTime() - start.getTime()
  const seconds = Math.floor(duration / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

interface PipelineStageIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  stages: Stage[]
  onStageClick?: (stage: Stage) => void
  orientation?: "horizontal" | "vertical"
  size?: "sm" | "md" | "lg"
  showLabels?: boolean
  showTimings?: boolean
  interactive?: boolean
}

function PipelineStageIndicator({
  stages,
  onStageClick,
  orientation = "horizontal",
  size = "md",
  showLabels = true,
  showTimings = false,
  interactive = true,
  className,
  ...props
}: PipelineStageIndicatorProps) {
  const isVertical = orientation === "vertical"
  
  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  }
  
  const stageSize = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-10 h-10",
  }

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex items-center",
          isVertical ? "flex-col space-y-4" : "space-x-4",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {stages.map((stage, index) => {
          const Icon = getStageIcon(stage.status)
          const isLast = index === stages.length - 1
          const isCompleted = stage.status === "completed"
          const nextStageCompleted = !isLast && stages[index + 1].status === "completed"
          
          return (
            <div
              key={stage.id}
              className={cn(
                "relative flex items-center",
                isVertical ? "flex-col" : "flex-row"
              )}
            >
              {/* Stage indicator */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      stageVariants({ status: stage.status }),
                      stageSize[size],
                      "p-0 hover:scale-110",
                      interactive && onStageClick && "cursor-pointer",
                      !interactive && "cursor-default hover:scale-100"
                    )}
                    onClick={() => interactive && onStageClick?.(stage)}
                    disabled={!interactive}
                  >
                    <Icon className={cn(
                      size === "sm" ? "w-3 h-3" : size === "md" ? "w-4 h-4" : "w-5 h-5"
                    )} />
                    <span className="sr-only">{stage.label} - {getStatusText(stage.status)}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side={isVertical ? "right" : "top"} className="max-w-xs">
                  <div className="space-y-1">
                    <div className="font-medium">{stage.label}</div>
                    <div className="text-xs text-muted-foreground">
                      Status: {getStatusText(stage.status)}
                    </div>
                    {stage.description && (
                      <div className="text-xs">{stage.description}</div>
                    )}
                    {showTimings && stage.startTime && (
                      <div className="text-xs text-muted-foreground">
                        Duration: {formatDuration(stage.startTime, stage.endTime)}
                      </div>
                    )}
                    {stage.errorMessage && (
                      <div className="text-xs text-accent-error">
                        Error: {stage.errorMessage}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
              
              {/* Stage label */}
              {showLabels && (
                <div
                  className={cn(
                    "font-medium text-center",
                    isVertical ? "mt-2 min-w-0" : "ml-2 min-w-0",
                    stage.status === "error" && "text-accent-error",
                    stage.status === "completed" && "text-accent-success",
                    stage.status === "running" && "text-accent-info"
                  )}
                >
                  <div className="truncate">{stage.label}</div>
                  {showTimings && stage.startTime && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDuration(stage.startTime, stage.endTime)}
                    </div>
                  )}
                </div>
              )}
              
              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    connectorVariants({ active: isCompleted || nextStageCompleted }),
                    isVertical
                      ? "w-0.5 h-8 left-1/2 -translate-x-1/2 top-full"
                      : "h-0.5 w-8 left-full top-1/2"
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

export { PipelineStageIndicator, type Stage, type StageStatus }
export type { PipelineStageIndicatorProps }