"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Play,
  Pause,
  RotateCcw,
  Settings,
  Database,
  FileText,
  BarChart3,
  Workflow,
  Clock,
  CheckCircle2,
  AlertCircle,
  Info
} from "lucide-react"
import type { Municipality, MunicipalityId } from "@/types/database"
import type { ProgressReport, PipelineStage } from "@/lib/service-types"
import { useFilesystemScraperManagement } from "@/hooks/use-filesystem-scrapers"

interface PipelinePhaseControlsProps {
  municipalities: Municipality[];
  onPhaseComplete?: (phase: string, results: any) => void;
  onProgress?: (phase: string, progress: ProgressReport) => void;
}

type PipelinePhase = 'scraping' | 'extraction' | 'analysis' | 'complete'
type OperationMode = 'test' | 'production' | 'resume'

const PHASE_CONFIG = {
  scraping: {
    icon: Database,
    label: 'Scraping Phase',
    description: 'Discover and download bylaw documents from municipality websites',
    color: 'blue'
  },
  extraction: {
    icon: FileText,
    label: 'Extraction Phase', 
    description: 'Extract text content from downloaded documents',
    color: 'green'
  },
  analysis: {
    icon: BarChart3,
    label: 'Analysis Phase',
    description: 'Analyze document content and generate insights',
    color: 'purple'
  },
  complete: {
    icon: Workflow,
    label: 'Complete Pipeline',
    description: 'Run all phases sequentially for selected municipalities',
    color: 'orange'
  }
} as const

