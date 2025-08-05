"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScraperProgress } from "@/components/scraper-progress"
import { ScraperStatus } from "@/components/scraper-status"
import { useScrapingManager } from "@/hooks/use-scrapers"
import { useFilesystemScraperManagement } from "@/hooks/use-filesystem-scrapers"
import { useUpdateMunicipality } from "@/hooks/use-municipalities"
import { useToast } from "@/hooks/use-toast"
import type { Municipality, ScraperInfo, ProcessingOperation, Scraper } from "@/types/database"
import { 
  Play, 
  Square, 
  Database, 
  Search, 
  BarChart3, 
  Workflow,
  CheckCircle2,
  Clock,
  AlertCircle,
  Activity
} from "lucide-react"

interface MunicipalityProcessingTabProps {
  municipalities: Municipality[]
  scrapers: ScraperInfo[]
  isLoading: boolean
  error: Error | null
}

const PROCESSING_OPERATIONS: Array<{
  value: ProcessingOperation
  label: string
  description: string
  icon: React.ReactNode
}> = [
  {
    value: 'scrape',
    label: 'Scrape Only',
    description: 'Find and collect document URLs',
    icon: <Search className="h-4 w-4" />
  },
  {
    value: 'extract',
    label: 'Extract Only',
    description: 'Extract text content from PDFs',
    icon: <Database className="h-4 w-4" />
  },
  {
    value: 'analyze',
    label: 'Analyze Only',
    description: 'Analyze content for relevance',
    icon: <BarChart3 className="h-4 w-4" />
  },
  {
    value: 'full_pipeline',
    label: 'Full Pipeline',
    description: 'Complete scrape, extract, and analyze process',
    icon: <Workflow className="h-4 w-4" />
  }
]

// ScraperSelector component for active scraper selection
interface ScraperSelectorProps {
  municipality: Municipality
  scrapers: any[] // Filesystem scrapers
  onActiveScraperChange: (municipalityId: number, scraperName: string | null) => void
  isUpdating?: boolean
}

