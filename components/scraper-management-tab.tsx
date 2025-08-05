"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScraperStatus } from "@/components/scraper-status"
import { TestScraperDialog } from "@/components/test-scraper-dialog"
import { useFilesystemScraperManagement, type FilesystemScraper } from "@/hooks/use-filesystem-scrapers"
import { useUpdateMunicipality } from "@/hooks/use-municipalities"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"
import type { Municipality, ScraperInfo } from "@/types/database"
import { 
  Server, 
  Search, 
  TestTube, 
  Calendar, 
  FileText,
  AlertCircle,
  CheckCircle2,
  Activity,
  Settings,
  ExternalLink,
  HardDrive,
  Code,
  Zap,
  Clock,
} from "lucide-react"

interface ScraperManagementTabProps {
  scrapers: ScraperInfo[]
  municipalities: Municipality[]
  isLoading: boolean
  error: Error | null
}

type ScraperVersion = 'all' | 'v1' | 'v2' | 'enhanced'
type ScraperFilter = 'all' | 'available' | 'busy' | 'offline' | 'error'
type AssignmentFilter = 'all' | 'assigned' | 'unassigned'

export function ScraperManagementTab({ 
  scrapers, 
  municipalities, 
  isLoading, 
  error 
}: ScraperManagementTabProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [versionFilter, setVersionFilter] = useState<ScraperVersion>('all')
  const [statusFilter, setStatusFilter] = useState<ScraperFilter>('all')
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all')
  const [testingScrapers, setTestingScrapers] = useState<Set<string>>(new Set())
  const [testDialogOpen, setTestDialogOpen] = useState(false)
  const [selectedScraperForTest, setSelectedScraperForTest] = useState<FilesystemScraper | null>(null)
  const [assigningScrapers, setAssigningScrapers] = useState<Set<string>>(new Set())

  // Municipality update mutation for scraper assignment
  const updateMunicipality = useUpdateMunicipality()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Get filesystem scrapers ONLY
  const filesystemScrapers = useFilesystemScraperManagement()

  // Use ONLY filesystem scrapers
  const allScrapers = useMemo(() => {
    return (filesystemScrapers.scrapers || []).map(scraper => {
      // Find municipalities that have this scraper assigned
      const assignedMunicipalities = municipalities.filter(m => 
        Array.isArray(m.assigned_scrapers) && m.assigned_scrapers.includes(scraper.name)
      )
      const activeMunicipality = assignedMunicipalities.find(m => m.active_scraper === scraper.name)
      const primaryMunicipality = activeMunicipality || assignedMunicipalities[0]
      
      return {
        name: scraper.name,
        displayName: scraper.displayName,
        status: 'available' as const,
        municipalityId: primaryMunicipality?.id || null,
        lastRun: null,
        nextRun: null,
        isActive: true,
        description: scraper.description,
        capabilities: scraper.capabilities,
        version: 'filesystem' as const,
        successRate: 0, // Unknown for filesystem scrapers
        lastTestDate: scraper.lastModified ? new Date(scraper.lastModified) : null,
        estimatedPages: scraper.estimatedPages,
        estimatedDocuments: scraper.estimatedDocuments,
        municipality: primaryMunicipality, // Use primary municipality
        documentCount: scraper.estimatedDocuments || 0,
        source: 'filesystem' as const,
        fileSize: scraper.fileSize,
        filePath: scraper.filePath,
        metadata: scraper.metadata,
        assignedMunicipalities // Add this for debugging
      }
    })
  }, [municipalities, filesystemScrapers.scrapers])

  // Filter scrapers based on search and filters
  const filteredScrapers = useMemo(() => {
    return allScrapers.filter(scraper => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const matches = 
          scraper.name.toLowerCase().includes(searchLower) ||
          scraper.displayName.toLowerCase().includes(searchLower) ||
          scraper.municipality?.name.toLowerCase().includes(searchLower) ||
          scraper.description?.toLowerCase().includes(searchLower)
        if (!matches) return false
      }
      
      // Skip version filter - show all scrapers
      
      // All filesystem scrapers are available
      if (statusFilter !== 'all' && statusFilter !== 'available') {
        return false
      }
      
      // Assignment filter
      if (assignmentFilter !== 'all') {
        const isAssigned = scraper.assignedMunicipalities && scraper.assignedMunicipalities.length > 0
        if (assignmentFilter === 'assigned' && !isAssigned) {
          return false
        }
        if (assignmentFilter === 'unassigned' && isAssigned) {
          return false
        }
      }
      
      return true
    })
  }, [allScrapers, searchTerm, versionFilter, statusFilter, assignmentFilter])

  // Statistics for filesystem scrapers only
  const stats = useMemo(() => {
    const total = allScrapers.length
    const assigned = allScrapers.filter(s => s.assignedMunicipalities && s.assignedMunicipalities.length > 0).length
    const unassigned = total - assigned
    
    const byStatus = {
      available: total, // All filesystem scrapers are available
      busy: 0,
      offline: 0,
      error: 0,
    }
    const byVersion = {
      filesystem: allScrapers.length,
    }
    const byAssignment = {
      assigned,
      unassigned
    }
    
    const totalDocuments = allScrapers.reduce((sum, s) => sum + (s.documentCount || 0), 0)
    
    return { total, byStatus, byVersion, byAssignment, totalDocuments }
  }, [allScrapers])

  // Handle adding/removing scraper from municipality's assigned list
  const handleScraperToggle = async (scraperName: string, municipalityId: number, isAssigned: boolean) => {
    const municipality = municipalities.find(m => m.id === municipalityId)
    if (!municipality) return

    console.log(`Toggle ${scraperName} for ${municipality.name}: ${isAssigned ? 'ASSIGN' : 'UNASSIGN'}`)
    console.log('Current assigned:', municipality.assigned_scrapers)
    console.log('Municipality object:', municipality)

    setAssigningScrapers(prev => new Set([...prev, scraperName]))
    
    try {
      const currentAssigned = municipality.assigned_scrapers || []
      let newAssigned: string[]
      let updateData: any

      if (isAssigned) {
        // Add scraper to assigned list
        newAssigned = [...currentAssigned, scraperName]
        updateData = { assigned_scrapers: newAssigned }
      } else {
        // Remove scraper from assigned list
        newAssigned = currentAssigned.filter(s => s !== scraperName)
        updateData = { assigned_scrapers: newAssigned }
        
        // If removing the active scraper, clear it
        if (municipality.active_scraper === scraperName) {
          updateData.active_scraper = null
        }
      }

      console.log('Updating with data:', updateData)
      console.log('New assigned scrapers will be:', newAssigned)
      console.log('Making API call to:', `/api/municipalities/${municipality.id}`)

      const result = await updateMunicipality.mutateAsync({
        id: municipality.id as any,
        data: updateData
      })
      
      console.log('Mutation completed successfully. Result:', result)
      console.log('Updated municipality assigned_scrapers:', result.data?.assigned_scrapers)
      
      toast({
        title: isAssigned ? "Scraper Assigned" : "Scraper Unassigned",
        description: isAssigned 
          ? `Added ${scraperName} to ${municipality.name}`
          : `Removed ${scraperName} from ${municipality.name}`,
      })
      
      // Force refetch of municipalities data (but don't refetch immediately to let optimistic update work)
      queryClient.invalidateQueries({ queryKey: ['municipalities'] })
      queryClient.invalidateQueries({ queryKey: ['municipalities', 'list'] })
      
      // Optimistically update the cache for immediate UI response
      // Update both possible query patterns
      queryClient.setQueriesData(
        { queryKey: ['municipalities'] },
        (oldData: any) => {
          if (!oldData) return oldData
          
          // Handle both direct array and paginated response structure
          if (Array.isArray(oldData)) {
            return oldData.map((m: any) => {
              if (m.id === municipality.id) {
                return {
                  ...m,
                  assigned_scrapers: newAssigned,
                  ...(updateData.active_scraper !== undefined && { active_scraper: updateData.active_scraper })
                }
              }
              return m
            })
          } else if (oldData.data && Array.isArray(oldData.data)) {
            const updatedMunicipalities = oldData.data.map((m: any) => {
              if (m.id === municipality.id) {
                return {
                  ...m,
                  assigned_scrapers: newAssigned,
                  ...(updateData.active_scraper !== undefined && { active_scraper: updateData.active_scraper })
                }
              }
              return m
            })
            
            return {
              ...oldData,
              data: updatedMunicipalities
            }
          }
          
          return oldData
        }
      )
      
      // Also update the list query pattern
      queryClient.setQueriesData(
        { queryKey: ['municipalities', 'list'] },
        (oldData: any) => {
          if (!oldData) return oldData
          
          // Handle both direct array and paginated response structure
          if (Array.isArray(oldData)) {
            return oldData.map((m: any) => {
              if (m.id === municipality.id) {
                return {
                  ...m,
                  assigned_scrapers: newAssigned,
                  ...(updateData.active_scraper !== undefined && { active_scraper: updateData.active_scraper })
                }
              }
              return m
            })
          } else if (oldData.data && Array.isArray(oldData.data)) {
            const updatedMunicipalities = oldData.data.map((m: any) => {
              if (m.id === municipality.id) {
                return {
                  ...m,
                  assigned_scrapers: newAssigned,
                  ...(updateData.active_scraper !== undefined && { active_scraper: updateData.active_scraper })
                }
              }
              return m
            })
            
            return {
              ...oldData,
              data: updatedMunicipalities
            }
          }
          
          return oldData
        }
      )
    } catch (error) {
      console.error('Assignment error:', error)
      toast({
        title: "Assignment Failed",
        description: `Failed to ${isAssigned ? 'assign' : 'unassign'} ${scraperName}`,
        variant: "destructive"
      })
    }
    
    setAssigningScrapers(prev => {
      const next = new Set(prev)
      next.delete(scraperName)
      return next
    })
  }

  const handleTestScraper = (scraper: any) => {
    // Open test dialog with the scraper
    const fscraper: FilesystemScraper = {
      name: scraper.name,
      displayName: scraper.displayName,
      filePath: scraper.filePath || `${scraper.name}.py`,
      version: scraper.version,
      description: scraper.description,
      estimatedPages: scraper.estimatedPages,
      estimatedDocuments: scraper.estimatedDocuments,
      fileSize: scraper.fileSize,
      lastModified: scraper.lastTestDate?.toISOString(),
      capabilities: scraper.capabilities || ['scrape', 'download', 'extract'],
      metadata: scraper.metadata || {}
    }
    setSelectedScraperForTest(fscraper)
    setTestDialogOpen(true)
  }


  const getSuccessRateBadge = (rate: number) => {
    if (rate >= 95) return <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">Excellent</Badge>
    if (rate >= 90) return <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50">Good</Badge>
    if (rate >= 80) return <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">Fair</Badge>
    return <Badge variant="destructive">Poor</Badge>
  }

  if (isLoading || filesystemScrapers.isLoading) {
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

  if (error || filesystemScrapers.error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mr-2" />
            <p>Failed to load scrapers: {error?.message || filesystemScrapers.error?.message}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Scrapers</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <Server className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Assigned</p>
              <p className="text-2xl font-bold">{stats.byAssignment.assigned}</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Available</p>
              <p className="text-2xl font-bold">{stats.byStatus.available}</p>
            </div>
            <Code className="h-5 w-5 text-green-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Filesystem</p>
              <p className="text-2xl font-bold">{stats.byVersion.filesystem}</p>
            </div>
            <Zap className="h-5 w-5 text-blue-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Est. Documents</p>
              <p className="text-2xl font-bold">{stats.totalDocuments}</p>
            </div>
            <FileText className="h-5 w-5 text-amber-500" />
          </div>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Scraper Management - All Sources ({stats.total} scrapers found)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search scrapers, municipalities, or descriptions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={(value: ScraperFilter) => setStatusFilter(value)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assignmentFilter} onValueChange={(value: AssignmentFilter) => setAssignmentFilter(value)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Assignment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scrapers</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Scrapers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredScrapers.map((scraper) => {
              const isTesting = testingScrapers.has(scraper.name)
              
              return (
                <Card key={`${scraper.source}-${scraper.name}`} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{scraper.name}</CardTitle>
                          {scraper.source === 'filesystem' && (
                            <Badge variant="secondary" className="text-xs">
                              <HardDrive className="h-3 w-3 mr-1" />
                              FS
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">
                          {scraper.name}
                        </p>
                        {scraper.filePath && (
                          <p className="text-xs text-muted-foreground">
                            {scraper.filePath}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {scraper.source === 'database' && (
                          <ScraperStatus status={scraper.status} compact />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-3">
                      {/* Municipality Assignment */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Assign to Municipality:</span>
                          <Badge variant="secondary" className="text-xs">
                            {municipalities.filter(m => Array.isArray(m.assigned_scrapers) && m.assigned_scrapers.includes(scraper.name)).length} assigned
                          </Badge>
                        </div>
                        
                        {(() => {
                          // Find the primary municipality (active one, or first assigned)
                          const assignedMunicipalities = municipalities.filter(m => 
                            Array.isArray(m.assigned_scrapers) && m.assigned_scrapers.includes(scraper.name)
                          )
                          const activeMunicipality = assignedMunicipalities.find(m => m.active_scraper === scraper.name)
                          const primaryMunicipality = activeMunicipality || assignedMunicipalities[0]
                          
                          // Debug logging
                          if (assignedMunicipalities.length > 0) {
                            console.log(`Scraper ${scraper.name}:`, {
                              assignedMunicipalities: assignedMunicipalities.map(m => ({ id: m.id, name: m.name, assigned_scrapers: m.assigned_scrapers })),
                              activeMunicipality: activeMunicipality ? { id: activeMunicipality.id, name: activeMunicipality.name } : null,
                              primaryMunicipality: primaryMunicipality ? { id: primaryMunicipality.id, name: primaryMunicipality.name } : null,
                              dropdownValue: primaryMunicipality?.id.toString() || "none"
                            })
                          }
                          
                          return (
                            <Select
                              value={primaryMunicipality?.id.toString() || "none"}
                              onValueChange={(municipalityId) => {
                                if (municipalityId === "none") return
                                
                                // Handle unassign all
                                if (municipalityId === "unassign") {
                                  // Unassign from all municipalities that currently have this scraper
                                  municipalities
                                    .filter(m => Array.isArray(m.assigned_scrapers) && m.assigned_scrapers.includes(scraper.name))
                                    .forEach(municipality => {
                                      handleScraperToggle(scraper.name, municipality.id, false)
                                    })
                                  return
                                }
                                
                                const municipality = municipalities.find(m => m.id.toString() === municipalityId)
                                if (municipality) {
                                  const isCurrentlyAssigned = Array.isArray(municipality.assigned_scrapers) && 
                                    municipality.assigned_scrapers.includes(scraper.name)
                                  
                                  // Only assign if not already assigned
                                  if (!isCurrentlyAssigned) {
                                    handleScraperToggle(scraper.name, municipality.id, true)
                                  }
                                }
                              }}
                              disabled={assigningScrapers.has(scraper.name)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select municipality to assign..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px]">
                                <SelectItem value="none">
                                  <span className="text-muted-foreground">No assignment</span>
                                </SelectItem>
                                {/* Show unassign option for currently assigned municipalities */}
                                {municipalities
                                  .filter(m => Array.isArray(m.assigned_scrapers) && m.assigned_scrapers.includes(scraper.name))
                                  .length > 0 && (
                                  <SelectItem value="unassign" className="text-red-600">
                                    ❌ Unassign from all municipalities
                                  </SelectItem>
                                )}
                                {municipalities
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .map(municipality => {
                                    const isAssigned = Array.isArray(municipality.assigned_scrapers) && 
                                      municipality.assigned_scrapers.includes(scraper.name)
                                    const isActive = municipality.active_scraper === scraper.name
                                    
                                    return (
                                      <SelectItem key={municipality.id} value={municipality.id.toString()}>
                                        <div className="flex items-center justify-between w-full">
                                          <span>{municipality.name}</span>
                                          <div className="flex items-center space-x-1 ml-2">
                                            {isActive && (
                                              <Badge variant="outline" className="text-xs">Active</Badge>
                                            )}
                                            {isAssigned && !isActive && (
                                              <Badge variant="secondary" className="text-xs">Assigned</Badge>
                                            )}
                                            {!isAssigned && (
                                              <span className="text-xs text-muted-foreground">Click to assign</span>
                                            )}
                                          </div>
                                        </div>
                                      </SelectItem>
                                    )
                                  })}
                              </SelectContent>
                            </Select>
                          )
                        })()}
                        
                        {/* Show currently assigned municipalities */}
                        {municipalities.filter(m => Array.isArray(m.assigned_scrapers) && m.assigned_scrapers.includes(scraper.name)).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {municipalities
                              .filter(m => Array.isArray(m.assigned_scrapers) && m.assigned_scrapers.includes(scraper.name))
                              .map(municipality => (
                                <Badge 
                                  key={municipality.id} 
                                  variant={municipality.active_scraper === scraper.name ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {municipality.name}
                                  {municipality.active_scraper === scraper.name && " (Active)"}
                                </Badge>
                              ))}
                          </div>
                        )}
                        
                        {assigningScrapers.has(scraper.name) && (
                          <p className="text-xs text-muted-foreground">Updating assignment...</p>
                        )}
                      </div>

                      {/* Success Rate (only for database scrapers) */}
                      {scraper.source === 'database' && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Success Rate:</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{scraper.successRate}%</span>
                            {getSuccessRateBadge(scraper.successRate)}
                          </div>
                        </div>
                      )}

                      {/* Document Count or File Info */}
                      {scraper.source === 'database' ? (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Documents:</span>
                          <span className="text-sm font-mono">{scraper.documentCount.toLocaleString()}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">File Size:</span>
                          <span className="text-sm font-mono">
                            {scraper.fileSize ? `${Math.round(scraper.fileSize / 1024)} KB` : 'Unknown'}
                          </span>
                        </div>
                      )}

                      {/* Estimated Documents for filesystem scrapers */}
                      {scraper.source === 'filesystem' && scraper.estimatedDocuments && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Est. Documents:</span>
                          <span className="text-sm font-mono">{scraper.estimatedDocuments.toLocaleString()}</span>
                        </div>
                      )}

                      {/* Last Modified/Test Date */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {scraper.source === 'filesystem' ? 'Last Modified:' : 'Last Test:'}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {scraper.lastTestDate ? (
                            scraper.lastTestDate.toLocaleDateString()
                          ) : (
                            'Never'
                          )}
                        </span>
                      </div>

                      {/* Capabilities */}
                      {scraper.capabilities && scraper.capabilities.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-sm font-medium">Capabilities:</span>
                          <div className="flex flex-wrap gap-1">
                            {scraper.capabilities.map(cap => (
                              <Badge key={cap} variant="outline" className="text-xs">
                                {cap}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTestScraper(scraper)}
                          disabled={isTesting || (scraper.source === 'database' && scraper.status === 'offline')}
                          className="flex-1"
                        >
                          {isTesting ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-2" />
                              Testing...
                            </>
                          ) : (
                            <>
                              <TestTube className="h-3 w-3 mr-2" />
                              Test
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="px-2"
                        >
                          <Settings className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {filteredScrapers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No scrapers found matching your criteria</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Dialog */}
      <TestScraperDialog
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
        scraper={selectedScraperForTest}
        municipalities={municipalities}
      />
    </div>
  )
}