export function PipelinePhaseControls({ 
  municipalities, 
  onPhaseComplete,
  onProgress 
}: PipelinePhaseControlsProps) {
  const [selectedPhase, setSelectedPhase] = useState<PipelinePhase>('scraping')
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<MunicipalityId[]>([])
  const [operationMode, setOperationMode] = useState<OperationMode>('test')
  const [phaseOptions, setPhaseOptions] = useState({
    timeout: 300000, // 5 minutes
    resumeFrom: '',
    config: {}
  })

  const {
    runPhase,
    testPipelinePhase,
    isRunningPhase,
    runningPhases,
    progressReports,
    updateProgress
  } = useFilesystemScraperManagement()

  const phaseConfig = PHASE_CONFIG[selectedPhase]
  const PhaseIcon = phaseConfig.icon

  const handleStartPhase = async () => {
    if (selectedMunicipalities.length === 0) return

    try {
      const options = {
        testMode: operationMode === 'test',
        resumeFrom: operationMode === 'resume' ? phaseOptions.resumeFrom : undefined,
        timeout: phaseOptions.timeout,
        config: phaseOptions.config
      }

      let result
      if (operationMode === 'test') {
        if (selectedPhase === 'complete') {
          // For complete pipeline in test mode, run production but with test options
          result = await runPhase(selectedPhase, selectedMunicipalities, options)
        } else {
          result = await testPipelinePhase(selectedPhase, selectedMunicipalities, options)
        }
      } else {
        result = await runPhase(selectedPhase, selectedMunicipalities, options)
      }

      onPhaseComplete?.(selectedPhase, result)
    } catch (error) {
      console.error(`Failed to run ${selectedPhase} phase:`, error)
    }
  }

  const handleMunicipalityToggle = (municipalityId: MunicipalityId) => {
    setSelectedMunicipalities(prev =>
      prev.includes(municipalityId)
        ? prev.filter(id => id !== municipalityId)
        : [...prev, municipalityId]
    )
  }

  const handleSelectAll = () => {
    setSelectedMunicipalities(municipalities.map(m => m.id))
  }

  const handleSelectNone = () => {
    setSelectedMunicipalities([])
  }

  // Get progress for current operation
  const currentOperationKey = `${operationMode === 'test' ? 'test-' : ''}${selectedPhase}-${selectedMunicipalities.join(',')}`
  const currentProgress = progressReports.get(currentOperationKey) || []
  const latestProgress = currentProgress[currentProgress.length - 1]
  const isCurrentlyRunning = runningPhases.includes(currentOperationKey)

  return (
    <div className="space-y-6">
      {/* Phase Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Pipeline Phase Control
          </CardTitle>
          <CardDescription>
            Run individual pipeline phases or the complete pipeline with granular control
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Phase Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Phase</Label>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(PHASE_CONFIG).map(([phase, config]) => {
                const Icon = config.icon
                const isSelected = selectedPhase === phase
                
                return (
                  <button
                    key={phase}
                    onClick={() => setSelectedPhase(phase as PipelinePhase)}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    <Icon className={`h-5 w-5 mt-0.5 ${
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{config.label}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        {config.description}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Operation Mode */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Operation Mode</Label>
            <Select value={operationMode} onValueChange={(value: OperationMode) => setOperationMode(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">
                  Test Mode - Safe execution with limited scope
                </SelectItem>
                <SelectItem value="production">
                  Production Mode - Full execution with all features
                </SelectItem>
                <SelectItem value="resume">
                  Resume Mode - Continue from previous execution
                </SelectItem>
              </SelectContent>
            </Select>
            
            {operationMode === 'test' && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded border-l-2 border-blue-200">
                <Info className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-blue-700">
                  Test mode limits scope and won't modify production data
                </span>
              </div>
            )}
            
            {operationMode === 'resume' && (
              <div className="space-y-2">
                <Label className="text-xs">Resume From ID</Label>
                <input
                  type="text"
                  value={phaseOptions.resumeFrom}
                  onChange={(e) => setPhaseOptions(prev => ({ ...prev, resumeFrom: e.target.value }))}
                  placeholder="Enter checkpoint ID to resume from"
                  className="w-full px-3 py-2 text-xs border rounded focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Municipality Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            Municipality Selection
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                All
              </Button>
              <Button variant="outline" size="sm" onClick={handleSelectNone}>
                None
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Select which municipalities to process ({selectedMunicipalities.length} selected)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            <div className="space-y-2">
              {municipalities.map((municipality) => {
                const isSelected = selectedMunicipalities.includes(municipality.id)
                const hasAssignedScraper = municipality.assigned_scrapers?.length > 0 || municipality.active_scraper
                
                return (
                  <div key={municipality.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/30">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleMunicipalityToggle(municipality.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{municipality.name}</div>
                        <div className="text-xs text-muted-foreground">{municipality.province}</div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {hasAssignedScraper ? (
                        <Badge variant="default" className="text-xs">
                          {municipality.active_scraper || 'Assigned'}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          No Scraper
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Progress Display */}
      {(isCurrentlyRunning || currentProgress.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {isCurrentlyRunning ? 'Running' : 'Last Execution'}: {phaseConfig.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestProgress && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{latestProgress.message}</span>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(latestProgress.progress)}%
                  </span>
                </div>
                <Progress value={latestProgress.progress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {latestProgress.items_completed} / {latestProgress.items_total} items
                  </span>
                  {latestProgress.estimated_time_remaining && (
                    <span>
                      ~{Math.round(latestProgress.estimated_time_remaining / 1000)}s remaining
                    </span>
                  )}
                </div>
              </div>
            )}

            {currentProgress.length > 1 && (
              <ScrollArea className="h-32">
                <div className="space-y-1">
                  {currentProgress.slice(-5).map((progress, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs p-1">
                      <div className="w-2 h-2 rounded-full bg-primary/20" />
                      <span className="text-muted-foreground">
                        {new Date(progress.details?.timestamp as number || Date.now()).toLocaleTimeString()}
                      </span>
                      <span>{progress.message}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <PhaseIcon className="h-4 w-4" />
          {selectedMunicipalities.length === 0 ? (
            "Select municipalities to continue"
          ) : (
            `Ready to run ${phaseConfig.label.toLowerCase()} for ${selectedMunicipalities.length} municipalities`
          )}
        </div>
        
        <div className="flex gap-2">
          {isCurrentlyRunning && (
            <Button variant="outline" size="sm" disabled>
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          
          <Button
            onClick={handleStartPhase}
            disabled={selectedMunicipalities.length === 0 || isCurrentlyRunning}
            className="flex items-center gap-2"
          >
            {isCurrentlyRunning ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start {phaseConfig.label}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}