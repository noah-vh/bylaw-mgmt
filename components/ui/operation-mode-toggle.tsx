"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { TestTube, Play, RotateCcw, AlertTriangle, Info, CheckCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

type OperationMode = "test" | "production" | "resume"

interface ModeConfig {
  id: OperationMode
  label: string
  description: string
  longDescription: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
  borderColor: string
  risks: string[]
  benefits: string[]
  requirements?: string[]
  destructive?: boolean
}

const modeConfigs: Record<OperationMode, ModeConfig> = {
  test: {
    id: "test",
    label: "Test Mode",
    description: "Safe testing with limited data",
    longDescription: "Run operations on a small subset of data to verify functionality without affecting production systems. Perfect for development and debugging.",
    icon: TestTube,
    color: "text-accent-info",
    bgColor: "bg-accent-info/10",
    borderColor: "border-accent-info/20",
    risks: [],
    benefits: [
      "Safe to run anytime",
      "No impact on production data",
      "Quick execution and feedback",
      "Perfect for debugging"
    ],
    requirements: [
      "Test data available",
      "Development environment"
    ]
  },
  production: {
    id: "production",
    label: "Production Mode",
    description: "Full-scale operation with all data",
    longDescription: "Execute operations on the complete dataset in the production environment. This will affect live data and should be used with caution.",
    icon: Play,
    color: "text-accent-success",
    bgColor: "bg-accent-success/10",
    borderColor: "border-accent-success/20",
    risks: [
      "Affects live production data",
      "Cannot be easily undone",
      "May impact system performance",
      "Requires careful monitoring"
    ],
    benefits: [
      "Processes all available data",
      "Updates production systems",
      "Real-world impact",
      "Complete data coverage"
    ],
    requirements: [
      "Production access permissions",
      "Backup verification",
      "Off-peak timing recommended"
    ],
    destructive: true
  },
  resume: {
    id: "resume",
    label: "Resume Mode",
    description: "Continue from previous checkpoint",
    longDescription: "Resume a previously interrupted operation from the last successful checkpoint. Only processes remaining items that haven't been completed.",
    icon: RotateCcw,
    color: "text-accent-warning",
    bgColor: "bg-accent-warning/10",
    borderColor: "border-accent-warning/20",
    risks: [
      "May skip items if checkpoint is stale",
      "Requires valid checkpoint data"
    ],
    benefits: [
      "Saves time by skipping completed items",
      "Recovers from interruptions",
      "Efficient resource usage",
      "Maintains progress tracking"
    ],
    requirements: [
      "Valid checkpoint file exists",
      "Previous operation was interrupted",
      "Checkpoint data is recent"
    ]
  }
}

const modeVariants = cva(
  "relative p-4 border-2 rounded-lg transition-all duration-200 cursor-pointer group",
  {
    variants: {
      selected: {
        true: "ring-2 ring-offset-2 ring-offset-background",
        false: "hover:shadow-md"
      },
      mode: {
        test: "border-accent-info/20 hover:border-accent-info/40",
        production: "border-accent-success/20 hover:border-accent-success/40",
        resume: "border-accent-warning/20 hover:border-accent-warning/40"
      }
    },
    compoundVariants: [
      {
        selected: true,
        mode: "test",
        class: "border-accent-info bg-accent-info/5 ring-accent-info/30"
      },
      {
        selected: true,
        mode: "production",
        class: "border-accent-success bg-accent-success/5 ring-accent-success/30"
      },
      {
        selected: true,
        mode: "resume",
        class: "border-accent-warning bg-accent-warning/5 ring-accent-warning/30"
      }
    ]
  }
)

interface OperationModeToggleProps {
  selectedMode: OperationMode
  onModeChange: (mode: OperationMode) => void
  disabled?: boolean
  className?: string
  showConfirmation?: boolean
  layout?: "horizontal" | "vertical" | "grid"
  size?: "sm" | "md" | "lg"
}

