"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import { 
  FileText, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Eye, 
  Download, 
  Star, 
  StarOff,
  Building2, 
  Calendar, 
  SortAsc,
  SortDesc,
  Grid3x3,
  List,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
  Share2,
  FileText as FileTextIcon,
  Cpu as ProcessorIcon,
  XCircle,
  Loader2,
  Play,
  Settings,
  Brain,
  Zap
} from "lucide-react"
import { DocumentViewer } from "@/components/document-viewer"
import { SearchResultHighlights } from "@/components/search-result-highlights"
import { RelevanceScoreBadge } from "@/components/relevance-score-badge"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import { 
  useDocumentSearch, 
  useToggleDocumentFavorite
} from "@/hooks/use-documents"
import { useMunicipalities } from "@/hooks/use-municipalities"
import { format } from "date-fns"
import type { PdfDocument, DownloadStatus, ExtractionStatus, AnalysisStatus, DocumentSearchParams, DocumentId, createDocumentId } from "@/types/database"
import { ProcessingStatusBadge } from "@/components/processing-status"
import { DocumentPipelineStatus } from "@/components/document-pipeline-status"

export default function DocumentsPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table')
  const [selectedDocuments, setSelectedDocuments] = useState<DocumentId[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<(PdfDocument & { municipality?: { name: string } }) | null>(null)
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'failed'>('all')
  
  const {
    data,
    isLoading,
    error,
    searchParams,
    setSearch,
    setSearchType,
    setMunicipality,
    setRelevanceFilter,
    setAnalyzedFilter,
    setFavoritesFilter,
    setPage,
    setLimit,
    setSorting,
    refetch
  } = useDocumentSearch('', 'fulltext')
  
  // Ensure search type is always fulltext
  React.useEffect(() => {
    console.log('Documents page search params:', searchParams)
    if (searchParams.searchType !== 'fulltext') {
      console.log('Setting search type to fulltext from:', searchParams.searchType)
      setSearchType('fulltext')
    }
  }, [searchParams.searchType, setSearchType])
  
  // Debug search changes
  React.useEffect(() => {
    if (searchParams.search) {
      console.log('Documents page searching for:', searchParams.search, 'with type:', searchParams.searchType)
    }
  }, [searchParams.search, searchParams.searchType])
  
  const searchType = 'fulltext'
  
  // Apply pipeline filter by updating search params when filter changes
  React.useEffect(() => {
    // Don't auto-update if user hasn't set a pipeline filter
    if (pipelineFilter === 'all') return
    
    // Update search params based on pipeline filter without triggering re-renders
    const params: Partial<DocumentSearchParams> = {}
    
    switch (pipelineFilter) {
      case 'pending':
        // Create new object with readonly properties for pending status
        Object.assign(params, { downloadStatus: 'pending' as const })
        break
      case 'processing':
        // Show documents currently being processed
        Object.assign(params, { downloadStatus: 'downloading' as const })
        break
      case 'completed':
        // Show fully processed documents
        Object.assign(params, { 
          downloadStatus: 'downloaded' as const,
          extractionStatus: 'completed' as const,
          analysisStatus: 'completed' as const
        })
        break
      case 'failed':
        // This would need custom handling in the API
        Object.assign(params, { downloadStatus: 'error' as const })
        break
    }
    
    // Apply the filter (this would require extending the updateSearch method)
    console.log('Pipeline filter applied:', pipelineFilter, params)
  }, [pipelineFilter])

  const { data: municipalitiesData } = useMunicipalities({ limit: 100 })
  const toggleFavoriteMutation = useToggleDocumentFavorite()

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedDocuments(data?.data.map(d => d.id) || [])
    } else {
      setSelectedDocuments([])
    }
  }

  const handleSelectDocument = (id: DocumentId, checked: boolean) => {
    if (checked) {
      setSelectedDocuments(prev => [...prev, id])
    } else {
      setSelectedDocuments(prev => prev.filter(selectedId => selectedId !== id))
    }
  }

  const handleToggleFavorite = async (documentId: DocumentId) => {
    try {
      await toggleFavoriteMutation.mutateAsync(documentId)
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }
  
  const handleBulkProcessing = async (type: 'extraction' | 'analysis') => {
    if (selectedDocuments.length === 0) return
    
    console.log(`Bulk ${type} requested for ${selectedDocuments.length} documents`)
    // Placeholder functionality - processing hook has been removed
    // In a real implementation, this would trigger the appropriate processing pipeline
    
    // Clear selection after starting processing
    setSelectedDocuments([])
    // Refresh data to show updated processing status
    setTimeout(() => refetch(), 1000)
  }
  
  const handleDocumentProcessing = useCallback(async (documentId: DocumentId, stage: 'download' | 'extract' | 'analyze') => {
    console.log(`Processing request for document ${documentId}, stage: ${stage}`)
    // Placeholder functionality - processing hook has been removed
    // In a real implementation, this would trigger the appropriate processing pipeline
    
    // Refresh data to show updated processing status
    setTimeout(() => refetch(), 1000)
  }, [refetch])


  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Error Loading Documents</h1>
          <p className="text-muted-foreground mb-4">{error.message}</p>
          <Button onClick={() => refetch()}>Try Again</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Bylaw Documents</h1>
          <p className="text-muted-foreground">
            Browse, search, and access municipal bylaw documents
          </p>
        </div>
        <div className="flex gap-2">
          <BulkProcessingControls 
            selectedDocuments={selectedDocuments}
            onBulkExtract={() => handleBulkProcessing('extraction')}
            onBulkAnalyze={() => handleBulkProcessing('analysis')}
          />
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search document titles and content..."
                value={searchParams.search || ''}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger className="inline-flex items-center justify-between w-48 h-10 px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
              {searchParams.municipalityId 
                ? municipalitiesData?.data?.find(m => m.id === searchParams.municipalityId)?.name || 'Select municipality'
                : 'All Municipalities'}
              <Building2 className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" sideOffset={5}>
              <div className="sticky top-0 p-2 bg-background">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search municipalities..."
                    className="pl-8 h-8"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const searchValue = e.target.value.toLowerCase()
                      const items = document.querySelectorAll('[data-municipality-name]')
                      items.forEach(item => {
                        const name = item.getAttribute('data-municipality-name')?.toLowerCase() || ''
                        if (name.includes(searchValue)) {
                          (item as HTMLElement).style.display = ''
                        } else {
                          (item as HTMLElement).style.display = 'none'
                        }
                      })
                    }}
                  />
                </div>
              </div>
              <DropdownMenuSeparator />
              <div className="max-h-[300px] overflow-y-auto">
                <DropdownMenuItem 
                  onSelect={() => setMunicipality(undefined)}
                  className="cursor-pointer"
                >
                  All Municipalities
                </DropdownMenuItem>
                {municipalitiesData?.data?.map((municipality) => (
                  <DropdownMenuItem 
                    key={municipality.id}
                    onSelect={() => setMunicipality(municipality.id)}
                    data-municipality-name={municipality.name}
                    className="cursor-pointer"
                  >
                    {municipality.name}
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-10 px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Document Filters</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={searchParams.isAduRelevant === true}
                onCheckedChange={(checked) => setRelevanceFilter(checked || undefined)}
              >
                ADU Relevant Only
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={searchParams.isAnalyzed === true}
                onCheckedChange={(checked) => setAnalyzedFilter(checked || undefined)}
              >
                Analyzed Only
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={searchParams.isFavorited === true}
                onCheckedChange={(checked) => setFavoritesFilter(checked || undefined)}
              >
                Favorites Only
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Pipeline Status</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={pipelineFilter === 'pending'}
                onCheckedChange={(checked) => setPipelineFilter(checked ? 'pending' : 'all')}
              >
                Pending Processing
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={pipelineFilter === 'processing'}
                onCheckedChange={(checked) => setPipelineFilter(checked ? 'processing' : 'all')}
              >
                Currently Processing
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={pipelineFilter === 'completed'}
                onCheckedChange={(checked) => setPipelineFilter(checked ? 'completed' : 'all')}
              >
                Fully Processed
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={pipelineFilter === 'failed'}
                onCheckedChange={(checked) => setPipelineFilter(checked ? 'failed' : 'all')}
              >
                Processing Failed
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-10 px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
              {searchParams.order === 'desc' ? <SortDesc className="mr-2 h-4 w-4" /> : <SortAsc className="mr-2 h-4 w-4" />}
              Sort
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort By</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSorting('date_found', 'desc')} className="cursor-pointer">
                Date Found (Newest)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSorting('date_found', 'asc')} className="cursor-pointer">
                Date Found (Oldest)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSorting('title', 'asc')} className="cursor-pointer">
                Title (A-Z)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSorting('title', 'desc')} className="cursor-pointer">
                Title (Z-A)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSorting('relevance_confidence', 'desc')} className="cursor-pointer">
                Relevance Score
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex gap-1">
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('table')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>


      {/* Content */}
      {viewMode === 'table' ? (
        <DocumentTableView
          key={`table-${searchParams.municipalityId || 'all'}`}
          data={data}
          isLoading={isLoading}
          selectedDocuments={selectedDocuments}
          searchParams={searchParams}
          setSorting={setSorting}
          onSelectAll={handleSelectAll}
          onSelectDocument={handleSelectDocument}
          onToggleFavorite={handleToggleFavorite}
          onOpenDocument={setSelectedDocument}
          onReprocess={handleDocumentProcessing}
        />
      ) : (
        <DocumentGridView
          key={`grid-${searchParams.municipalityId || 'all'}`}
          data={data}
          isLoading={isLoading}
          onToggleFavorite={handleToggleFavorite}
          onOpenDocument={setSelectedDocument}
        />
      )}

      {/* Pagination */}
      {data?.pagination && (
        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Showing {((data.pagination.page - 1) * data.pagination.limit) + 1} to{' '}
              {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
              {data.pagination.total} documents
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="per-page" className="text-sm text-muted-foreground">
                Per page:
              </Label>
              <Select
                value={data.pagination.limit.toString()}
                onValueChange={(value) => {
                  setPage(1) // Reset to first page when changing limit
                  setLimit(parseInt(value))
                }}
              >
                <SelectTrigger id="per-page" className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!data.pagination.hasPrevPage}
              onClick={() => setPage(data.pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!data.pagination.hasNextPage}
              onClick={() => setPage(data.pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
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

// Document stage status badge component
function DocumentStageStatusBadge({ document }: { document: PdfDocument }) {
  // Simple status determination based on document properties
  const getStatus = () => {
    if (document.analysis_status === 'completed') {
      return {
        label: 'Processed',
        className: 'bg-green-100 text-green-800',
        icon: CheckCircle,
        tooltip: 'Document has been fully analyzed for ADU relevance'
      }
    }
    if (document.extraction_status === 'completed') {
      return {
        label: 'Extracted',
        className: 'bg-blue-100 text-blue-800',
        icon: FileTextIcon,
        tooltip: 'PDF content has been extracted and is ready for analysis'
      }
    }
    if (document.download_status === 'downloaded') {
      return {
        label: 'Downloaded',
        className: 'bg-yellow-100 text-yellow-800',
        icon: Download,
        tooltip: 'Document has been downloaded successfully'
      }
    }
    if (document.download_status === 'error' || document.extraction_status === 'failed' || document.analysis_status === 'failed') {
      return {
        label: 'Failed',
        className: 'bg-red-100 text-red-800',
        icon: AlertCircle,
        tooltip: 'Processing failed - see document details for more information'
      }
    }
    return {
      label: 'Pending',
      className: 'bg-gray-100 text-gray-800',
      icon: Clock,
      tooltip: 'Document is queued for processing'
    }
  }

  const status = getStatus()
  const IconComponent = status.icon

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${status.className}`}>
            <IconComponent className="h-3 w-3" />
            {status.label}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            {status.tooltip}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Table view component
interface DocumentTableViewProps {
  data: any
  isLoading: boolean
  selectedDocuments: DocumentId[]
  searchParams: DocumentSearchParams
  setSorting: (sort: string, order: 'asc' | 'desc') => void
  onSelectAll: (checked: boolean) => void
  onSelectDocument: (id: DocumentId, checked: boolean) => void
  onToggleFavorite: (id: DocumentId) => void
  onOpenDocument: (document: PdfDocument & { municipality?: { name: string } }) => void
  onReprocess: (documentId: DocumentId, stage: 'download' | 'extract' | 'analyze') => void
}

function DocumentTableView({ 
  data, 
  isLoading, 
  selectedDocuments,
  searchParams,
  setSorting, 
  onSelectAll, 
  onSelectDocument,
  onToggleFavorite,
  onOpenDocument,
  onReprocess 
}: DocumentTableViewProps) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const handleMouseEnter = (documentId: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    setHoveredRow(documentId)
  }
  
  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredRow(null)
    }, 300) // 300ms delay before closing
  }
  
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-visible">
      <CardContent className="p-0 overflow-visible">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedDocuments.length === data?.data?.length && data?.data?.length > 0}
                  onCheckedChange={onSelectAll}
                />
              </TableHead>
              <TableHead>
                <button
                  onClick={() => setSorting('title', searchParams.sort === 'title' && searchParams.order === 'asc' ? 'desc' : 'asc')}
                  className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors"
                >
                  Document
                  {searchParams.sort === 'title' && (
                    searchParams.order === 'asc' ? 
                    <SortAsc className="h-3 w-3 opacity-60" /> : 
                    <SortDesc className="h-3 w-3 opacity-60" />
                  )}
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => setSorting('municipality_name', searchParams.sort === 'municipality_name' && searchParams.order === 'asc' ? 'desc' : 'asc')}
                  className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors"
                >
                  Municipality
                  {searchParams.sort === 'municipality_name' && (
                    searchParams.order === 'asc' ? 
                    <SortAsc className="h-3 w-3 opacity-60" /> : 
                    <SortDesc className="h-3 w-3 opacity-60" />
                  )}
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => setSorting('date_found', searchParams.sort === 'date_found' && searchParams.order === 'asc' ? 'desc' : 'asc')}
                  className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors"
                >
                  Date Found
                  {searchParams.sort === 'date_found' && (
                    searchParams.order === 'asc' ? 
                    <SortAsc className="h-3 w-3 opacity-60" /> : 
                    <SortDesc className="h-3 w-3 opacity-60" />
                  )}
                </button>
              </TableHead>
              <TableHead>Pipeline Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data?.map((document: PdfDocument & { municipality?: { name: string } }) => (
              <TableRow key={document.id} className="group">
                <TableCell>
                  <Checkbox
                    checked={selectedDocuments.includes(document.id)}
                    onCheckedChange={(checked) => onSelectDocument(document.id, checked as boolean)}
                  />
                </TableCell>
                <TableCell>
                  <div className="max-w-md">
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => onOpenDocument(document)}
                        className="font-medium truncate text-left hover:text-primary transition-colors cursor-pointer"
                      >
                        {searchParams.search ? (
                          <SearchResultHighlights
                            text={document.title}
                            searchTerms={searchParams.search.split(' ').filter(Boolean)}
                          />
                        ) : (
                          document.title
                        )}
                      </button>
                      {document.is_favorited && (
                        <Star className="h-4 w-4 text-favorite-active fill-favorite-active" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="truncate">{document.filename}</span>
                      {document.is_adu_relevant && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-badge-primary text-white">
                          ADU Relevant
                        </span>
                      )}
                      {document.relevance_confidence && (
                        <RelevanceScoreBadge 
                          score={document.relevance_confidence * 100} 
                          size="sm"
                        />
                      )}
                    </div>
                    {searchParams.search && document.content_text && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        <SearchResultHighlights
                          text={document.content_text.substring(0, 200) + (document.content_text.length > 200 ? '...' : '')}
                          searchTerms={searchParams.search.split(' ').filter(Boolean)}
                          maxLength={150}
                          className="italic"
                        />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{document.municipality_name || 'Unknown'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {format(new Date(document.date_found), 'MMM d, yyyy')}
                  </div>
                </TableCell>
                <TableCell>
                  <DocumentPipelineStatus 
                    document={document} 
                    size="sm" 
                    showActions={true}
                    onReprocess={onReprocess}
                  />
                </TableCell>
                <TableCell className="relative">
                  <div 
                    className="inline-block"
                    onMouseEnter={() => handleMouseEnter(document.id)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <DropdownMenu modal={false} open={hoveredRow === document.id}>
                      <DropdownMenuTrigger 
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8 p-0"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent 
                        align="end" 
                        className="w-56"
                        sideOffset={-4}
                        alignOffset={-5}
                        onMouseEnter={() => handleMouseEnter(document.id)}
                        onMouseLeave={handleMouseLeave}
                      >
                      <DropdownMenuItem 
                        onClick={() => onToggleFavorite(document.id)}
                        className="cursor-pointer"
                      >
                        <Star className={`mr-2 h-4 w-4 ${document.is_favorited ? 'fill-favorite-active text-favorite-active' : ''}`} />
                        <span>{document.is_favorited ? 'Remove from Favorites' : 'Add to Favorites'}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => {
                          if (navigator.share) {
                            navigator.share({
                              title: document.title,
                              text: `Check out this document: ${document.title}`,
                              url: document.url
                            })
                          } else {
                            navigator.clipboard.writeText(document.url)
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        <span>Share</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => {
                          const link = window.document.createElement('a')
                          link.href = document.url
                          link.download = document.filename
                          link.target = '_blank'
                          link.click()
                        }}
                        className="cursor-pointer"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        <span>Download</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => window.open(document.url, '_blank')}
                        className="cursor-pointer"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        <span>Open Original</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {(!data?.data || data.data.length === 0) && (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No documents found</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Grid view component
interface DocumentGridViewProps {
  data: any
  isLoading: boolean
  onToggleFavorite: (id: DocumentId) => void
  onOpenDocument: (document: PdfDocument & { municipality?: { name: string } }) => void
}

function DocumentGridView({ data, isLoading, onToggleFavorite, onOpenDocument }: DocumentGridViewProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-muted rounded w-1/2 mb-4"></div>
              <div className="h-8 bg-muted rounded w-1/4"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {data?.data?.map((document: PdfDocument & { municipality?: { name: string } }) => (
        <Card key={document.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg truncate mb-1">
                  <button
                    onClick={() => onOpenDocument(document)}
                    className="text-left hover:text-primary transition-colors cursor-pointer"
                  >
                    {document.title}
                  </button>
                </CardTitle>
                <CardDescription className="text-sm">
                  <div className="flex items-center gap-1 mb-1">
                    <Building2 className="h-3 w-3" />
                    <span className="truncate">{document.municipality_name || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{format(new Date(document.date_found), 'MMM d, yyyy')}</span>
                  </div>
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleFavorite(document.id)}
              >
                {document.is_favorited ? (
                  <Star className="h-4 w-4 text-favorite-active fill-favorite-active" />
                ) : (
                  <Star className="h-4 w-4 text-muted-foreground hover:text-favorite-active transition-colors" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="space-y-2">
                <DocumentPipelineStatus 
                  document={document} 
                  size="sm" 
                  showActions={false}
                />
                <div className="flex flex-wrap gap-1">
                  {document.is_adu_relevant && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-badge-primary text-white">
                      ADU Relevant
                    </span>
                  )}
                  {document.relevance_confidence && (
                    <RelevanceScoreBadge 
                      score={document.relevance_confidence * 100} 
                      size="sm"
                    />
                  )}
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground">
                <p className="truncate">{document.filename}</p>
                {document.file_size && (
                  <p>Size: {Math.round(document.file_size / 1024)} KB</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={() => onOpenDocument(document)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={document.url} download target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {(!data?.data || data.data.length === 0) && (
        <div className="col-span-full text-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No documents found</p>
        </div>
      )}
    </div>
  )
}

// Bulk Processing Controls Component
interface BulkProcessingControlsProps {
  selectedDocuments: DocumentId[]
  onBulkExtract: () => void
  onBulkAnalyze: () => void
}

function BulkProcessingControls({ selectedDocuments, onBulkExtract, onBulkAnalyze }: BulkProcessingControlsProps) {
  const selectedCount = selectedDocuments.length
  const [isProcessing, setIsProcessing] = useState(false)
  
  const handleBulkAction = async (action: () => Promise<void>) => {
    setIsProcessing(true)
    try {
      await action()
    } finally {
      setIsProcessing(false)
    }
  }
  
  if (selectedCount === 0) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Bulk Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled>
            Select documents to enable bulk actions
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={isProcessing}>
          {isProcessing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Settings className="mr-2 h-4 w-4" />
          )}
          Bulk Actions ({selectedCount})
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          Process {selectedCount} document{selectedCount === 1 ? '' : 's'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={() => handleBulkAction(async () => onBulkExtract())} 
          className="cursor-pointer"
          disabled={isProcessing}
        >
          <FileTextIcon className="mr-2 h-4 w-4" />
          <span>Extract Text Content</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleBulkAction(async () => onBulkAnalyze())} 
          className="cursor-pointer"
          disabled={isProcessing}
        >
          <Brain className="mr-2 h-4 w-4" />
          <span>Analyze for Relevance</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={() => handleBulkAction(async () => {
            await onBulkExtract()
            // Small delay before starting analysis
            await new Promise(resolve => setTimeout(resolve, 2000))
            await onBulkAnalyze()
          })}
          className="cursor-pointer"
          disabled={isProcessing}
        >
          <Zap className="mr-2 h-4 w-4" />
          <span>Extract + Analyze</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="text-xs text-muted-foreground cursor-default"
          disabled
        >
          Processing jobs will appear in the background
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}