function ScraperSelector({ 
  municipality,
  scrapers, 
  onActiveScraperChange,
  isUpdating = false 
}: ScraperSelectorProps) {
  // Get assigned scrapers for this municipality
  const assignedScraperNames = municipality.assigned_scrapers || []
  const assignedScrapers = scrapers.filter(scraper => assignedScraperNames.includes(scraper.name))

  // Handler for updating active scraper
  const handleActiveScraperChange = (scraperName: string | null) => {
    const finalScraperName = scraperName === "none" ? null : scraperName
    onActiveScraperChange(municipality.id, finalScraperName)
  }

  return (
    <Select
      value={municipality?.active_scraper || "none"}
      onValueChange={handleActiveScraperChange}
      disabled={isUpdating}
    >
      <SelectTrigger className="w-full min-w-[200px]">
        <SelectValue placeholder="Select active scraper..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <span className="text-muted-foreground">No active scraper</span>
        </SelectItem>
        {assignedScrapers.map((scraper) => (
          <SelectItem key={scraper.name} value={scraper.name}>
            <div className="flex items-center space-x-2">
              <span>{scraper.name}</span>
              <Badge variant="outline" className="text-xs">Assigned</Badge>
            </div>
          </SelectItem>
        ))}
        {assignedScrapers.length === 0 && (
          <SelectItem value="no-scrapers" disabled>
            <span className="text-muted-foreground text-xs">No scrapers assigned (use Tab 2)</span>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}

export function MunicipalityProcessingTab({ 
  municipalities, 
  scrapers, 
  isLoading, 
  error 
}: MunicipalityProcessingTabProps) {
  const [selectedOperation, setSelectedOperation] = useState<ProcessingOperation>('full_pipeline')
  const [updatingMunicipalities, setUpdatingMunicipalities] = useState<Set<number>>(new Set())
  
  const {
    startScraping,
    startScrapingAll,
    cancelActiveJob,
    activeJobs,
    isStartingJob,
    selectedMunicipalities,
    setSelectedMunicipalities
  } = useScrapingManager()

  // Fetch all scrapers from filesystem for assignment dropdown
  const filesystemScrapers = useFilesystemScraperManagement()
  const availableScrapers = filesystemScrapers.scrapers || []
  
  // Municipality update mutation for scraper assignment
  const updateMunicipality = useUpdateMunicipality()
  const { toast } = useToast()

  // Handle active scraper selection (not assignment - that's done in Tab 2)
  const handleActiveScraperChange = async (municipalityId: number, scraperName: string | null) => {
    const municipality = municipalities.find(m => m.id === municipalityId)
    const municipalityName = municipality?.name || `Municipality ${municipalityId}`
    
    setUpdatingMunicipalities(prev => new Set([...prev, municipalityId]))
    
    try {
      await updateMunicipality.mutateAsync({
        id: municipalityId as any, // Type assertion for branded type
        data: { active_scraper: scraperName }
      })
      
      toast({
        title: "Active Scraper Updated",
        description: scraperName 
          ? `Set ${scraperName} as active scraper for ${municipalityName}`
          : `Cleared active scraper for ${municipalityName}`,
        variant: "default"
      })
    } catch (error) {
      console.error('Failed to update active scraper:', error)
      toast({
        title: "Update Failed",
        description: `Failed to update active scraper for ${municipalityName}`,
        variant: "destructive"
      })
    } finally {
      setUpdatingMunicipalities(prev => {
        const next = new Set(prev)
        next.delete(municipalityId)
        return next
      })
    }
  }

  // Show all municipalities (not just those with active scrapers)
  const activeScraperMunicipalities = useMemo(() => {
    return municipalities
  }, [municipalities])

  // Get municipalities that can be selected (have assigned scrapers)
  const selectableMunicipalities = useMemo(() => {
    return activeScraperMunicipalities.filter(m => {
      const assignedScrapers = m.assigned_scrapers || []
      return Array.isArray(assignedScrapers) && assignedScrapers.length > 0
    })
  }, [activeScraperMunicipalities])

  // Selection handlers
  const handleSelectAll = () => {
    setSelectedMunicipalities(selectableMunicipalities.map(m => m.id))
  }

  const handleSelectNone = () => {
    setSelectedMunicipalities([])
  }

  const handleToggleMunicipality = (id: number) => {
    const currentSelection = selectedMunicipalities || []
    if (currentSelection.includes(id)) {
      setSelectedMunicipalities(currentSelection.filter(mId => mId !== id))
    } else {
      setSelectedMunicipalities([...currentSelection, id])
    }
  }

  const handleStartProcessing = async () => {
    if (selectedMunicipalities.length === 0) return

    console.log('DEBUG handleStartProcessing:')
    console.log('  selectedMunicipalities:', selectedMunicipalities)
    console.log('  selectedMunicipalities.length:', selectedMunicipalities.length)

    try {
      await startScraping({
        priority: 'normal',
        forceUpdate: false,
        skipRecentlyRun: true,
        scheduleNext: true
      })
    } catch (error) {
      console.error('Failed to start processing:', error)
    }
  }

  const getStatusBadge = (municipality: Municipality) => {
    switch (municipality.status) {
      case 'running':
        return (
          <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50">
            <Activity className="h-3 w-3 mr-1" />
            Running
          </Badge>
        )
      case 'active':
        return (
          <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Active
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        )
      case 'pending':
        return (
          <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary">
            {municipality.status}
          </Badge>
        )
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mr-2" />
            <p>Failed to load municipalities: {error.message}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Process Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Operation</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select the type of processing to perform on selected municipalities
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PROCESSING_OPERATIONS.map((operation) => (
              <div
                key={operation.value}
                className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedOperation === operation.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setSelectedOperation(operation.value)}
              >
                <div className="flex items-center space-x-2 mb-2">
                  <input
                    type="radio"
                    checked={selectedOperation === operation.value}
                    onChange={() => setSelectedOperation(operation.value)}
                    className="text-primary"
                  />
                  {operation.icon}
                  <span className="font-medium">{operation.label}</span>
                </div>
                <p className="text-sm text-muted-foreground">{operation.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Municipality Selection and Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Municipality Selection</CardTitle>
              <p className="text-sm text-muted-foreground">
                {selectedMunicipalities.length} of {selectableMunicipalities.length} selectable municipalities selected ({activeScraperMunicipalities.length} total)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={handleSelectNone}>
                Select None
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <Button
                onClick={handleStartProcessing}
                disabled={selectedMunicipalities.length === 0 || isStartingJob}
                className="flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                {isStartingJob ? 'Starting...' : 'Start Processing'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectableMunicipalities.length > 0 && selectedMunicipalities.length === selectableMunicipalities.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          handleSelectAll()
                        } else {
                          handleSelectNone()
                        }
                      }}
                      disabled={selectableMunicipalities.length === 0}
                    />
                  </TableHead>
                  <TableHead>Municipality</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned Scraper</TableHead>
                  <TableHead>Scraper Status</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeScraperMunicipalities.map((municipality) => {
                  // With many-to-many relationships, check assigned_scrapers array
                  const assignedScrapers = municipality.assigned_scrapers || []
                  const hasAssignedScrapers = Array.isArray(assignedScrapers) && assignedScrapers.length > 0
                  const activeScraperName = municipality.active_scraper
                  const isSelected = selectedMunicipalities.includes(municipality.id)
                  const isRunning = municipality.status === 'running'
                  
                  // Temporary debug - let's see what's happening
                  if (municipality.name === 'Ajax' || municipality.name === 'Hamilton') {
                    console.log(`DEBUG ${municipality.name}:`)
                    console.log('  assigned_scrapers:', municipality.assigned_scrapers)
                    console.log('  assignedScrapers:', assignedScrapers)
                    console.log('  hasAssignedScrapers:', hasAssignedScrapers)
                    console.log('  isRunning:', isRunning)
                    console.log('  disabled:', isRunning || !hasAssignedScrapers)
                    console.log('  isSelected:', isSelected)
                  }
                  
                  return (
                    <TableRow 
                      key={municipality.id}
                      className={isSelected ? 'bg-muted/50' : ''}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleMunicipality(municipality.id)}
                          disabled={false}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{municipality.name}</p>
                          <p className="text-xs text-muted-foreground">
                            ID: {municipality.id}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(municipality)}
                      </TableCell>
                      <TableCell>
                        <ScraperSelector
                          municipality={municipality}
                          scrapers={availableScrapers}
                          onActiveScraperChange={handleActiveScraperChange}
                          isUpdating={updatingMunicipalities.has(municipality.id)}
                        />
                      </TableCell>
                      <TableCell>
                        {hasAssignedScrapers ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              {assignedScrapers.map((scraperName: string) => (
                                <Badge 
                                  key={scraperName}
                                  variant={scraperName === activeScraperName ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {scraperName} {scraperName === activeScraperName && "(Active)"}
                                </Badge>
                              ))}
                            </div>
                            {updatingMunicipalities.has(municipality.id) && (
                              <div className="text-xs text-muted-foreground">
                                Updating...
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col space-y-1">
                            <Badge variant="outline" className="text-muted-foreground text-xs">
                              No Active Scraper
                            </Badge>
                            {updatingMunicipalities.has(municipality.id) && (
                              <div className="text-xs text-blue-600">
                                Updating...
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {municipality.last_run ? (
                            <span>
                              {new Date(municipality.last_run).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Never</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {municipality.next_run ? (
                            <span>
                              {new Date(municipality.next_run).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Not scheduled</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isRunning && activeJobs.length > 0 ? (
                          <div className="w-full max-w-24">
                            <ScraperProgress 
                              jobId={activeJobs[0]} 
                              compact
                            />
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            Idle
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Active Jobs Progress */}
      {activeJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Active Processing Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activeJobs.map((jobId) => (
                <ScraperProgress 
                  key={jobId}
                  jobId={jobId}
                  onCancel={() => cancelActiveJob(jobId)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}