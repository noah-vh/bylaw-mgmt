"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Play, 
  Pause, 
  XCircle, 
  Loader2,
  Zap,
  FileText,
  Database,
  Search
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type PipelineStatus = 
  | "idle" 
  | "queued" 
  | "scraping" 
  | "extracting" 
  | "analyzing" 
  | "completed" 
  | "error" 
  | "paused" 
  | "cancelled"

type PipelineStage = "scraping" | "extraction" | "analysis" | "complete"

interface StatusConfig {
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
  animate?: boolean
  pulse?: boolean
}

const statusConfigs: Record<PipelineStatus, StatusConfig> = {
  idle: {
    label: "Idle",
    description: "Pipeline is ready to start",
    icon: Clock,
    color: "text-muted-foreground",
    bgColor: "bg-muted"
  },
  queued: {
    label: "Queued",
    description: "Operation is queued and waiting to start",
    icon: Clock,
    color: "text-accent-info",
    bgColor: "bg-accent-info/10",
    pulse: true
  },
  scraping: {
    label: "Scraping",
    description: "Collecting documents from municipal websites",
    icon: Search,
    color: "text-accent-info",
    bgColor: "bg-accent-info/10",
    animate: true
  },
  extracting: {
    label: "Extracting",
    description: "Processing and extracting content from documents",
    icon: FileText,
    color: "text-accent-warning",
    bgColor: "bg-accent-warning/10",
    animate: true
  },
  analyzing: {
    label: "Analyzing",
    description: "Analyzing content and generating insights",
    icon: Zap,
    color: "text-accent-warning",
    bgColor: "bg-accent-warning/10",
    animate: true
  },
  completed: {
    label: "Completed",
    description: "Pipeline completed successfully",
    icon: CheckCircle,
    color: "text-accent-success",
    bgColor: "bg-accent-success/10"
  },
  error: {
    label: "Error",
    description: "Pipeline encountered an error",
    icon: AlertCircle,
    color: "text-accent-error",
    bgColor: "bg-accent-error/10"
  },
  paused: {
    label: "Paused",
    description: "Pipeline is temporarily paused",
    icon: Pause,
    color: "text-accent-warning",
    bgColor: "bg-accent-warning/10"
  },
  cancelled: {
    label: "Cancelled",
    description: "Pipeline was cancelled by user",
    icon: XCircle,
    color: "text-muted-foreground",
    bgColor: "bg-muted"
  }
}

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium transition-all duration-200",
  {
    variants: {
      size: {
        sm: "px-1.5 py-0.5 text-xs",
        md: "px-2 py-1 text-xs",
        lg: "px-3 py-1.5 text-sm"
      },
      variant: {
        default: "",
        subtle: "border border-current/20",
        outline: "border-2 border-current bg-transparent",
        solid: "text-white"
      }
    },
    defaultVariants: {
      size: "md",
      variant: "default"
    }
  }
)

const getStageIcon = (stage: PipelineStage) => {
  switch (stage) {
    case "scraping":
      return Search
    case "extraction":
      return FileText
    case "analysis":
      return Zap
    case "complete":
      return CheckCircle
    default:
      return Clock
  }
}

const getStageProgress = (stage: PipelineStage): number => {
  switch (stage) {
    case "scraping":
      return 25
    case "extraction":
      return 50
    case "analysis":
      return 75
    case "complete":
      return 100
    default:
      return 0
  }
}

interface PipelineStatusBadgeProps extends VariantProps<typeof badgeVariants> {
  status: PipelineStatus
  stage?: PipelineStage
  progress?: number
  showTooltip?: boolean
  showProgress?: boolean
  showStage?: boolean
  className?: string
  compact?: boolean
  onClick?: () => void
  customLabel?: string
  customDescription?: string
}

