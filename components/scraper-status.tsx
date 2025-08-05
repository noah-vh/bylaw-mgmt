"use client"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { ScraperStatus as ScraperStatusType, MunicipalityStatus } from "@/types/database"
import { 
  CheckCircle2, 
  Activity, 
  AlertCircle, 
  WifiOff, 
  Clock,
  Server,
  Zap,
  RefreshCw
} from "lucide-react"

interface ScraperStatusProps {
  status: ScraperStatusType
  name?: string
  compact?: boolean
  showIcon?: boolean
  lastRun?: string | null
  tooltip?: boolean
}

interface ProcessingStatusProps {
  status: MunicipalityStatus
  compact?: boolean
  showIcon?: boolean
  tooltip?: boolean
}

interface VersionBadgeProps {
  version: 'v1' | 'v2' | 'enhanced'
  compact?: boolean
}

interface SuccessRateBadgeProps {
  rate: number
  compact?: boolean
}

export function ScraperStatus({ 
  status, 
  name, 
  compact = false, 
  showIcon = true,
  lastRun,
  tooltip = true
}: ScraperStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'available':
        return {
          variant: 'outline' as const,
          className: 'text-emerald-700 border-emerald-200 bg-emerald-50',
          icon: <CheckCircle2 className={compact ? "h-3 w-3" : "h-4 w-4"} />,
          label: 'Available',
          description: 'Scraper is ready to process requests'
        }
      case 'busy':
        return {
          variant: 'outline' as const,
          className: 'text-blue-700 border-blue-200 bg-blue-50',
          icon: <Activity className={compact ? "h-3 w-3" : "h-4 w-4"} />,
          label: 'Busy',
          description: 'Scraper is currently processing a job'
        }
      case 'error':
        return {
          variant: 'destructive' as const,
          className: '',
          icon: <AlertCircle className={compact ? "h-3 w-3" : "h-4 w-4"} />,
          label: 'Error',
          description: 'Scraper encountered an error and needs attention'
        }
      case 'offline':
        return {
          variant: 'outline' as const,
          className: 'text-gray-700 border-gray-200 bg-gray-50',
          icon: <WifiOff className={compact ? "h-3 w-3" : "h-4 w-4"} />,
          label: 'Offline',
          description: 'Scraper is not responding or unavailable'
        }
      default:
        return {
          variant: 'secondary' as const,
          className: '',
          icon: <Server className={compact ? "h-3 w-3" : "h-4 w-4"} />,
          label: 'Unknown',
          description: 'Unknown scraper status'
        }
    }
  }

  const config = getStatusConfig()
  
  const badge = (
    <Badge 
      variant={config.variant} 
      className={`${config.className} ${compact ? 'text-xs px-2 py-0.5' : ''}`}
    >
      {showIcon && (
        <span className={compact ? "mr-1" : "mr-1.5"}>
          {config.icon}
        </span>
      )}
      {config.label}
    </Badge>
  )

  if (!tooltip) {
    return badge
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">{name || 'Scraper'} Status</p>
            <p className="text-sm">{config.description}</p>
            {lastRun && (
              <p className="text-xs text-muted-foreground">
                Last run: {new Date(lastRun).toLocaleDateString()}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function ProcessingStatus({ 
  status, 
  compact = false, 
  showIcon = true,
  tooltip = true
}: ProcessingStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'active':
        return {
          variant: 'outline' as const,
          className: 'text-emerald-700 border-emerald-200 bg-emerald-50',
          icon: <CheckCircle2 className={compact ? "h-3 w-3" : "h-4 w-4"} />,
          label: 'Active',
          description: 'Municipality is active and scheduled for processing'
        }
      case 'running':
        return {
          variant: 'outline' as const,
          className: 'text-blue-700 border-blue-200 bg-blue-50',
          icon: <Activity className={compact ? "h-3 w-3" : "h-4 w-4"} />,
          label: 'Running',
          description: 'Currently processing this municipality'
        }
      case 'pending':
        return {
          variant: 'outline' as const,
          className: 'text-amber-700 border-amber-200 bg-amber-50',
          icon: <Clock className={compact ? "h-3 w-3" : "h-4 w-4"} />,
          label: 'Pending',
          description: 'Waiting to be processed'
        }
      case 'testing':
        return {
          variant: 'outline' as const,
          className: 'text-purple-700 border-purple-200 bg-purple-50',
          icon: <RefreshCw className={compact ? "h-3 w-3" : "h-4 w-4"} />,
          label: 'Testing',
          description: 'Municipality scraper is being tested'
        }
      case 'confirmed':
        return {
          variant: 'outline' as const,
          className: 'text-blue-700 border-blue-200 bg-blue-50',
          icon: <CheckCircle2 className={compact ? "h-3 w-3" : "h-4 w-4"} />,
          label: 'Confirmed',
          description: 'Municipality configuration confirmed and ready'
        }
      case 'error':
        return {
          variant: 'destructive' as const,
          className: '',
          icon: <AlertCircle className={compact ? "h-3 w-3" : "h-4 w-4"} />,
          label: 'Error',
          description: 'Municipality processing encountered an error'
        }
      default:
        return {
          variant: 'secondary' as const,
          className: '',
          icon: <Server className={compact ? "h-3 w-3" : "h-4 w-4"} />,
          label: 'Unknown',
          description: 'Unknown processing status'
        }
    }
  }

  const config = getStatusConfig()
  
  const badge = (
    <Badge 
      variant={config.variant} 
      className={`${config.className} ${compact ? 'text-xs px-2 py-0.5' : ''}`}
    >
      {showIcon && (
        <span className={compact ? "mr-1" : "mr-1.5"}>
          {config.icon}
        </span>
      )}
      {config.label}
    </Badge>
  )

  if (!tooltip) {
    return badge
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">Processing Status</p>
            <p className="text-sm">{config.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function VersionBadge({ version, compact = false }: VersionBadgeProps) {
  const getVersionConfig = () => {
    switch (version) {
      case 'v1':
        return {
          className: 'text-amber-700 border-amber-200 bg-amber-50',
          label: 'V1',
          description: 'Legacy scraper (first generation)'
        }
      case 'v2':
        return {
          className: 'text-blue-700 border-blue-200 bg-blue-50',
          label: 'V2',
          description: 'Second generation scraper with improvements'
        }
      case 'enhanced':
        return {
          className: 'text-purple-700 border-purple-200 bg-purple-50',
          label: 'Enhanced',
          description: 'Latest generation with advanced features'
        }
    }
  }

  const config = getVersionConfig()
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`${config.className} ${compact ? 'text-xs px-2 py-0.5' : ''}`}
          >
            <Zap className={`${compact ? "h-3 w-3 mr-1" : "h-3 w-3 mr-1"}`} />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function SuccessRateBadge({ rate, compact = false }: SuccessRateBadgeProps) {
  const getSuccessConfig = () => {
    if (rate >= 95) {
      return {
        variant: 'outline' as const,
        className: 'text-emerald-700 border-emerald-200 bg-emerald-50',
        label: 'Excellent',
        description: `${rate}% success rate - Performing excellently`
      }
    } else if (rate >= 90) {
      return {
        variant: 'outline' as const,
        className: 'text-blue-700 border-blue-200 bg-blue-50',
        label: 'Good',
        description: `${rate}% success rate - Good performance`
      }
    } else if (rate >= 80) {
      return {
        variant: 'outline' as const,
        className: 'text-amber-700 border-amber-200 bg-amber-50',
        label: 'Fair',
        description: `${rate}% success rate - Fair performance, may need attention`
      }
    } else {
      return {
        variant: 'destructive' as const,
        className: '',
        label: 'Poor',
        description: `${rate}% success rate - Poor performance, needs immediate attention`
      }
    }
  }

  const config = getSuccessConfig()
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={config.variant} 
            className={`${config.className} ${compact ? 'text-xs px-2 py-0.5' : ''}`}
          >
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Utility component for displaying multiple status indicators
export function StatusIndicators({ 
  scraperStatus, 
  processingStatus, 
  version, 
  successRate,
  compact = false 
}: {
  scraperStatus?: ScraperStatusType
  processingStatus?: MunicipalityStatus
  version?: 'v1' | 'v2' | 'enhanced'
  successRate?: number
  compact?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 ${compact ? 'gap-1' : 'gap-2'}`}>
      {scraperStatus && (
        <ScraperStatus 
          status={scraperStatus} 
          compact={compact}
          tooltip={!compact}
        />
      )}
      {processingStatus && (
        <ProcessingStatus 
          status={processingStatus} 
          compact={compact}
          tooltip={!compact}
        />
      )}
      {version && (
        <VersionBadge 
          version={version} 
          compact={compact}
        />
      )}
      {successRate !== undefined && (
        <SuccessRateBadge 
          rate={successRate} 
          compact={compact}
        />
      )}
    </div>
  )
}