"use client"

import { useState, useEffect } from 'react'
import { 
  Play, 
  Pause, 
  Square, 
  Download, 
  FileText, 
  Brain, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Users,
  Activity,
  RefreshCw,
  Settings,
  Filter,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'

import { 
  usePipelinePhase, 
  usePipelineStatus, 
  useBulkPipelineOperations,
  type PipelinePhase,
  type PipelineOptions,
  getPipelinePhaseColor,
  getPipelinePhaseIcon,
  getPipelinePhaseLabel
} from '@/hooks/use-pipeline'
import { useMunicipalitySearch } from '@/hooks/use-municipalities'
import type { Municipality } from '@/types/database'
import { format } from 'date-fns'

interface MunicipalityPipelineDashboardProps {
  selectedMunicipalities?: number[]
  onSelectionChange?: (ids: number[]) => void
  showSelectionOnly?: boolean
}

export function MunicipalityPipelineDashboard({ 
  selectedMunicipalities = [], 
  onSelectionChange,
  showSelectionOnly = false
}: MunicipalityPipelineDashboardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [selectedPhase, setSelectedPhase] = useState<PipelinePhase>('scraping')
  const [operationOptions, setOperationOptions] = useState<PipelineOptions>({
    skipExisting: false,
    batchSize: 5,
    maxRetries: 2
  })

  const { data: pipelineStatus } = usePipelineStatus()
  const { data: municipalitiesData } = useMunicipalitySearch()
  const {
    selectedMunicipalities: bulkSelected,
    setSelectedMunicipalities: setBulkSelected,
    operationStatus,
    runBulkOperation,
    resetOperationStatus,
    isRunning
  } = useBulkPipelineOperations()

  // Sync external selection with internal state
  useEffect(() => {
    if (selectedMunicipalities.length > 0) {
      setBulkSelected(selectedMunicipalities)
    }
  }, [selectedMunicipalities, setBulkSelected])

  const municipalities = municipalitiesData?.data || []
  const selectedMunicipalityData = municipalities.filter(m => 
    (showSelectionOnly ? selectedMunicipalities : bulkSelected).includes(m.id)
  )

  const handleRunOperation = async (phase: PipelinePhase) => {
    const targetMunicipalities = showSelectionOnly ? selectedMunicipalities : bulkSelected
    
    if (targetMunicipalities.length === 0) {
      alert('Please select municipalities to process')
      return
    }

    try {
      await runBulkOperation(phase, targetMunicipalities, operationOptions)
    } catch (error) {
      console.error(`Failed to run ${phase} operation:`, error)
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = municipalities.map(m => m.id)
      setBulkSelected(allIds)
      onSelectionChange?.(allIds)
    } else {
      setBulkSelected([])
      onSelectionChange?.([])
    }
  }

  const handleSelectMunicipality = (id: number, checked: boolean) => {
    const newSelection = checked 
      ? [...bulkSelected, id]
      : bulkSelected.filter(selectedId => selectedId !== id)
    
    setBulkSelected(newSelection)
    onSelectionChange?.(newSelection)
  }

  // Calculate pipeline statistics
  const pipelineStats = {
    totalMunicipalities: municipalities.length,
    selectedMunicipalities: showSelectionOnly ? selectedMunicipalities.length : bulkSelected.length,
    inProgress: pipelineStatus?.isRunning ? 1 : 0,
    completed: municipalities.filter(m => m.status === 'active').length,
    errors: municipalities.filter(m => m.status === 'error').length
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Pipeline Control Dashboard</CardTitle>
            </div>
            {pipelineStatus?.isRunning && (
              <Badge variant="secondary" className="animate-pulse">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Running
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        <CardDescription>
          Manage pipeline operations across {pipelineStats.selectedMunicipalities} selected municipalities
        </CardDescription>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6">
          {/* Statistics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-sm font-medium">{pipelineStats.selectedMunicipalities}</div>
                <div className="text-xs text-muted-foreground">Selected</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Clock className="h-5 w-5 text-yellow-500" />
              <div>
                <div className="text-sm font-medium">{pipelineStats.inProgress}</div>
                <div className="text-xs text-muted-foreground">In Progress</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-sm font-medium">{pipelineStats.completed}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-sm font-medium">{pipelineStats.errors}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
            </div>
          </div>

          {/* Current Operation Status */}
          {(isRunning || operationStatus.operation) && (
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    {operationStatus.operation ? getPipelinePhaseLabel(operationStatus.operation) : 'Processing'}
                  </CardTitle>
                  {operationStatus.currentMunicipality && (
                    <Badge variant="outline" className="text-xs">
                      {operationStatus.currentMunicipality}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Progress: {operationStatus.completed}/{operationStatus.total}</span>
                    <span>{Math.round(operationStatus.progress)}%</span>
                  </div>
                  <Progress value={operationStatus.progress} className="h-2" />
                  {operationStatus.errors.length > 0 && (
                    <div className="text-sm text-destructive">
                      {operationStatus.errors.length} error(s) occurred
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Pipeline Phase Controls */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Pipeline Operations</h3>
              <div className="flex items-center gap-2">
                <Select value={selectedPhase} onValueChange={(value) => setSelectedPhase(value as PipelinePhase)}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select phase" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scraping">
                      <div className="flex items-center gap-2">
                        <Download className="h-4 w-4" />
                        Scraping Only
                      </div>
                    </SelectItem>
                    <SelectItem value="extraction">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Extraction Only
                      </div>
                    </SelectItem>
                    <SelectItem value="analysis">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4" />
                        Analysis Only
                      </div>
                    </SelectItem>
                    <SelectItem value="complete">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Complete Pipeline
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Operation Options</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <div className="p-2 space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="skipExisting"
                          checked={operationOptions.skipExisting}
                          onCheckedChange={(checked) => 
                            setOperationOptions(prev => ({ ...prev, skipExisting: checked as boolean }))
                          }
                        />
                        <label htmlFor="skipExisting" className="text-sm">Skip existing</label>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Batch Size</label>
                        <Select 
                          value={operationOptions.batchSize?.toString()} 
                          onValueChange={(value) => 
                            setOperationOptions(prev => ({ ...prev, batchSize: parseInt(value) }))
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                            <SelectItem value="10">10</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Max Retries</label>
                        <Select 
                          value={operationOptions.maxRetries?.toString()} 
                          onValueChange={(value) => 
                            setOperationOptions(prev => ({ ...prev, maxRetries: parseInt(value) }))
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0</SelectItem>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Operation Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={() => handleRunOperation(selectedPhase)}
                disabled={isRunning || (showSelectionOnly ? selectedMunicipalities.length === 0 : bulkSelected.length === 0)}
                className="flex items-center gap-2"
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Run {getPipelinePhaseLabel(selectedPhase)}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => handleRunOperation('scraping')}
                disabled={isRunning || (showSelectionOnly ? selectedMunicipalities.length === 0 : bulkSelected.length === 0)}
                size="sm"
              >
                <Download className="h-4 w-4 mr-1" />
                Scrape
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => handleRunOperation('extraction')}
                disabled={isRunning || (showSelectionOnly ? selectedMunicipalities.length === 0 : bulkSelected.length === 0)}
                size="sm"
              >
                <FileText className="h-4 w-4 mr-1" />
                Extract
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => handleRunOperation('analysis')}
                disabled={isRunning || (showSelectionOnly ? selectedMunicipalities.length === 0 : bulkSelected.length === 0)}
                size="sm"
              >
                <Brain className="h-4 w-4 mr-1" />
                Analyze
              </Button>

              {operationStatus.operation && (
                <Button 
                  variant="destructive" 
                  onClick={resetOperationStatus}
                  size="sm"
                >
                  <Square className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Municipality Selection */}
          {!showSelectionOnly && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Municipality Selection</h3>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={bulkSelected.length === municipalities.length && municipalities.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">Select All</span>
                </div>
              </div>

              <ScrollArea className="h-48 border rounded-md">
                <div className="p-3 space-y-2">
                  {municipalities.map((municipality) => (
                    <div key={municipality.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-sm">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={bulkSelected.includes(municipality.id)}
                          onCheckedChange={(checked) => handleSelectMunicipality(municipality.id, checked as boolean)}
                        />
                        <div>
                          <div className="text-sm font-medium">{municipality.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {municipality.assigned_scrapers?.length || 0} scrapers assigned
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={municipality.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                          {municipality.status}
                        </Badge>
                        {municipality.lastScrape && (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(municipality.lastScrape.date), 'MMM d')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Selected Municipalities Summary (when showing selection only) */}
          {showSelectionOnly && selectedMunicipalityData.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Selected Municipalities ({selectedMunicipalityData.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {selectedMunicipalityData.map((municipality) => (
                  <div key={municipality.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-sm">
                    <div>
                      <div className="text-sm font-medium">{municipality.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {municipality.assigned_scrapers?.length || 0} scrapers
                      </div>
                    </div>
                    <Badge variant={municipality.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                      {municipality.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}