function OperationModeToggle({
  selectedMode,
  onModeChange,
  disabled = false,
  className,
  showConfirmation = true,
  layout = "horizontal",
  size = "md"
}: OperationModeToggleProps) {
  const [confirmationMode, setConfirmationMode] = React.useState<OperationMode | null>(null)
  const [confirmChecked, setConfirmChecked] = React.useState(false)
  
  const handleModeSelect = (mode: OperationMode) => {
    const config = modeConfigs[mode]
    
    if (config.destructive && showConfirmation && mode !== selectedMode) {
      setConfirmationMode(mode)
      setConfirmChecked(false)
    } else {
      onModeChange(mode)
    }
  }
  
  const handleConfirmation = () => {
    if (confirmationMode && confirmChecked) {
      onModeChange(confirmationMode)
      setConfirmationMode(null)
      setConfirmChecked(false)
    }
  }
  
  const layoutClasses = {
    horizontal: "flex space-x-4",
    vertical: "flex flex-col space-y-4",
    grid: "grid grid-cols-1 md:grid-cols-3 gap-4"
  }
  
  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg"
  }
  
  return (
    <TooltipProvider>
      <div className={cn("space-y-4", className)}>
        {/* Mode indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="text-sm font-medium text-muted-foreground">Operation Mode:</div>
            <Badge 
              className={cn(
                modeConfigs[selectedMode].color,
                modeConfigs[selectedMode].bgColor
              )}
            >
              {modeConfigs[selectedMode].label}
            </Badge>
          </div>
          
          {modeConfigs[selectedMode].destructive && (
            <div className="flex items-center space-x-1 text-accent-warning">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-medium">Destructive Operation</span>
            </div>
          )}
        </div>
        
        {/* Mode selector */}
        <div className={cn(layoutClasses[layout], sizeClasses[size])}>
          {(Object.keys(modeConfigs) as OperationMode[]).map((mode) => {
            const config = modeConfigs[mode]
            const Icon = config.icon
            const isSelected = selectedMode === mode
            
            return (
              <div
                key={mode}
                className={cn(
                  modeVariants({ selected: isSelected, mode }),
                  disabled && "opacity-50 cursor-not-allowed",
                  layout === "horizontal" && "flex-1"
                )}
                onClick={() => !disabled && handleModeSelect(mode)}
              >
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "p-2 rounded-md",
                    config.bgColor,
                    isSelected && "ring-2 ring-offset-2 ring-offset-background",
                    config.color.replace('text-', 'ring-')
                  )}>
                    <Icon className={cn("w-5 h-5", config.color)} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <div className="font-medium">{config.label}</div>
                      {isSelected && (
                        <CheckCircle className="w-4 h-4 text-accent-success" />
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {config.description}
                    </div>
                  </div>
                </div>
                
                {/* Detailed view for larger layouts */}
                {(layout === "grid" || layout === "vertical") && (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs text-muted-foreground">
                      {config.longDescription}
                    </div>
                    
                    {config.benefits.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-accent-success">Benefits:</div>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {config.benefits.slice(0, 2).map((benefit, index) => (
                            <li key={index} className="flex items-center space-x-1">
                              <span className="w-1 h-1 bg-accent-success rounded-full" />
                              <span>{benefit}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {config.risks.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-accent-error">Risks:</div>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {config.risks.slice(0, 2).map((risk, index) => (
                            <li key={index} className="flex items-center space-x-1">
                              <span className="w-1 h-1 bg-accent-error rounded-full" />
                              <span>{risk}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        
        {/* Current mode details */}
        <Card className={cn(
          "border-l-4",
          modeConfigs[selectedMode].borderColor.replace('border-', 'border-l-')
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2 text-base">
              <Info className={cn("w-4 h-4", modeConfigs[selectedMode].color)} />
              <span>Current Mode: {modeConfigs[selectedMode].label}</span>
            </CardTitle>
            <CardDescription>
              {modeConfigs[selectedMode].longDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {modeConfigs[selectedMode].requirements && (
              <div>
                <div className="text-sm font-medium mb-2">Requirements:</div>
                <ul className="space-y-1">
                  {modeConfigs[selectedMode].requirements!.map((requirement, index) => (
                    <li key={index} className="flex items-center space-x-2 text-sm text-muted-foreground">
                      <CheckCircle className="w-3 h-3 text-accent-success" />
                      <span>{requirement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {modeConfigs[selectedMode].risks.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2 text-accent-error">Important Considerations:</div>
                <ul className="space-y-1">
                  {modeConfigs[selectedMode].risks.map((risk, index) => (
                    <li key={index} className="flex items-center space-x-2 text-sm text-muted-foreground">
                      <AlertTriangle className="w-3 h-3 text-accent-error" />
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Confirmation dialog */}
        <Dialog 
          open={confirmationMode !== null} 
          onOpenChange={(open) => !open && setConfirmationMode(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-accent-warning" />
                <span>Confirm {confirmationMode && modeConfigs[confirmationMode].label}</span>
              </DialogTitle>
              <DialogDescription>
                {confirmationMode && modeConfigs[confirmationMode].longDescription}
              </DialogDescription>
            </DialogHeader>
            
            {confirmationMode && (
              <div className="space-y-4">
                {modeConfigs[confirmationMode].risks.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-accent-error">Please review these risks:</div>
                    <ul className="space-y-1">
                      {modeConfigs[confirmationMode].risks.map((risk, index) => (
                        <li key={index} className="flex items-start space-x-2 text-sm">
                          <AlertTriangle className="w-4 h-4 text-accent-error mt-0.5 shrink-0" />
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="confirm-operation"
                    checked={confirmChecked}
                    onCheckedChange={setConfirmChecked}
                  />
                  <Label htmlFor="confirm-operation" className="text-sm">
                    I understand the risks and want to proceed with {modeConfigs[confirmationMode].label}
                  </Label>
                </div>
              </div>
            )}
            
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmationMode(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmation}
                disabled={!confirmChecked}
                className="bg-accent-warning hover:bg-accent-warning/90"
              >
                Proceed
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

export { OperationModeToggle, modeConfigs }
export type { OperationMode, ModeConfig, OperationModeToggleProps }