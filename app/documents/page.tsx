"use client"

import React, { useState, useRef, useEffect, useCallback, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { 
  FileText, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Eye, 
  Download, 
  Star, 
  StarOff,
  Calendar, 
  SortAsc,
  SortDesc,
  Grid3x3,
  List,
  RefreshCw,
  ExternalLink,
  Share2,
  Upload,
  ChevronDown,
  ChevronUp,
  Building2,
  Home,
  Car,
  Zap
} from "lucide-react"
import { DocumentViewer } from "@/components/document-viewer"
import { SearchResultHighlights } from "@/components/search-result-highlights"

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

import { 
  useDocumentSearch, 
  useToggleDocumentFavorite
} from "@/hooks/use-documents"
import { useMunicipalities } from "@/hooks/use-municipalities"
import { useCategories } from "@/hooks/use-categories"
import { format } from "date-fns"
import type { PdfDocument, DocumentSearchParams, DocumentId } from "@/types/database"
import { createDocumentId, createMunicipalityId } from "@/types/database"
import { DocumentUploadForm } from "@/components/document-upload-form"

// Document Status Component
interface DocumentStatusProps {
  document: PdfDocument & { municipality?: { name: string } }
}

function DocumentStatus({ document }: DocumentStatusProps) {
  // Determine status based on content_text field
  let status: 'extracted' | 'pending' | 'error' = 'pending'
  let variant: 'default' | 'outline' | 'destructive' = 'outline'
  
  if (document.content_text && document.content_text.length > 0) {
    status = 'extracted'
    variant = 'default'
  }
  // You could add error detection here if needed
  // else if (document.extraction_error) {
  //   status = 'error'
  //   variant = 'destructive'
  // }
  
  return (
    <Badge variant={variant} className="text-xs capitalize">
      {status}
    </Badge>
  )
}

function DocumentsPageContent() {
  const urlSearchParams = useSearchParams()
  const categoryFromUrl = urlSearchParams.get('category')
  
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<(PdfDocument & { municipality?: { name: string } }) | null>(null)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<number[]>([])
  const [municipalityFilterExpanded, setMunicipalityFilterExpanded] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryFromUrl)
  
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
    setCategory,
    refetch
  } = useDocumentSearch('', 'fulltext', categoryFromUrl)

  // Load municipalities for the filter dropdown
  const { data: municipalitiesData } = useMunicipalities({ limit: 100 })
  
  // Load categories for the filter and sort by document count
  const { categories: rawCategoriesData, loading: categoriesLoading } = useCategories()
  const categoriesData = rawCategoriesData ? [...rawCategoriesData].sort((a, b) => b.totalDocuments - a.totalDocuments) : []
  
  // Calculate document counts per municipality based on current filtered data
  const municipalityDocumentCounts = React.useMemo(() => {
    const counts: Record<number, number> = {}
    const docs = data?.data || []
    
    docs.forEach(doc => {
      if (!counts[doc.municipality_id]) {
        counts[doc.municipality_id] = 0
      }
      counts[doc.municipality_id]++
    })
    
    return counts
  }, [data?.data])
  
  // Ensure search type is always fulltext and sync category from URL
  React.useEffect(() => {
    console.log('Documents page search params:', searchParams)
    if (searchParams.searchType !== 'fulltext') {
      console.log('Setting search type to fulltext from:', searchParams.searchType)
      setSearchType('fulltext')
    }
  }, [searchParams.searchType, setSearchType])
  
  // Sync category from URL on mount
  React.useEffect(() => {
    if (categoryFromUrl && categoryFromUrl !== selectedCategory) {
      setSelectedCategory(categoryFromUrl)
      setCategory(categoryFromUrl)
    }
  }, [categoryFromUrl])
  
  // Debug search changes
  React.useEffect(() => {
    if (searchParams.search) {
      console.log('Documents page searching for:', searchParams.search, 'with type:', searchParams.searchType)
    }
  }, [searchParams.search, searchParams.searchType])
  
  const searchType = 'fulltext'
  
  // Apply municipality filter
  React.useEffect(() => {
    if (selectedMunicipalities.length === 1) {
      setMunicipality(createMunicipalityId(selectedMunicipalities[0]))
    } else if (selectedMunicipalities.length === 0) {
      setMunicipality(undefined)
    }
    // Note: The current API doesn't support multiple municipality selection
    // This would need backend changes to support an array of municipalities
  }, [selectedMunicipalities]) // Removed setMunicipality from dependencies to prevent infinite loop

  const toggleFavoriteMutation = useToggleDocumentFavorite()
  
  const handleOpenDocument = (document: PdfDocument & { municipality?: { name: string } }) => {
    console.log('Documents page - Opening document:', {
      id: document.id,
      title: document.title,
      hasContent: !!document.content_text,
      contentLength: document.content_text?.length || 0,
      contentType: typeof document.content_text,
      storage_path: document.storage_path
    })
    setSelectedDocument(document)
  }

  const handleToggleFavorite = async (documentId: DocumentId) => {
    try {
      await toggleFavoriteMutation.mutateAsync(documentId)
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }
  


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
          <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Upload Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Upload Bylaw Document</DialogTitle>
                <DialogDescription>
                  Upload a PDF document to add it to your municipal bylaw collection
                </DialogDescription>
              </DialogHeader>
              <DocumentUploadForm
                municipalities={municipalitiesData?.data ? [...municipalitiesData.data] : []}
                onUploadSuccess={(document) => {
                  setShowUploadDialog(false)
                  refetch() // Refresh the documents list
                }}
                onCancel={() => setShowUploadDialog(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search Input and Controls */}
      <div className="mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search document titles and content..."
              value={searchParams.search || ''}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Category Dropdown */}
          <Select
            value={selectedCategory || "all"}
            onValueChange={(value) => {
              if (value === "all") {
                setSelectedCategory(null)
                setCategory(undefined)
                const newUrl = new URL(window.location.href)
                newUrl.searchParams.delete('category')
                window.history.replaceState({}, '', newUrl.toString())
              } else {
                setSelectedCategory(value)
                setCategory(value)
                const newUrl = new URL(window.location.href)
                newUrl.searchParams.set('category', value)
                window.history.replaceState({}, '', newUrl.toString())
              }
            }}
          >
            <SelectTrigger className="w-[200px] h-10 text-left">
              <SelectValue placeholder="All Categories" className="text-left" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categoriesLoading ? (
                <SelectItem value="loading" disabled>Loading...</SelectItem>
              ) : categoriesData.length > 0 ? (
                categoriesData.map((category) => {
                  // Clean up any multiple spaces and trim
                  const cleanName = category.name.replace(/\s+/g, ' ').trim()
                  return (
                    <SelectItem key={category.id} value={category.id} textValue={cleanName}>
                      {cleanName}
                    </SelectItem>
                  )
                })
              ) : null}
            </SelectContent>
          </Select>
          
          <div className="flex gap-2">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger className="inline-flex items-center justify-center h-10 px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {(searchParams.isAduRelevant || searchParams.isAnalyzed || searchParams.isFavorited) && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1">
                    {[searchParams.isAduRelevant, searchParams.isAnalyzed, searchParams.isFavorited].filter(Boolean).length}
                  </Badge>
                )}
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
                  Content Extracted
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={searchParams.isFavorited === true}
                  onCheckedChange={(checked) => setFavoritesFilter(checked || undefined)}
                >
                  Favorites Only
                </DropdownMenuCheckboxItem>
                
                {(searchParams.isAduRelevant || searchParams.isAnalyzed || searchParams.isFavorited) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setRelevanceFilter(undefined)
                        setAnalyzedFilter(undefined)
                        setFavoritesFilter(undefined)
                      }}
                      className="text-sm text-muted-foreground cursor-pointer"
                    >
                      Clear all filters
                    </DropdownMenuItem>
                  </>
                )}
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
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Page Size Selector */}
            <Select
              value={data?.pagination?.limit?.toString() || "100"}
              onValueChange={(value) => {
                setPage(1) // Reset to first page when changing limit
                setLimit(parseInt(value))
              }}
            >
              <SelectTrigger className="h-10 w-20">
                <SelectValue>
                  {data?.pagination?.limit || 100}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="20">20 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
                <SelectItem value="100">100 per page</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex gap-1">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('grid')}
                className="h-10 w-10"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('table')}
                className="h-10 w-10"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Municipality Filter Badges */}
      <div className="mb-6">
        <Collapsible open={municipalityFilterExpanded} onOpenChange={setMunicipalityFilterExpanded}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Filter by municipality:</span>
              {selectedMunicipalities.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {selectedMunicipalities.length} selected
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedMunicipalities.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedMunicipalities([])}
                  className="h-8 text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </Button>
              )}
              {municipalityFilterExpanded && municipalitiesData?.data && municipalitiesData.data.length > 5 && (
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground">
                    View less
                  </Button>
                </CollapsibleTrigger>
              )}
            </div>
          </div>
          
          {/* Collapsed view - show first row with "more" button */}
          <div className="flex gap-2 items-center overflow-hidden flex-wrap">
            <Button
              variant={selectedMunicipalities.length === 0 ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedMunicipalities([])}
              className="h-8"
            >
              All
              {selectedMunicipalities.length === 0 && data?.pagination?.total && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                  {data.pagination.total}
                </Badge>
              )}
            </Button>
            {municipalitiesData?.data
              ? [...municipalitiesData.data].sort((a, b) => {
                // Sort by category-filtered counts when category is selected
                if (selectedCategory) {
                  const aCount = municipalityDocumentCounts[a.id] || 0
                  const bCount = municipalityDocumentCounts[b.id] || 0
                  return bCount - aCount
                }
                // Otherwise sort by total documents
                const aCount = a.totalDocuments || 0
                const bCount = b.totalDocuments || 0
                return bCount - aCount // Sort descending by count
              }).slice(0, 5).map((municipality) => {
              const isSelected = selectedMunicipalities.includes(municipality.id)
              // Use category-filtered count if available, otherwise fall back to total
              const docCount = municipalityDocumentCounts[municipality.id] || 0
              const totalDocs = selectedCategory ? docCount : (municipality.totalDocuments || 0)
              
              return (
                <Button
                  key={municipality.id}
                  variant={isSelected ? "default" : "outline"}  
                  size="sm"
                  onClick={() => {
                    if (isSelected) {
                      // Remove from selection
                      setSelectedMunicipalities(prev => prev.filter(id => id !== municipality.id))
                    } else {
                      // Add to selection
                      setSelectedMunicipalities(prev => [...prev, municipality.id])
                    }
                  }}
                  className="h-8"
                  disabled={!!(selectedCategory && (!docCount || docCount === 0))}
                >
                  {municipality.name}
                  {totalDocs > 0 && (
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                      {totalDocs}
                    </Badge>
                  )}
                </Button>
              )
            })
            : null}
            {!municipalityFilterExpanded && municipalitiesData?.data && municipalitiesData.data.length > 5 && (
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  +{municipalitiesData.data.length - 5} more
                </Button>
              </CollapsibleTrigger>
            )}
          </div>

          <CollapsibleContent>
            <div className="flex flex-wrap gap-2 items-center pt-2">
              {municipalitiesData?.data
                ? [...municipalitiesData.data].sort((a, b) => {
                  // Sort by category-filtered counts when category is selected
                  if (selectedCategory) {
                    const aCount = municipalityDocumentCounts[a.id] || 0
                    const bCount = municipalityDocumentCounts[b.id] || 0
                    return bCount - aCount
                  }
                  // Otherwise sort by total documents
                  const aCount = a.totalDocuments || 0
                  const bCount = b.totalDocuments || 0
                  return bCount - aCount // Sort descending by count
                }).slice(5).map((municipality) => {
                const isSelected = selectedMunicipalities.includes(municipality.id)
                // Use category-filtered count if available, otherwise fall back to total
                const docCount = municipalityDocumentCounts[municipality.id] || 0
                const totalDocs = selectedCategory ? docCount : (municipality.totalDocuments || 0)
                
                return (
                  <Button
                    key={municipality.id}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (isSelected) {
                        // Remove from selection
                        setSelectedMunicipalities(prev => prev.filter(id => id !== municipality.id))
                      } else {
                        // Add to selection
                        setSelectedMunicipalities(prev => [...prev, municipality.id])
                      }
                    }}
                    className="h-8"
                    disabled={!!(selectedCategory && (!docCount || docCount === 0))}
                  >
                    {municipality.name}
                    {totalDocs > 0 && (
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                        {totalDocs}
                      </Badge>
                    )}
                  </Button>
                )
              })
              : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Content */}
      {viewMode === 'table' ? (
        <DocumentTableView
          key={`table-${searchParams.municipalityId || 'all'}`}
          data={data}
          isLoading={isLoading}
          searchParams={searchParams}
          setSorting={setSorting}
          onToggleFavorite={handleToggleFavorite}
          onOpenDocument={handleOpenDocument}
        />
      ) : (
        <DocumentGridView
          key={`grid-${searchParams.municipalityId || 'all'}`}
          data={data}
          isLoading={isLoading}
          onToggleFavorite={handleToggleFavorite}
          onOpenDocument={handleOpenDocument}
        />
      )}

      {/* Pagination */}
      {data?.pagination && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-muted-foreground">
            Showing {((data.pagination.page - 1) * data.pagination.limit) + 1} to{' '}
            {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
            {data.pagination.total} documents
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

// Table view component
interface DocumentTableViewProps {
  data: any
  isLoading: boolean
  searchParams: DocumentSearchParams
  setSorting: (sort: string, order: 'asc' | 'desc') => void
  onToggleFavorite: (id: DocumentId) => void
  onOpenDocument: (document: PdfDocument & { municipality?: { name: string } }) => void
}

function DocumentTableView({ 
  data, 
  isLoading, 
  searchParams,
  setSorting, 
  onToggleFavorite,
  onOpenDocument
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
              <TableHead className="w-40 text-right">
                <button
                  onClick={() => setSorting('municipality_name', searchParams.sort === 'municipality_name' && searchParams.order === 'asc' ? 'desc' : 'asc')}
                  className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors whitespace-nowrap"
                >
                  Municipality
                  {searchParams.sort === 'municipality_name' && (
                    searchParams.order === 'asc' ? 
                    <SortAsc className="h-3 w-3 opacity-60" /> : 
                    <SortDesc className="h-3 w-3 opacity-60" />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-36 text-right">
                <button
                  onClick={() => setSorting('last_checked', searchParams.sort === 'last_checked' && searchParams.order === 'asc' ? 'desc' : 'asc')}
                  className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors whitespace-nowrap"
                >
                  Last Updated
                  {searchParams.sort === 'last_checked' && (
                    searchParams.order === 'asc' ? 
                    <SortAsc className="h-3 w-3 opacity-60" /> : 
                    <SortDesc className="h-3 w-3 opacity-60" />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-36 text-right whitespace-nowrap">Date Published</TableHead>
              <TableHead className="w-40 text-right whitespace-nowrap">Document Content</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data?.map((document: PdfDocument & { municipality?: { name: string } }) => (
              <TableRow key={document.id} className="group">
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
                <TableCell className="text-right">
                  <div className="text-sm">{document.municipality_name || 'Unknown'}</div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="text-sm whitespace-nowrap">
                    {document.last_checked ? format(new Date(document.last_checked), 'MMM d, yyyy') : 'Never'}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="text-sm text-muted-foreground whitespace-nowrap">
                    {(document as any).date_published ? format(new Date((document as any).date_published), 'MMM d, yyyy') : 'N/A'}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <DocumentStatus document={document} />
                </TableCell>
                <TableCell className="relative text-right">
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
                <div className="flex flex-wrap gap-1">
                  <DocumentStatus document={document} />
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

export default function DocumentsPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-muted rounded w-1/3 mb-8"></div>
          <div className="h-10 bg-muted rounded mb-6"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    }>
      <DocumentsPageContent />
    </Suspense>
  )
}
