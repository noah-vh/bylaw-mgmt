"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  TestTube, 
  Clock, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink,
  Play,
  Settings,
  Info,
  Database,
  BarChart3,
  Workflow,
  Layers
} from "lucide-react"
import { useTestScraperAgainstMunicipality, useTestPhaseAgainstMunicipality, type FilesystemScraper, type TestScraperResult, type PipelinePhaseResult } from "@/hooks/use-filesystem-scrapers"
import type { Municipality, MunicipalityId } from "@/types/database"

interface TestScraperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scraper: FilesystemScraper | null;
  municipalities: Municipality[];
}

export function TestScraperDialog({ 
  open, 
  onOpenChange, 
  scraper, 
  municipalities 
}: TestScraperDialogProps) {
  const [selectedMunicipalityId, setSelectedMunicipalityId] = useState<MunicipalityId | null>(null)
  const [testOptions, setTestOptions] = useState({
    dryRun: true,
    maxPages: 5,
    timeout: 60000,
    testMode: 'test' as 'test' | 'production',
    phase: 'scraping' as 'scraping' | 'extraction' | 'analysis' | 'complete'
  })
  const [testResult, setTestResult] = useState<TestScraperResult | null>(null)
  const [phaseResult, setPhaseResult] = useState<PipelinePhaseResult | null>(null)
  const [activeTab, setActiveTab] = useState<'scraper-test' | 'phase-test'>('scraper-test')
  
  const testScraper = useTestScraperAgainstMunicipality()
  const testPhase = useTestPhaseAgainstMunicipality()

  const selectedMunicipality = municipalities.find(m => m.id === selectedMunicipalityId)

  const handleStartTest = async () => {
    if (!scraper || !selectedMunicipalityId) return
    
    try {
      const result = await testScraper.mutateAsync({
        scraperName: scraper.name,
        municipalityId: selectedMunicipalityId,
        options: testOptions
      })
      setTestResult(result)
    } catch (error) {
      console.error('Test failed:', error)
    }
  }

  const handleStartPhaseTest = async () => {
    if (!selectedMunicipalityId) return
    
    try {
      const result = await testPhase.mutateAsync({
        phase: testOptions.phase,
        municipalityIds: [selectedMunicipalityId],
        options: {
          testMode: testOptions.testMode === 'test',
          timeout: testOptions.timeout
        }
      })
      setPhaseResult(result)
    } catch (error) {
      console.error('Phase test failed:', error)
    }
  }

  const handleReset = () => {
    setTestResult(null)
    setPhaseResult(null)
    setSelectedMunicipalityId(null)
    setTestOptions({
      dryRun: true,
      maxPages: 5,
      timeout: 60000,
      testMode: 'test',
      phase: 'scraping'
    })
  }

  const handleClose = () => {
    handleReset()
    onOpenChange(false)
  }

  if (!scraper) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <TestTube className="h-5 w-5" />
            Test {scraper.displayName}
          </DialogTitle>
          <DialogDescription className="text-sm">
            Test scraper functionality or individual pipeline phases against municipalities.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scraper-test" className="flex items-center gap-2">
              <TestTube className="h-4 w-4" />
              Scraper Test
            </TabsTrigger>
            <TabsTrigger value="phase-test" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Phase Test
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scraper-test" className="mt-4">
            <ScraperTestContent 
              scraper={scraper}
              municipalities={municipalities}
              selectedMunicipality={selectedMunicipality}
              selectedMunicipalityId={selectedMunicipalityId}
              setSelectedMunicipalityId={setSelectedMunicipalityId}
              testOptions={testOptions}
              setTestOptions={setTestOptions}
              testResult={testResult}
              isLoading={testScraper.isPending}
              onStartTest={handleStartTest}
            />
          </TabsContent>

          <TabsContent value="phase-test" className="mt-4">
            <PhaseTestContent
              municipalities={municipalities}
              selectedMunicipality={selectedMunicipality}
              selectedMunicipalityId={selectedMunicipalityId}
              setSelectedMunicipalityId={setSelectedMunicipalityId}
              testOptions={testOptions}
              setTestOptions={setTestOptions}
              phaseResult={phaseResult}
              isLoading={testPhase.isPending}
              onStartTest={handleStartPhaseTest}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-4 border-t">
          <div className="flex justify-between w-full items-center">
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
            <div className="flex gap-2 items-center">
              {!selectedMunicipalityId && (
                <p className="text-xs text-muted-foreground mr-2">
                  Select a municipality to enable testing
                </p>
              )}
              {(testResult || phaseResult) && (
                <Button variant="outline" onClick={handleReset} size="sm">
                  Reset
                </Button>
              )}
              <Button 
                onClick={activeTab === 'scraper-test' ? handleStartTest : handleStartPhaseTest}
                disabled={!selectedMunicipalityId || testScraper.isPending || testPhase.isPending}
                className="flex items-center gap-2"
                size="default"
              >
                {(testScraper.isPending || testPhase.isPending) ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Start Test
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Component for scraper testing
function ScraperTestContent({
  scraper,
  municipalities,
  selectedMunicipality,
  selectedMunicipalityId,
  setSelectedMunicipalityId,
  testOptions,
  setTestOptions,
  testResult,
  isLoading,
  onStartTest
}: {
  scraper: FilesystemScraper;
  municipalities: Municipality[];
  selectedMunicipality: Municipality | undefined;
  selectedMunicipalityId: MunicipalityId | null;
  setSelectedMunicipalityId: (id: MunicipalityId | null) => void;
  testOptions: any;
  setTestOptions: (options: any) => void;
  testResult: TestScraperResult | null;
  isLoading: boolean;
  onStartTest: () => void;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Column 1 - Municipality Selection */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Municipality Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="municipality" className="text-sm font-medium">Select Municipality</Label>
              <Select 
                value={selectedMunicipalityId?.toString() || ""} 
                onValueChange={(value) => setSelectedMunicipalityId(parseInt(value) as MunicipalityId)}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Choose municipality..." />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-48">
                    {municipalities.map((municipality) => {
                      const hasAnyAssignment = municipality.assigned_scrapers?.length > 0 || 
                                              municipality.active_scraper || 
                                              municipality.scraper_name
                      
                      const canUseThisScraper = scraper && (
                        municipality.assigned_scrapers?.includes(scraper.name) ||
                        municipality.active_scraper === scraper.name ||
                        municipality.scraper_name === scraper.name
                      )
                      
                      return (
                        <SelectItem key={municipality.id} value={municipality.id.toString()}>
                          <div className="flex items-center justify-between w-full pr-2">
                            <span className="truncate">{municipality.name}</span>
                            <div className="flex gap-1 ml-2 shrink-0">
                              {canUseThisScraper && (
                                <Badge variant="default" className="text-xs px-1.5">
                                  Compatible
                                </Badge>
                              )}
                              {hasAnyAssignment && !canUseThisScraper && (
                                <Badge variant="outline" className="text-xs px-1.5">
                                  Other
                                </Badge>
                              )}
                              {!hasAnyAssignment && (
                                <Badge variant="secondary" className="text-xs px-1.5">
                                  None
                                </Badge>
                              )}
                            </div>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>

            {/* Selected Municipality Info */}
            {selectedMunicipality && (
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="pt-4 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Website</span>
                      <a 
                        href={selectedMunicipality.website_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        View Site <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">Scrapers</span>
                      {selectedMunicipality.assigned_scrapers?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {selectedMunicipality.assigned_scrapers.map(scraperName => (
                            <Badge 
                              key={scraperName} 
                              variant={scraperName === selectedMunicipality.active_scraper ? "default" : "outline"} 
                              className="text-xs px-2 py-0.5"
                            >
                              {scraperName}
                              {scraperName === selectedMunicipality.active_scraper && " ★"}
                            </Badge>
                          ))}
                        </div>
                      ) : selectedMunicipality.scraper_name ? (
                        <Badge variant="outline" className="text-xs">
                          {selectedMunicipality.scraper_name} (legacy)
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          No scraper assigned
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Test Options */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Test Options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="dry-run"
                checked={testOptions.dryRun}
                onCheckedChange={(checked) => 
                  setTestOptions(prev => ({ ...prev, dryRun: checked as boolean }))
                }
              />
              <Label htmlFor="dry-run" className="text-sm">
                Dry run (don't save documents)
              </Label>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Test Mode</Label>
              <Select 
                value={testOptions.testMode} 
                onValueChange={(value: 'test' | 'production') => 
                  setTestOptions(prev => ({ ...prev, testMode: value }))
                }
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test Mode</SelectItem>
                  <SelectItem value="production">Production Mode</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="max-pages" className="text-xs">Max Pages</Label>
                <Input
                  id="max-pages"
                  type="number"
                  min="1"
                  max="20"
                  value={testOptions.maxPages}
                  className="h-8"
                  onChange={(e) => 
                    setTestOptions(prev => ({ ...prev, maxPages: parseInt(e.target.value) || 5 }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="timeout" className="text-xs">Timeout (sec)</Label>
                <Input
                  id="timeout"
                  type="number"
                  min="30"
                  max="300"
                  value={testOptions.timeout / 1000}
                  className="h-8"
                  onChange={(e) => 
                    setTestOptions(prev => ({ ...prev, timeout: (parseInt(e.target.value) || 60) * 1000 }))
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Column 2 - Scraper Info */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4" />
              Scraper Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Version</span>
                <Badge variant="outline" className="text-xs">
                  {scraper.version}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">File Size</span>
                <span className="text-xs">
                  {scraper.fileSize ? `${Math.round(scraper.fileSize / 1024)} KB` : 'Unknown'}
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">Capabilities</span>
              <div className="flex flex-wrap gap-1">
                {scraper.capabilities.map(cap => (
                  <Badge key={cap} variant="secondary" className="text-xs">
                    {cap}
                  </Badge>
                ))}
              </div>
            </div>

            {scraper.description && (
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground">Description</span>
                <p className="text-xs leading-relaxed bg-muted/30 p-2 rounded border-l-2 border-muted">
                  {scraper.description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Column 3 - Test Results */}
      <div className="space-y-4">
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Test Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-56 space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">Running test...</p>
                <p className="text-xs text-muted-foreground text-center px-4">
                  Testing {scraper.name} against {selectedMunicipality?.name}
                </p>
              </div>
            ) : testResult ? (
              <ScrollArea className="h-56">
                <div className="space-y-3 pr-2">
                  {/* Test Status */}
                  <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                    {testResult.testResults.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">
                      {testResult.testResults.success ? 'Test Passed' : 'Test Failed'}
                    </span>
                  </div>

                  {/* Test Metrics */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-blue-50 rounded border-l-2 border-blue-200">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3 text-blue-500" />
                        <div>
                          <p className="text-xs text-muted-foreground">Documents</p>
                          <p className="text-sm font-bold">{testResult.testResults.documentsFound}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-2 bg-green-50 rounded border-l-2 border-green-200">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-green-500" />
                        <div>
                          <p className="text-xs text-muted-foreground">Duration</p>
                          <p className="text-sm font-bold">{Math.round(testResult.testResults.duration / 1000)}s</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Additional Metrics */}
                  <div className="text-xs space-y-1 bg-muted/20 p-2 rounded">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pages Scraped</span>
                      <span>{testResult.testResults.pagesScraped}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Errors</span>
                      <span className={testResult.testResults.errors.length > 0 ? "text-red-500 font-medium" : ""}>
                        {testResult.testResults.errors.length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Warnings</span>
                      <span className={testResult.testResults.warnings.length > 0 ? "text-yellow-600 font-medium" : ""}>
                        {testResult.testResults.warnings.length}
                      </span>
                    </div>
                  </div>

                  {/* Errors and Warnings */}
                  {testResult.testResults.errors.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-red-600">Errors</span>
                      <div className="space-y-1">
                        {testResult.testResults.errors.slice(0, 3).map((error, index) => (
                          <p key={index} className="text-xs bg-red-50 p-2 rounded border-l-2 border-red-200">
                            {error.length > 100 ? `${error.substring(0, 100)}...` : error}
                          </p>
                        ))}
                        {testResult.testResults.errors.length > 3 && (
                          <p className="text-xs text-muted-foreground italic">
                            +{testResult.testResults.errors.length - 3} more errors
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {testResult.testResults.warnings.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-yellow-600">Warnings</span>
                      <div className="space-y-1">
                        {testResult.testResults.warnings.slice(0, 2).map((warning, index) => (
                          <p key={index} className="text-xs bg-yellow-50 p-2 rounded border-l-2 border-yellow-200">
                            {warning.length > 100 ? `${warning.substring(0, 100)}...` : warning}
                          </p>
                        ))}
                        {testResult.testResults.warnings.length > 2 && (
                          <p className="text-xs text-muted-foreground italic">
                            +{testResult.testResults.warnings.length - 2} more warnings
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center h-56 space-y-3">
                <TestTube className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Ready to test</p>
                <p className="text-xs text-muted-foreground text-center px-4">
                  Select a municipality and click "Start Test"
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Component for phase testing
function PhaseTestContent({
  municipalities,
  selectedMunicipality,
  selectedMunicipalityId,
  setSelectedMunicipalityId,
  testOptions,
  setTestOptions,
  phaseResult,
  isLoading,
  onStartTest
}: {
  municipalities: Municipality[];
  selectedMunicipality: Municipality | undefined;
  selectedMunicipalityId: MunicipalityId | null;
  setSelectedMunicipalityId: (id: MunicipalityId | null) => void;
  testOptions: any;
  setTestOptions: (options: any) => void;
  phaseResult: PipelinePhaseResult | null;
  isLoading: boolean;
  onStartTest: () => void;
}) {
  const phaseIcons = {
    scraping: Database,
    extraction: FileText,
    analysis: BarChart3,
    complete: Workflow
  }

  const PhaseIcon = phaseIcons[testOptions.phase]

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Column 1 - Municipality & Phase Selection */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Phase Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Pipeline Phase</Label>
              <Select 
                value={testOptions.phase} 
                onValueChange={(value: 'scraping' | 'extraction' | 'analysis' | 'complete') => 
                  setTestOptions(prev => ({ ...prev, phase: value }))
                }
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scraping">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      Scraping Phase
                    </div>
                  </SelectItem>
                  <SelectItem value="extraction">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Extraction Phase
                    </div>
                  </SelectItem>
                  <SelectItem value="analysis">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Analysis Phase
                    </div>
                  </SelectItem>
                  <SelectItem value="complete">
                    <div className="flex items-center gap-2">
                      <Workflow className="h-4 w-4" />
                      Complete Pipeline
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="municipality" className="text-sm font-medium">Select Municipality</Label>
              <Select 
                value={selectedMunicipalityId?.toString() || ""} 
                onValueChange={(value) => setSelectedMunicipalityId(parseInt(value) as MunicipalityId)}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Choose municipality..." />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-48">
                    {municipalities.map((municipality) => (
                      <SelectItem key={municipality.id} value={municipality.id.toString()}>
                        <div className="flex items-center justify-between w-full pr-2">
                          <span className="truncate">{municipality.name}</span>
                          <Badge variant="outline" className="text-xs px-1.5 ml-2">
                            {municipality.province}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Execution Mode</Label>
              <Select 
                value={testOptions.testMode} 
                onValueChange={(value: 'test' | 'production') => 
                  setTestOptions(prev => ({ ...prev, testMode: value }))
                }
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test Mode (Safe)</SelectItem>
                  <SelectItem value="production">Production Mode (Full)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Column 2 - Phase Info */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <PhaseIcon className="h-4 w-4" />
              Phase Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">Phase</span>
              <div className="flex items-center gap-2">
                <PhaseIcon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium capitalize">{testOptions.phase} Phase</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">Description</span>
              <p className="text-xs leading-relaxed">
                {testOptions.phase === 'scraping' && 'Discover and download documents from municipality websites'}
                {testOptions.phase === 'extraction' && 'Extract text content from downloaded PDF documents'}
                {testOptions.phase === 'analysis' && 'Analyze document content and generate insights'}
                {testOptions.phase === 'complete' && 'Run all pipeline phases sequentially'}
              </p>
            </div>

            {selectedMunicipality && (
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground">Target Municipality</span>
                <div className="p-2 bg-muted/30 rounded">
                  <div className="text-sm font-medium">{selectedMunicipality.name}</div>
                  <div className="text-xs text-muted-foreground">{selectedMunicipality.province}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Column 3 - Phase Results */}
      <div className="space-y-4">
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Phase Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-56 space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">Running {testOptions.phase} phase...</p>
                <p className="text-xs text-muted-foreground text-center px-4">
                  Testing against {selectedMunicipality?.name}
                </p>
              </div>
            ) : phaseResult ? (
              <ScrollArea className="h-56">
                <div className="space-y-3 pr-2">
                  {/* Phase Status */}
                  <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                    {phaseResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">
                      {phaseResult.success ? 'Phase Completed' : 'Phase Failed'}
                    </span>
                  </div>

                  {/* Phase Metrics */}
                  <div className="text-xs space-y-1 bg-muted/20 p-2 rounded">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phase</span>
                      <span className="capitalize">{phaseResult.phase}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration</span>
                      <span>{Math.round(phaseResult.duration / 1000)}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Progress Reports</span>
                      <span>{phaseResult.progressReports.length}</span>
                    </div>
                  </div>

                  {/* Errors and Warnings */}
                  {phaseResult.errors.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-red-600">Errors</span>
                      <div className="space-y-1">
                        {phaseResult.errors.slice(0, 3).map((error, index) => (
                          <p key={index} className="text-xs bg-red-50 p-2 rounded border-l-2 border-red-200">
                            {error.length > 100 ? `${error.substring(0, 100)}...` : error}
                          </p>
                        ))}
                        {phaseResult.errors.length > 3 && (
                          <p className="text-xs text-muted-foreground italic">
                            +{phaseResult.errors.length - 3} more errors
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {phaseResult.warnings.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-yellow-600">Warnings</span>
                      <div className="space-y-1">
                        {phaseResult.warnings.slice(0, 2).map((warning, index) => (
                          <p key={index} className="text-xs bg-yellow-50 p-2 rounded border-l-2 border-yellow-200">
                            {warning.length > 100 ? `${warning.substring(0, 100)}...` : warning}
                          </p>
                        ))}
                        {phaseResult.warnings.length > 2 && (
                          <p className="text-xs text-muted-foreground italic">
                            +{phaseResult.warnings.length - 2} more warnings
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center h-56 space-y-3">
                <PhaseIcon className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Ready to test phase</p>
                <p className="text-xs text-muted-foreground text-center px-4">
                  Select municipality and phase, then click "Start Test"
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}