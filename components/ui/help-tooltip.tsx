"use client"

import * as React from "react"
import { HelpCircle, Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface HelpTooltipProps {
  content: string | React.ReactNode
  children?: React.ReactNode
  variant?: "help" | "info"
  side?: "top" | "right" | "bottom" | "left"
  className?: string
}

export function HelpTooltip({ 
  content, 
  children, 
  variant = "help",
  side = "top",
  className 
}: HelpTooltipProps) {
  const IconComponent = variant === "help" ? HelpCircle : Info

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {children || (
            <IconComponent 
              className={cn(
                "h-4 w-4 text-muted-foreground hover:text-foreground cursor-help transition-colors",
                variant === "help" && "text-muted-foreground/60 hover:text-muted-foreground",
                variant === "info" && "text-blue-500/60 hover:text-blue-500",
                className
              )} 
            />
          )}
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          {typeof content === 'string' ? (
            <p className="text-sm">{content}</p>
          ) : (
            content
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface HelpTextProps {
  children: React.ReactNode
  helpText: string | React.ReactNode
  className?: string
}

export function HelpText({ children, helpText, className }: HelpTextProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {children}
      <HelpTooltip content={helpText} />
    </div>
  )
}

interface FeatureHintProps {
  title: string
  description: string
  icon?: React.ReactNode
  className?: string
}

export function FeatureHint({ title, description, icon, className }: FeatureHintProps) {
  return (
    <div className={cn("flex items-start gap-2 p-3 bg-muted/30 rounded-md border border-dashed", className)}>
      {icon && (
        <div className="flex-shrink-0 text-muted-foreground mt-0.5">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground/80">{description}</p>
      </div>
    </div>
  )
}