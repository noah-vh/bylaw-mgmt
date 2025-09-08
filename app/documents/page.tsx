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
import { useGlobalSearch } from "@/hooks/use-global-search"
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
  const [searchInput, setSearchInput] = useState('')
  const [sortBy, setSortBy] = useState<'date_found' | 'title'>('date_found')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [filters, setFilters] = useState({
    isAduRelevant: false,
    isAnalyzed: false,
    isFavorited: false
  })
  
  // Use regular document search for browsing (when no search query)
  // Use 'basic' search type with empty query to get all documents
  const documentSearch = useDocumentSearch('', 'basic', selectedCategory)
  
  // Set initial page size for document search
  React.useEffect(() => {
    if (!isSearching && documentSearch.searchParams.limit !== pageSize) {
      documentSearch.setLimit(pageSize)
    }
  }, [])
  
  // Use global search for searching (when there's a search query)
  const globalSearch = useGlobalSearch(
    searchInput,
    ['documents'],
    pageSize,
    (currentPage - 1) * pageSize,
    selectedMunicipalities
  )
  
  // Load municipalities for the filter dropdown
  const { data: municipalitiesData } = useMunicipalities({ limit: 100 })
  
  // Calculate total documents across all municipalities (for "All" button when not searching)
  const overallTotalDocuments = React.useMemo(() => {
    if (municipalitiesData?.data) {
      return municipalitiesData.data.reduce((sum: number, municipality: any) => {
        return sum + (municipality.totalDocuments || 0)
      }, 0)
    }
    return 0
  }, [municipalitiesData])

  // Determine which data source to use
  const isSearching = searchInput.trim().length >= 2
  const data = isSearching ? globalSearch.data : documentSearch.data
  const isLoading = isSearching ? globalSearch.isLoading : documentSearch.isLoading
  const error = isSearching ? globalSearch.error : documentSearch.error
  const documents = isSearching ? globalSearch.documents : (documentSearch.data?.data || [])
  const municipalityCounts = isSearching ? globalSearch.municipalityCounts : []
  const totalDocuments = isSearching 
    ? globalSearch.totalDocuments 
    : (selectedMunicipalities.length === 0 ? overallTotalDocuments : (documentSearch.data?.pagination?.total || 0))
  const hasNextPage = isSearching 
    ? globalSearch.hasNextPage 
    : (documentSearch.data?.pagination?.hasNextPage || false)
  const hasPrevPage = isSearching 
    ? globalSearch.hasPrevPage 
    : (documentSearch.data?.pagination?.hasPrevPage || false)
  
  // Update search when input changes
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim().length >= 2) {
        globalSearch.search(searchInput.trim())
      } else if (searchInput.trim().length === 0) {
        // When search is cleared, update document search
        documentSearch.setSearch('')
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])
  
  // Load categories for the filter and sort by document count
  const { categories: rawCategoriesData, loading: categoriesLoading } = useCategories()
  const categoriesData = React.useMemo(() => {
    if (!rawCategoriesData || !Array.isArray(rawCategoriesData)) return []
    return [...rawCategoriesData]
      .filter(cat => cat && typeof cat === 'object' && cat.id && cat.name)
      .map(cat => ({
        id: cat.id,
        name: cat.name,
        documentCount: cat.totalDocuments || 0,
        totalDocuments: cat.totalDocuments || 0
      }))
      .sort((a, b) => (b.documentCount || 0) - (a.documentCount || 0))
  }, [rawCategoriesData])
  
  // Municipality counts are directly from the global search API
  
  // Apply municipality filter
  React.useEffect(() => {
    if (isSearching) {
      globalSearch.updateMunicipalityIds(selectedMunicipalities)
    } else {
      // For document search, handle single municipality
      if (selectedMunicipalities.length === 1) {
        documentSearch.setMunicipality(createMunicipalityId(selectedMunicipalities[0]))
      } else if (selectedMunicipalities.length === 0) {
        documentSearch.setMunicipality(undefined)
      }
    }
    setCurrentPage(1) // Reset to first page when filter changes
  }, [selectedMunicipalities, isSearching])

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
      if (isSearching) {
        globalSearch.refetch()
      } else {
        documentSearch.refetch()
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }
  
  const setSorting = (sort: string, order: 'asc' | 'desc') => {
    setSortBy(sort as any)
    setSortOrder(order)
    if (!isSearching) {
      documentSearch.setSorting(sort, order)
    }
  }
  
  const setPage = (page: number) => {
    setCurrentPage(page)
    if (isSearching) {
      globalSearch.updateOffset((page - 1) * pageSize)
    } else {
      documentSearch.setPage(page)
    }
  }
  
  const setLimit = (newLimit: number) => {
    setPageSize(newLimit)
    setCurrentPage(1)
    if (isSearching) {
      globalSearch.updateLimit(newLimit)
      globalSearch.updateOffset(0)
    } else {
      documentSearch.setLimit(newLimit)
    }
  }
  
  // Apply filters for document search
  React.useEffect(() => {
    if (!isSearching) {
      documentSearch.setRelevanceFilter(filters.isAduRelevant || undefined)
      documentSearch.setAnalyzedFilter(filters.isAnalyzed || undefined)
      documentSearch.setFavoritesFilter(filters.isFavorited || undefined)
    }
  }, [filters, isSearching])
  
  // Create searchParams object for compatibility
  const searchParams = {
    search: searchInput,
    sort: sortBy,
    order: sortOrder,
    municipalityId: selectedMunicipalities[0] ? createMunicipalityId(selectedMunicipalities[0]) : undefined,
    isAduRelevant: filters.isAduRelevant,
    isAnalyzed: filters.isAnalyzed,
    isFavorited: filters.isFavorited
  } as DocumentSearchParams
  
  // Format documents data for compatibility
  const formattedData = {
    data: documents,
    pagination: {
      page: currentPage,
      limit: pageSize,
      total: totalDocuments === -1 ? documents.length : totalDocuments,
      hasNextPage,
      hasPrevPage
    }
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Error Loading Documents</h1>
          <p className="text-muted-foreground mb-4">{error.message}</p>
          <Button onClick={() => isSearching ? globalSearch.refetch() : documentSearch.refetch()}>Try Again</Button>
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
                  if (isSearching) {
                    globalSearch.refetch()
                  } else {
                    documentSearch.refetch()
                  }
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Category Dropdown */}
          <Select
            value={selectedCategory || "all"}
            onValueChange={(value) => {
              if (value === "all") {
                setSelectedCategory(null)
                documentSearch.setCategory(undefined)
                // Remove category filter
                const newUrl = new URL(window.location.href)
                newUrl.searchParams.delete('category')
                window.history.replaceState({}, '', newUrl.toString())
              } else {
                setSelectedCategory(value)
                documentSearch.setCategory(value)
                // Update URL with category filter
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
                  // Clean up any multiple spaces and trim - with safety check
                  const cleanName = category?.name ? category.name.replace(/\s+/g, ' ').trim() : 'Unknown Category'
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
                {(filters.isAduRelevant || filters.isAnalyzed || filters.isFavorited) && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1">
                    {[searchParams.isAduRelevant, searchParams.isAnalyzed, searchParams.isFavorited].filter(Boolean).length}
                  </Badge>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Document Filters</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                <DropdownMenuCheckboxItem
                  checked={filters.isAduRelevant === true}
                  onCheckedChange={(checked) => setFilters(prev => ({ ...prev, isAduRelevant: checked || false }))}
                >
                  ADU Relevant Only
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.isAnalyzed === true}
                  onCheckedChange={(checked) => setFilters(prev => ({ ...prev, isAnalyzed: checked || false }))}
                >
                  Content Extracted
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.isFavorited === true}
                  onCheckedChange={(checked) => setFilters(prev => ({ ...prev, isFavorited: checked || false }))}
                >
                  Favorites Only
                </DropdownMenuCheckboxItem>
                
                {(searchParams.isAduRelevant || searchParams.isAnalyzed || searchParams.isFavorited) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setFilters({ isAduRelevant: false, isAnalyzed: false, isFavorited: false })
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
              value={pageSize.toString()}
              onValueChange={(value) => {
                setLimit(parseInt(value))
              }}
            >
              <SelectTrigger className="h-10 w-20">
                <SelectValue>
                  {pageSize}
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
              {selectedMunicipalities.length === 0 && totalDocuments > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                  {totalDocuments}
                </Badge>
              )}
            </Button>
            {municipalitiesData?.data
              ? [...municipalitiesData.data].sort((a, b) => {
                // Always sort alphabetically
                return a.name.localeCompare(b.name)
              }).slice(0, 5).map((municipality) => {
              const isSelected = selectedMunicipalities.includes(municipality.id)
              // Get count from search results when searching, otherwise use total documents
              const searchCount = municipalityCounts.find((mc: any) => mc.municipality_id === municipality.id)?.document_count
              const docCount = searchInput ? (searchCount || 0) : (municipality.totalDocuments || 0)
              
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
                  disabled={false}
                >
                  {municipality.name}
                  {docCount > 0 && (
                    <Badge 
                      variant={isSelected ? "secondary" : "outline"} 
                      className="ml-1 h-5 px-1 text-xs"
                      title={searchInput 
                        ? `${docCount} document${docCount !== 1 ? 's' : ''} matching "${searchInput}"`
                        : `${docCount} total document${docCount !== 1 ? 's' : ''}`
                      }
                    >
                      {docCount}
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
                  // Always sort alphabetically
                  return a.name.localeCompare(b.name)
                }).slice(5).map((municipality) => {
                const isSelected = selectedMunicipalities.includes(municipality.id)
                // Get count from search results when searching, otherwise use total documents
                const searchCount = municipalityCounts.find((mc: any) => mc.municipality_id === municipality.id)?.document_count
                const docCount = searchInput ? (searchCount || 0) : (municipality.totalDocuments || 0)
                
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
                    disabled={false}
                  >
                    {municipality.name}
                    {docCount > 0 && (
                      <Badge 
                        variant={isSelected ? "secondary" : "outline"} 
                        className="ml-1 h-5 px-1 text-xs"
                        title={searchInput 
                          ? `${docCount} document${docCount !== 1 ? 's' : ''} matching "${searchInput}"`
                          : `${docCount} total document${docCount !== 1 ? 's' : ''}`
                        }
                      >
                        {docCount}
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
          data={formattedData}
          isLoading={isLoading}
          searchParams={searchParams}
          setSorting={setSorting}
          onToggleFavorite={handleToggleFavorite}
          onOpenDocument={handleOpenDocument}
        />
      ) : (
        <DocumentGridView
          key={`grid-${searchParams.municipalityId || 'all'}`}
          data={formattedData}
          isLoading={isLoading}
          onToggleFavorite={handleToggleFavorite}
          onOpenDocument={handleOpenDocument}
        />
      )}

      {/* Pagination */}
      {formattedData?.pagination && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-muted-foreground">
            Showing {((formattedData.pagination.page - 1) * formattedData.pagination.limit) + 1} to{' '}
            {Math.min(formattedData.pagination.page * formattedData.pagination.limit, formattedData.pagination.total)} of{' '}
            {formattedData.pagination.total} documents
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!formattedData.pagination.hasPrevPage}
              onClick={() => setPage(formattedData.pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!formattedData.pagination.hasNextPage}
              onClick={() => setPage(formattedData.pagination.page + 1)}
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
