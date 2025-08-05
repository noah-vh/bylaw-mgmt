/**
 * Example usage of the Pipeline Control UI Components
 * 
 * This file demonstrates how to use all five pipeline control components together
 * to create a comprehensive pipeline management interface.
 */

"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

// Import our new pipeline control components
import { 
  PipelineStageIndicator, 
  type Stage, 
  type StageStatus 
} from "./pipeline-stage-indicator"
import { 
  BatchOperationSelector, 
  type Municipality, 
  type FilterCriteria 
} from "./batch-operation-selector"
import { 
  OperationModeToggle, 
  type OperationMode 
} from "./operation-mode-toggle"
import { 
  ProgressStreamDisplay, 
  type OperationState, 
  type LogEntry 
} from "./progress-stream-display"
import { 
  PipelineStatusBadge, 
  StageBadge, 
  ProgressBadge 
} from "./pipeline-status-badge"

// Example data
const exampleMunicipalities: Municipality[] = [
  {
    id: "toronto",
    name: "Toronto",
    status: "active",
    scraperType: "v2",
    lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    documentsCount: 1250,
    region: "GTA",
    population: 2794356
  },
  {
    id: "mississauga",
    name: "Mississauga",
    status: "error",
    scraperType: "enhanced",
    lastUpdated: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    documentsCount: 890,
    region: "GTA"
  },
  {
    id: "ottawa",
    name: "Ottawa",
    status: "updating",
    scraperType: "v2",
    lastUpdated: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
    documentsCount: 2100,
    region: "Eastern Ontario"
  },
  // Add more municipalities as needed
]

const exampleStages: Stage[] = [
  {
    id: "scraping",
    label: "Scraping",
    status: "completed",
    description: "Collect documents from municipal websites",
    startTime: new Date(Date.now() - 60 * 60 * 1000),
    endTime: new Date(Date.now() - 45 * 60 * 1000),
  },
  {
    id: "extraction",
    label: "Extraction",
    status: "running",
    description: "Extract and process document content",
    startTime: new Date(Date.now() - 45 * 60 * 1000),
  },
  {
    id: "analysis",
    label: "Analysis",
    status: "pending",
    description: "Analyze content and generate insights",
  },
]

const exampleLogs: LogEntry[] = [
  {
    id: "1",
    timestamp: new Date(Date.now() - 30000),
    level: "info",
    message: "Starting document extraction process",
    source: "extractor"
  },
  {
    id: "2",
    timestamp: new Date(Date.now() - 25000),
    level: "success",
    message: "Successfully processed 150 documents",
    source: "extractor",
    metadata: { processedCount: 150, totalCount: 500 }
  },
  {
    id: "3",
    timestamp: new Date(Date.now() - 20000),
    level: "warning",
    message: "Some PDFs could not be processed",
    details: "3 PDF files were corrupted or password-protected",
    source: "pdf-processor"
  },
  {
    id: "4",
    timestamp: new Date(Date.now() - 15000),
    level: "info",
    message: "Continuing with text extraction",
    source: "extractor"
  },
]

export function PipelineControlExample() {
  // State management
  const [selectedMunicipalities, setSelectedMunicipalities] = React.useState<string[]>([])
  const [operationMode, setOperationMode] = React.useState<OperationMode>("test")
  const [filters, setFilters] = React.useState<FilterCriteria>({})
  
  // Example operation state
  const [operationState, setOperationState] = React.useState<OperationState>({
    status: "running",
    startTime: new Date(Date.now() - 45 * 60 * 1000),
    progress: {
      current: 350,
      total: 500,
      percentage: 70,
      rate: 2.5,
      eta: 60,
      stage: "Document Extraction",
      substage: "Processing PDFs"
    },
    logs: exampleLogs,
    canPause: true,
    canCancel: true
  })

  // Event handlers
  const handleStageClick = (stage: Stage) => {
    console.log("Stage clicked:", stage)
  }

  const handlePauseOperation = () => {
    setOperationState(prev => ({ ...prev, status: "paused" }))
  }

  const handleResumeOperation = () => {
    setOperationState(prev => ({ ...prev, status: "running" }))
  }

  const handleCancelOperation = () => {
    setOperationState(prev => ({ ...prev, status: "cancelled" }))
  }

  const handleExportLogs = () => {
    console.log("Exporting logs...")
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Pipeline Control System</h1>
        <p className="text-muted-foreground">
          Comprehensive example of the pipeline control UI components
        </p>
      </div>

      {/* Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Status Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <PipelineStatusBadge status="scraping" stage="scraping" />
            <PipelineStatusBadge status="extracting" stage="extraction" showProgress progress={70} />
            <PipelineStatusBadge status="completed" />
            <PipelineStatusBadge status="error" />
            <PipelineStatusBadge status="paused" compact />
          </div>
          
          {/* Stage indicators */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Stage Progress</h4>
            <div className="flex gap-2">
              <StageBadge stage="scraping" completed />
              <StageBadge stage="extraction" active />
              <StageBadge stage="analysis" />
            </div>
          </div>
          
          {/* Progress badges */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Progress Indicators</h4>
            <div className="flex gap-2">
              <ProgressBadge progress={350} total={500} stage="Extraction" />
              <ProgressBadge progress={85} stage="Analysis" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stage Indicator */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Stage Indicator</CardTitle>
        </CardHeader>
        <CardContent>
          <PipelineStageIndicator
            stages={exampleStages}
            onStageClick={handleStageClick}
            showTimings
            orientation="horizontal"
          />
        </CardContent>
      </Card>

      {/* Operation Mode Toggle */}
      <Card>
        <CardHeader>
          <CardTitle>Operation Mode Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <OperationModeToggle
            selectedMode={operationMode}
            onModeChange={setOperationMode}
            layout="grid"
            showConfirmation
          />
        </CardContent>
      </Card>

      {/* Municipality Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Municipality Batch Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <BatchOperationSelector
            municipalities={exampleMunicipalities}
            selectedIds={selectedMunicipalities}
            onSelectionChange={setSelectedMunicipalities}
            filters={filters}
            onFiltersChange={setFilters}
            showStats
          />
        </CardContent>
      </Card>

      {/* Progress Stream Display */}
      <Card>
        <CardHeader>
          <CardTitle>Real-time Progress Stream</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgressStreamDisplay
            operationState={operationState}
            onPause={handlePauseOperation}
            onResume={handleResumeOperation}
            onCancel={handleCancelOperation}
            onExportLogs={handleExportLogs}
            showControls
            showTimings
            autoScroll
          />
        </CardContent>
      </Card>

      {/* Control Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={selectedMunicipalities.length === 0}
              className="bg-accent-success hover:bg-accent-success/90"
            >
              Start Pipeline ({selectedMunicipalities.length} selected)
            </Button>
            <Button variant="outline">
              Schedule Operation
            </Button>
            <Button variant="outline">
              View History
            </Button>
            <Button variant="destructive" disabled={operationState.status !== "running"}>
              Emergency Stop
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default PipelineControlExample