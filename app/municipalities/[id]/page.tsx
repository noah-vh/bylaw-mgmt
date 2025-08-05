"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft, 
  Building2, 
  Globe, 
  Calendar, 
  Download, 
  FileText, 
  Settings,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  Edit,
  Trash2,
  Eye,
  Save,
  X,
  Star,
  MoreHorizontal,
  FileCheck,
  FileX
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { format } from "date-fns"
import type { Municipality, PdfDocument, MunicipalityStatus, ScheduleFrequency } from "@/types/database"
import { createDocumentId } from "@/types/database"
import { DocumentViewer } from "@/components/document-viewer"
import { useToggleDocumentFavorite } from "@/hooks/use-documents"

interface MunicipalityDetailData {
  municipality: Municipality & {
    totalDocuments?: number
    relevantDocuments?: number
    lastScrape?: {
      date: string
      status: string
      documentsFound: number
      documentsNew?: number
    } | null
  }
  documents: PdfDocument[]
  stats: {
    totalDocuments: number
    relevantDocuments: number
    lastScrapeDate: string | null
    successRate: number
  }
  scrapeHistory: {
    id: number
    scrape_date: string
    status: string
    documents_found: number
    documents_new: number
    error_message?: string
    duration?: number
  }[]
}

export default function MunicipalityDetailPage() {
  const params = useParams()
  const municipalityId = params.id as string
  
  const [data, setData] = useState<MunicipalityDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [documentsSearch, setDocumentsSearch] = useState("")
  const [documentsFilter, setDocumentsFilter] = useState<string>("all")
  const [selectedDocument, setSelectedDocument] = useState<(PdfDocument & { municipality?: { name: string } }) | null>(null)
  
  // Settings state
  const [isEditing, setIsEditing] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    website_url: "",
    scraper_name: "",
    schedule_frequency: "none",
    schedule_active: false,
    status: "pending" as MunicipalityStatus
  })
  const [settingsSaving, setSettingsSaving] = useState(false)
  
  // Scraping state
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [currentJob, setCurrentJob] = useState<any>(null)
  
  // Dialog states
  const [selectedDocuments, setSelectedDocuments] = useState<number[]>([])
  const [showSelectionMode, setShowSelectionMode] = useState(false)
  
  // Ref to track SSE connection
  const sseRef = useRef<EventSource | null>(null)
  const [hasInitialized, setHasInitialized] = useState(false)
  
  // Simple processing state for button logic only
  const [isProcessingState, setIsProcessingState] = useState(false)
  const isMunicipalityProcessing = useCallback(() => isProcessingState, [isProcessingState])
  
  // Hook for toggling favorites
  const toggleFavoriteMutation = useToggleDocumentFavorite()

  useEffect(() => {
    const fetchMunicipalityDetail = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/municipalities/${municipalityId}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch municipality: ${response.statusText}`)
        }
        const result = await response.json()
        setData(result.data)
        
        // Populate settings form
        const municipality = result.data.municipality
        setSettingsForm({
          name: municipality.name || "",
          website_url: municipality.website_url || "",
          scraper_name: municipality.scraper_name || "",
          schedule_frequency: municipality.schedule_frequency || "none",
          schedule_active: municipality.schedule_active || false,
          status: municipality.status || "active"
        })
      } catch (error) {
        console.error('Error fetching municipality:', error)
        setError(error instanceof Error ? error.message : 'Failed to load municipality')
      } finally {
        setLoading(false)
      }
    }

    if (municipalityId) {
      fetchMunicipalityDetail()
    }
  }, [municipalityId])

  const handleSaveSettings = async () => {
    setSettingsSaving(true)
    try {
      // Convert "none" back to null for database storage
      const dataToSave = {
        ...settingsForm,
        schedule_frequency: settingsForm.schedule_frequency === "none" ? null : settingsForm.schedule_frequency as ScheduleFrequency | null
      }
      console.log('Saving settings:', dataToSave)
      const response = await fetch(`/api/municipalities/${municipalityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      })
      
      if (response.ok) {
        const result = await response.json()
        console.log('Settings saved successfully:', result)
        // Update the data with the new settings
        if (data) {
          setData({
            ...data,
            municipality: { ...data.municipality, ...result.data }
          })
        }
        setIsEditing(false)
        // Optionally show a success message
        alert('Settings saved successfully!')
      } else {
        const errorData = await response.json()
        console.error('Failed to save settings:', errorData)
        alert(`Failed to save settings: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      alert(`Error saving settings: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleCancelSettings = () => {
    if (data) {
      const municipality = data.municipality
      setSettingsForm({
        name: municipality.name || "",
        website_url: municipality.website_url || "",
        scraper_name: municipality.scraper_name || "",
        schedule_frequency: municipality.schedule_frequency || "none",
        schedule_active: municipality.schedule_active || false,
        status: municipality.status || "active"
      })
    }
    setIsEditing(false)
  }

  const handleToggleFavorite = async (documentId: number) => {
    try {
      await toggleFavoriteMutation.mutateAsync(createDocumentId(documentId))
      // Update local state to reflect the change
      if (data) {
        setData({
          ...data,
          documents: data.documents.map(doc => 
            doc.id === createDocumentId(documentId) 
              ? { ...doc, is_favorited: !doc.is_favorited }
              : doc
          )
        })
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }


  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="h-8 bg-muted rounded w-1/3 animate-pulse"></div>
          <div className="grid gap-6 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-8 bg-muted rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Error Loading Municipality</h1>
          <p className="text-muted-foreground mb-4">{error || 'Municipality not found'}</p>
          <Button asChild>
            <Link href="/municipalities">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Municipalities
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const { municipality, documents, stats, scrapeHistory } = data

  // Filter documents based on search and filter
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = !documentsSearch || 
      doc.title?.toLowerCase().includes(documentsSearch.toLowerCase()) ||
      doc.filename?.toLowerCase().includes(documentsSearch.toLowerCase())
    
    const matchesFilter = documentsFilter === "all" || 
      (documentsFilter === "relevant" && doc.is_adu_relevant) ||
      (documentsFilter === "not-relevant" && !doc.is_adu_relevant) ||
      (documentsFilter === "analyzed" && doc.content_analyzed) ||
      (documentsFilter === "not-analyzed" && !doc.content_analyzed)
    
    return matchesSearch && matchesFilter
  })

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" asChild>
          <Link href="/municipalities">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{municipality.name}</h1>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="h-4 w-4" />
              <a href={municipality.website_url} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                {municipality.website_url}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDocuments}</div>
            <p className="text-xs text-muted-foreground">Documents collected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Relevant Documents</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.relevantDocuments}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalDocuments > 0 ? Math.round((stats.relevantDocuments / stats.totalDocuments) * 100) : 0}% relevant
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Scrape</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {municipality.lastScrape ? format(new Date(municipality.lastScrape.date), 'MMM d') : 'Never'}
            </div>
            {municipality.lastScrape && (
              <p className="text-xs text-muted-foreground">
                {municipality.lastScrape.documentsFound} documents found
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.successRate}%</div>
            <p className="text-xs text-muted-foreground">Scraping success rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="documents" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-6">
          {/* Document Actions Bar */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <FileText className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    value={documentsSearch}
                    onChange={(e) => setDocumentsSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <Select value={documentsFilter} onValueChange={setDocumentsFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter documents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Documents</SelectItem>
                  <SelectItem value="relevant">Relevant Only</SelectItem>
                  <SelectItem value="not-relevant">Not Relevant</SelectItem>
                  <SelectItem value="analyzed">Analyzed</SelectItem>
                  <SelectItem value="not-analyzed">Not Analyzed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Documents Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Relevance</TableHead>
                    <TableHead>Date Found</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((document) => (
                    <TableRow key={document.id}>
                      <TableCell>
                        <div>
                          <button
                            onClick={() => setSelectedDocument({ ...document, municipality: { id: municipality.id, name: municipality.name } })}
                            className="font-medium text-left hover:text-primary transition-colors cursor-pointer"
                          >
                            {document.title || document.filename}
                          </button>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <span>{document.filename}</span>
                            {document.is_favorited && (
                              <Star className="h-3 w-3 text-favorite-active fill-favorite-active" />
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {/* Extraction Status */}
                          {document.extraction_status === 'completed' ? (
                            <Badge variant="default" className="text-xs">
                              <FileCheck className="h-3 w-3 mr-1" />
                              Extracted
                            </Badge>
                          ) : document.extraction_status === 'failed' ? (
                            <Badge variant="destructive" className="text-xs">
                              <FileX className="h-3 w-3 mr-1" />
                              Extract Failed
                            </Badge>
                          ) : document.extraction_status === 'processing' ? (
                            <Badge variant="secondary" className="text-xs animate-pulse">
                              <Clock className="h-3 w-3 mr-1" />
                              Extracting
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <FileText className="h-3 w-3 mr-1" />
                              Not Extracted
                            </Badge>
                          )}
                          {/* Analysis Status */}
                          {document.content_analyzed ? (
                            <Badge variant="default" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Analyzed
                            </Badge>
                          ) : document.analysis_status === 'failed' ? (
                            <Badge variant="destructive" className="text-xs">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Analysis Failed
                            </Badge>
                          ) : document.analysis_status === 'processing' ? (
                            <Badge variant="secondary" className="text-xs animate-pulse">
                              <Clock className="h-3 w-3 mr-1" />
                              Analyzing
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={document.is_adu_relevant ? "default" : "secondary"}>
                            {document.is_adu_relevant ? "Relevant" : "Not Relevant"}
                          </Badge>
                          {document.relevance_confidence && (
                            <span className="text-xs text-muted-foreground">
                              {Math.round(document.relevance_confidence * 100)}%
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {document.date_found ? format(new Date(document.date_found), 'MMM d, yyyy') : 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setSelectedDocument({ ...document, municipality: { id: municipality.id, name: municipality.name } })}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Document
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Relevance
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredDocuments.length === 0 && (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No documents found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        {/* Scraping History */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Scraping History</CardTitle>
              <CardDescription>Recent scraping activities and results</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Documents Found</TableHead>
                    <TableHead>New Documents</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scrapeHistory && scrapeHistory.length > 0 ? (
                    scrapeHistory.map((scrape) => (
                      <TableRow key={scrape.id}>
                        <TableCell>
                          {format(new Date(scrape.scrape_date), 'MMM d, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              scrape.status === 'success' ? 'default' :
                              scrape.status === 'error' ? 'destructive' :
                              scrape.status === 'running' ? 'secondary' :
                              'outline'
                            }
                          >
                            {scrape.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{scrape.documents_found || 0}</TableCell>
                        <TableCell>{scrape.documents_new || 0}</TableCell>
                        <TableCell>
                          {scrape.duration ? `${Math.round(scrape.duration / 1000)}s` : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {scrape.error_message && (
                            <div className="text-sm text-destructive max-w-xs truncate" title={scrape.error_message}>
                              {scrape.error_message}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No scraping history found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Municipality Settings</CardTitle>
                  <CardDescription>Configure municipality details and scraping settings</CardDescription>
                </div>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button variant="outline" onClick={handleCancelSettings} disabled={settingsSaving}>
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                      <Button onClick={handleSaveSettings} disabled={settingsSaving}>
                        {settingsSaving ? (
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Save Changes
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setIsEditing(true)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Settings
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Municipality Name</Label>
                    {isEditing ? (
                      <Input
                        id="name"
                        value={settingsForm.name}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter municipality name"
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">{municipality.name}</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website_url">Website URL</Label>
                    {isEditing ? (
                      <Input
                        id="website_url"
                        type="url"
                        value={settingsForm.website_url}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, website_url: e.target.value }))}
                        placeholder="https://example.com"
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        <a href={municipality.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {municipality.website_url}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    {isEditing ? (
                      <Select value={settingsForm.status} onValueChange={(value) => setSettingsForm(prev => ({ ...prev, status: value as MunicipalityStatus }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="testing">Testing</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="error">Error</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        <span className="text-sm text-muted-foreground">
                          Status: {municipality.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Statistics */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Statistics</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{stats.totalDocuments}</div>
                    <div className="text-sm text-muted-foreground">Total Documents</div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{stats.relevantDocuments}</div>
                    <div className="text-sm text-muted-foreground">Relevant Documents</div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{stats.successRate}%</div>
                    <div className="text-sm text-muted-foreground">Success Rate</div>
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Timeline</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Created</Label>
                    <div className="p-2 bg-muted rounded-md">
                      {municipality.created_at ? format(new Date(municipality.created_at), 'PPP') : 'Unknown'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Last Updated</Label>
                    <div className="p-2 bg-muted rounded-md">
                      {municipality.updated_at ? format(new Date(municipality.updated_at), 'PPP') : 'Never'}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {selectedDocument && (
        <DocumentViewer
          document={selectedDocument}
          open={!!selectedDocument}
          onOpenChange={(open) => !open && setSelectedDocument(null)}
          onToggleFavorite={handleToggleFavorite}
        />
      )}
    </div>
  )
}