function PipelineStatusBadge({
  status,
  stage,
  progress,
  showTooltip = true,
  showProgress = false,
  showStage = false,
  size,
  variant,
  className,
  compact = false,
  onClick,
  customLabel,
  customDescription
}: PipelineStatusBadgeProps) {
  const config = statusConfigs[status]
  const Icon = config.icon
  const StageIcon = stage ? getStageIcon(stage) : null
  
  const displayLabel = customLabel || config.label
  const displayDescription = customDescription || config.description
  
  // Calculate effective progress
  const effectiveProgress = progress ?? (stage ? getStageProgress(stage) : undefined)
  
  const badgeContent = (
    <div
      className={cn(
        badgeVariants({ size, variant }),
        config.bgColor,
        config.color,
        config.animate && "animate-pulse",
        config.pulse && "animate-pulse",
        variant === "solid" && config.bgColor.replace('/10', '').replace('bg-', 'bg-'),
        onClick && "cursor-pointer hover:scale-105",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center space-x-1">
        <Icon className={cn(
          size === "sm" ? "w-2.5 h-2.5" : size === "lg" ? "w-4 h-4" : "w-3 h-3",
          config.animate && status === "scraping" && "animate-bounce",
          config.animate && (status === "extracting" || status === "analyzing") && "animate-spin"
        )} />
        
        {!compact && (
          <span>{displayLabel}</span>
        )}
        
        {showStage && stage && StageIcon && (
          <>
            <span className="text-current/60">•</span>
            <StageIcon className={cn(
              size === "sm" ? "w-2.5 h-2.5" : size === "lg" ? "w-4 h-4" : "w-3 h-3"
            )} />
            {!compact && (
              <span className="capitalize">{stage}</span>
            )}
          </>
        )}
        
        {showProgress && effectiveProgress !== undefined && (
          <>
            <span className="text-current/60">•</span>
            <span className="font-mono">{effectiveProgress}%</span>
          </>
        )}
      </div>
    </div>
  )
  
  if (!showTooltip) {
    return badgeContent
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badgeContent}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <div className="font-medium">{displayLabel}</div>
            <div className="text-xs text-muted-foreground">
              {displayDescription}
            </div>
            {stage && (
              <div className="text-xs text-muted-foreground">
                Current stage: <span className="capitalize font-medium">{stage}</span>
              </div>
            )}
            {effectiveProgress !== undefined && (
              <div className="text-xs text-muted-foreground">
                Progress: {effectiveProgress}%
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Specialized components for common use cases
interface StageBadgeProps {
  stage: PipelineStage
  active?: boolean
  completed?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
}

function StageBadge({ 
  stage, 
  active = false, 
  completed = false, 
  size = "md", 
  className 
}: StageBadgeProps) {
  const Icon = getStageIcon(stage)
  const progress = getStageProgress(stage)
  
  let status: PipelineStatus
  if (completed) {
    status = "completed"
  } else if (active) {
    switch (stage) {
      case "scraping":
        status = "scraping"
        break
      case "extraction":
        status = "extracting"
        break
      case "analysis":
        status = "analyzing"
        break
      default:
        status = "idle"
    }
  } else {
    status = "idle"
  }
  
  return (
    <PipelineStatusBadge
      status={status}
      stage={stage}
      size={size}
      className={className}
      customLabel={stage.charAt(0).toUpperCase() + stage.slice(1)}
      customDescription={`Pipeline ${stage} stage`}
    />
  )
}

interface ProgressBadgeProps {
  progress: number
  total?: number
  stage?: string
  size?: "sm" | "md" | "lg"
  className?: string
}

function ProgressBadge({ 
  progress, 
  total, 
  stage, 
  size = "md", 
  className 
}: ProgressBadgeProps) {
  const percentage = total ? Math.round((progress / total) * 100) : progress
  const isComplete = percentage >= 100
  const status: PipelineStatus = isComplete ? "completed" : "scraping"
  
  return (
    <PipelineStatusBadge
      status={status}
      size={size}
      className={className}
      showProgress
      progress={percentage}
      customLabel={total ? `${progress}/${total}` : `${percentage}%`}
      customDescription={`${stage ? `${stage}: ` : ""}${percentage}% complete`}
    />
  )
}

export { 
  PipelineStatusBadge, 
  StageBadge, 
  ProgressBadge, 
  statusConfigs, 
  badgeVariants,
  getStageIcon,
  getStageProgress
}
export type { 
  PipelineStatus, 
  PipelineStage, 
  StatusConfig, 
  PipelineStatusBadgeProps,
  StageBadgeProps,
  ProgressBadgeProps
}