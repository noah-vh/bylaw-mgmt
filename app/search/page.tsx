"use client"

import React, { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { 
  Search, 
  Filter, 
  X, 
  FileText, 
  Building2, 
  Calendar, 
  Star,
  ExternalLink,
  Download,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Bot,
  BookOpen,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { HelpTooltip, FeatureHint } from "@/components/ui/help-tooltip"
import { UserGuide, SEARCH_GUIDE_SECTIONS } from "@/components/ui/user-guide"
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

import { DocumentViewer } from "@/components/document-viewer"
import { useAdvancedDocumentSearch } from "@/hooks/use-documents"
import { useMunicipalities } from "@/hooks/use-municipalities"
import { useGlobalSearch } from "@/hooks/use-global-search"
import { useCategories } from "@/hooks/use-categories"
import { format } from "date-fns"
import type { PdfDocument } from "@/types/database"
import { createDocumentId, createMunicipalityId } from "@/types/database"

function SearchPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const initialQuery = searchParams.get('q') || ''
  
  const [showFilters, setShowFilters] = useState(false)
  const [isRelevantOnly, setIsRelevantOnly] = useState(false)
  const [isAnalyzedOnly, setIsAnalyzedOnly] = useState(false)
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [searchType, setSearchType] = useState<'basic' | 'fulltext'>('fulltext')
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const [selectedDocument, setSelectedDocument] = useState<(PdfDocument & { municipality?: { name: string } }) | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedAduType, setSelectedAduType] = useState<string>('')
  const [expandedSearch, setExpandedSearch] = useState(false)
  
  const handleOpenDocument = async (document: PdfDocument & { municipality?: { name: string } }) => {
    // If document lacks content_text, fetch complete document data
    if (!document.content_text) {
      try {
        const response = await fetch(`/api/documents/${document.id}`)
        if (response.ok) {
          const result = await response.json()
          const completeDocument = {
            ...document,
            ...result.data,
            municipality: document.municipality
          }
          setSelectedDocument(completeDocument)
          return
        }
      } catch (error) {
        console.error('Failed to fetch complete document data:', error)
      }
    }
    setSelectedDocument(document)
  }

  const handleToggleFavorite = async (documentId: any) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/favorite`, {
        method: 'POST',
      })
      
      if (response.ok) {
        // Update the selected document if it's currently open
        if (selectedDocument && selectedDocument.id === documentId) {
          setSelectedDocument(prev => prev ? {
            ...prev,
            is_favorited: !prev.is_favorited
          } : null)
        }
        // Optionally refetch search results to update the list
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }
  const [showGuide, setShowGuide] = useState(false)
  const [municipalityFilterExpanded, setMunicipalityFilterExpanded] = useState(false)
  
  // Create mock filters object for UI compatibility
  const filters = {
    searchType: searchType
  }
  // Internal municipality state management (like documents page)
  const [municipalityIds, setMunicipalityIds] = useState<number[]>([])
  
  // Use global search instead of document-only search
  const {
    data: globalSearchData,
    isLoading: searchLoading,
    error: searchError,
    query,
    search,
    clearSearch,
    documents: allDocuments,
    municipalities: searchMunicipalities,
    scrapers: searchScrapers,
    hasResults,
    totalResults,
    totalDocuments,
    currentPage,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    limit,
    updateLimit,
    updateMunicipalityIds,
    municipalityCounts,
    categories: searchCategories,
    aduType: searchAduType,
    updateCategories,
    updateAduType,
    updateExpandedSearch
  } = useGlobalSearch(initialQuery, ['documents', 'municipalities'], 100, 0, [], [], '', expandedSearch)

  // Advanced document search - kept for potential future use but not currently used
  // const {
  //   data: advancedSearchResults,
  //   isLoading: advancedLoading,
  //   filters,
  //   updateFilters,
  //   setPage,
  //   setSearchType
  // } = useAdvancedDocumentSearch()

  const { data: municipalitiesData } = useMunicipalities({ limit: 100 })
  const { categories, loading: categoriesLoading } = useCategories()

  // Initialize search from URL params
  useEffect(() => {
    if (initialQuery && !query) {
      search(initialQuery)
    }
  }, [initialQuery, query, search])


  const handleSearch = (searchQuery: string) => {
    search(searchQuery)
    // Update URL
    const params = new URLSearchParams()
    if (searchQuery) params.set('q', searchQuery)
    router.push(`/search?${params.toString()}`)
  }

  // No need for client-side filtering anymore - it's done on the server
  const searchDocuments = allDocuments
  
  // Calculate filtered total results and overall total
  const hasActiveFilters = municipalityIds.length > 0 || isRelevantOnly || isAnalyzedOnly
  
  // Calculate total documents across all municipalities (for "All" button when not searching)
  const overallTotalDocuments = React.useMemo(() => {
    if (municipalitiesData?.data) {
      return municipalitiesData.data.reduce((sum: number, municipality: any) => {
        return sum + (municipality.totalDocuments || 0)
      }, 0)
    }
    return 0
  }, [municipalitiesData])
  
  const filteredTotalResults = (() => {
    // When searching, use municipality counts from search results
    if (query && municipalityCounts.length > 0) {
      if (municipalityIds.length > 0) {
        // Filter by selected municipalities
        return municipalityCounts
          .filter((mc: any) => municipalityIds.includes(mc.municipality_id))
          .reduce((sum: number, mc: any) => sum + (mc.document_count || 0), 0)
      } else {
        // No municipality filter, sum all search results from all municipalities
        return municipalityCounts.reduce((sum: number, mc: any) => sum + (mc.document_count || 0), 0)
      }
    }
    // When not searching, use overall total from municipalities data
    else if (!query && overallTotalDocuments > 0) {
      if (municipalityIds.length > 0) {
        // Filter by selected municipalities
        return municipalitiesData?.data
          ?.filter((municipality: any) => municipalityIds.includes(municipality.id))
          .reduce((sum: number, municipality: any) => sum + (municipality.totalDocuments || 0), 0) || 0
      } else {
        // No filter, use overall total
        return overallTotalDocuments
      }
    }
    // Fallback: Use totalDocuments from search API
    else if (totalDocuments > 0) {
      return totalDocuments
    }
    // No data available
    return 0
  })()


  // Sync municipality filter changes with the search hook (like documents page)
  useEffect(() => {
    updateMunicipalityIds(municipalityIds)
    // Only invalidate cache if we have a query and municipality filter actually changed
    // Don't invalidate on initial load or when clearing
  }, [municipalityIds, updateMunicipalityIds])

  const clearFilters = () => {
    setMunicipalityIds([])
    setIsRelevantOnly(false)
    setIsAnalyzedOnly(false)
    setDateRange({})
    setSelectedCategories([])
    setSelectedAduType('')
    setExpandedSearch(false)
    updateExpandedSearch(false)
  }

  const activeFiltersCount = (municipalityIds.length > 0 ? 1 : 0) + 
    (isRelevantOnly ? 1 : 0) + 
    (isAnalyzedOnly ? 1 : 0) + 
    (dateRange.from || dateRange.to ? 1 : 0) +
    (selectedCategories.length > 0 ? 1 : 0) +
    (selectedAduType ? 1 : 0) +
    (expandedSearch ? 1 : 0)

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold">Search</h1>
          <Button variant="outline" size="sm" onClick={() => setShowGuide(true)}>
            <BookOpen className="h-4 w-4 mr-2" />
            Search Guide
          </Button>
        </div>
        <p className="text-muted-foreground">
          Search across bylaws, policies, and municipal documents with ADU-prioritized results
        </p>
      </div>

      {/* Search Input */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search bylaws, policies, and municipalities..."
              className="pl-10"
              defaultValue={initialQuery}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch(e.currentTarget.value)
                }
              }}
              onBlur={(e) => {
                if (e.target.value !== query) {
                  handleSearch(e.target.value)
                }
              }}
            />
          </div>
          
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="relative"
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
            <Select
              value={limit.toString()}
              onValueChange={(value) => {
                updateLimit(parseInt(value))
              }}
            >
              <SelectTrigger id="search-per-page" className="h-10 w-20">
                <SelectValue>
                  {limit}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="25">25 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
                <SelectItem value="100">100 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Municipality Filter Badges */}
      <div className="max-w-4xl mx-auto mb-6">
        <Collapsible open={municipalityFilterExpanded} onOpenChange={setMunicipalityFilterExpanded}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Filter by municipality:</span>
              {municipalityIds.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {municipalityIds.length} selected
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {municipalityIds.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMunicipalityIds([])}
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
              variant={municipalityIds.length === 0 ? "default" : "outline"}
              size="sm"
              onClick={() => setMunicipalityIds([])}
              className="h-8"
            >
              All
              {municipalityIds.length === 0 && filteredTotalResults > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                  {filteredTotalResults}
                </Badge>
              )}
            </Button>
            {municipalitiesData?.data
              ? [...municipalitiesData.data].sort((a, b) => {
                // If we have search results, sort by count
                if (query && municipalityCounts.length > 0) {
                  const aCount = municipalityCounts.find((mc: any) => mc.municipality_id === a.id)?.document_count || 0
                  const bCount = municipalityCounts.find((mc: any) => mc.municipality_id === b.id)?.document_count || 0
                  
                  // Sort by count (highest first)
                  if (aCount !== bCount) {
                    return bCount - aCount
                  }
                }
                
                // First, prioritize selected municipalities
                const aSelected = municipalityIds.includes(a.id)
                const bSelected = municipalityIds.includes(b.id)
                
                if (aSelected && !bSelected) return -1
                if (!aSelected && bSelected) return 1
                
                // Sort alphabetically if both selected or both not selected
                return a.name.localeCompare(b.name)
              }).slice(0, 5).map((municipality) => {
              const isSelected = municipalityIds.includes(municipality.id)
              // Get count from search results when searching, otherwise use total documents
              const searchCount = municipalityCounts.find((mc: any) => mc.municipality_id === municipality.id)?.document_count
              const docCount = query ? (searchCount || 0) : (municipality.totalDocuments || 0)
              
              return (
                <Button
                  key={municipality.id}
                  variant={isSelected ? "default" : "outline"}  
                  size="sm"
                  onClick={() => {
                    if (isSelected) {
                      // Remove from selection
                      setMunicipalityIds(municipalityIds.filter(id => id !== municipality.id))
                    } else {
                      // Add to selection  
                      setMunicipalityIds([...municipalityIds, municipality.id])
                    }
                  }}
                  className="h-8 flex items-center gap-1"
                >
                  {municipality.name}
                  {docCount > 0 && (
                    <Badge 
                      variant={isSelected ? "secondary" : "outline"} 
                      className="ml-1 h-5 px-1 text-xs"
                      title={query 
                        ? `${docCount} document${docCount !== 1 ? 's' : ''} matching "${query}"`
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
                  // If we have search results, sort by count
                  if (query && municipalityCounts.length > 0) {
                    const aCount = municipalityCounts.find((mc: any) => mc.municipality_id === a.id)?.document_count || 0
                    const bCount = municipalityCounts.find((mc: any) => mc.municipality_id === b.id)?.document_count || 0
                    
                    // Sort by count (highest first)
                    if (aCount !== bCount) {
                      return bCount - aCount
                    }
                  }
                  
                  // First, prioritize selected municipalities
                  const aSelected = municipalityIds.includes(a.id)
                  const bSelected = municipalityIds.includes(b.id)
                  
                  if (aSelected && !bSelected) return -1
                  if (!aSelected && bSelected) return 1
                  
                  // Sort alphabetically if both selected or both not selected
                  return a.name.localeCompare(b.name)
                }).slice(5).map((municipality) => {
                const isSelected = municipalityIds.includes(municipality.id)
                // Get count from search results when searching, otherwise use total documents
                const searchCount = municipalityCounts.find((mc: any) => mc.municipality_id === municipality.id)?.document_count
                const docCount = query ? (searchCount || 0) : (municipality.totalDocuments || 0)
                
                return (
                  <Button
                    key={municipality.id}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (isSelected) {
                        // Remove from selection
                        setMunicipalityIds(municipalityIds.filter(id => id !== municipality.id))
                      } else {
                        // Add to selection
                        setMunicipalityIds([...municipalityIds, municipality.id])
                      }
                    }}
                    className="h-8 flex items-center gap-1"
                  >
                    {municipality.name}
                    {docCount > 0 && (
                      <Badge 
                        variant={isSelected ? "secondary" : "outline"} 
                        className="ml-1 h-5 px-1 text-xs"
                        title={query 
                          ? `${docCount} document${docCount !== 1 ? 's' : ''} matching "${query}"`
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


      {/* Filters - Collapsible */}
      {showFilters && (
        <div className="max-w-4xl mx-auto mb-6">
          <div className="border border-border/50 bg-background/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearFilters} className="h-8 text-xs">
                  Clear All
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowFilters(false)} className="h-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="space-y-4">
              {/* Categories Filter */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">Filter by category:</span>
                  {selectedCategories.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedCategories.length} selected
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    variant={selectedCategories.length === 0 ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedCategories([])
                      updateCategories([])
                    }}
                    className="h-8"
                  >
                    All Categories
                  </Button>
                  {categories.map((category) => {
                    const isSelected = selectedCategories.includes(category.name)
                    return (
                      <Button
                        key={category.id}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          if (isSelected) {
                            const newCategories = selectedCategories.filter(c => c !== category.name)
                            setSelectedCategories(newCategories)
                            updateCategories(newCategories)
                          } else {
                            const newCategories = [category.name]
                            setSelectedCategories(newCategories)
                            updateCategories(newCategories)
                          }
                        }}
                        className="h-8"
                      >
                        {category.name}
                      </Button>
                    )
                  })}
                </div>
              </div>

              {/* ADU Type Filter */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">Filter by ADU type:</span>
                  {selectedAduType && (
                    <Badge variant="secondary" className="text-xs">
                      1 selected
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    variant={!selectedAduType ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedAduType('')
                      updateAduType('')
                    }}
                    className="h-8"
                  >
                    All ADU Types
                  </Button>
                  {[
                    { value: "adu", label: "Accessory Dwelling Unit (ADU)" },
                    { value: "laneway-home", label: "Laneway Home" },
                    { value: "garden-suite", label: "Garden Suite" },
                    { value: "tiny-home", label: "Tiny Home" },
                    { value: "coach-house", label: "Coach House / Carriage House" },
                    { value: "granny-flat", label: "Granny Flat / In-Law Suite" },
                    { value: "secondary-suite", label: "Secondary Suite" },
                    { value: "aru", label: "Additional Residential Unit (ARU)" }
                  ].map((aduType) => {
                    const isSelected = selectedAduType === aduType.value
                    return (
                      <Button
                        key={aduType.value}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedAduType('')
                            updateAduType('')
                          } else {
                            setSelectedAduType(aduType.value)
                            updateAduType(aduType.value)
                          }
                        }}
                        className="h-8"
                      >
                        {aduType.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              {/* Checkboxes */}
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="search-content"
                    checked={filters.searchType === 'fulltext'}
                    onCheckedChange={(checked) => 
                      setSearchType(checked === true ? 'fulltext' : 'basic')
                    }
                  />
                  <Label 
                    htmlFor="search-content" 
                    className="text-sm cursor-pointer"
                  >
                    Search document content
                  </Label>
                  <HelpTooltip 
                    content="Search inside PDF documents, not just titles and filenames."
                    variant="help"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="expanded-search"
                    checked={expandedSearch}
                    onCheckedChange={(checked) => {
                      setExpandedSearch(checked === true)
                      updateExpandedSearch(checked === true)
                    }}
                  />
                  <Label htmlFor="expanded-search" className="text-sm cursor-pointer">
                    Expanded query
                  </Label>
                  <HelpTooltip 
                    content="Find related terms (e.g., 'setback' also finds 'separation'). Takes longer but finds more results."
                    variant="help"
                  />
                  {expandedSearch && searchLoading && (
                    <span className="text-xs text-orange-600 font-medium">
                      Searching synonyms...
                    </span>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="relevant-only"
                    checked={isRelevantOnly}
                    onCheckedChange={(checked) => setIsRelevantOnly(checked === true)}
                  />
                  <Label htmlFor="relevant-only" className="text-sm cursor-pointer">
                    ADU relevant only
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="analyzed-only"
                    checked={isAnalyzedOnly}
                    onCheckedChange={(checked) => setIsAnalyzedOnly(checked === true)}
                  />
                  <Label htmlFor="analyzed-only" className="text-sm cursor-pointer">
                    Analyzed documents only
                  </Label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Results */}
      <div className="max-w-4xl mx-auto">
        {query && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">
                  Search results for "{query}"
                </h2>
                {hasResults && filteredTotalResults > 0 && (
                  <Badge variant="outline">
                    {filteredTotalResults} results
                  </Badge>
                )}
              </div>
              {query && (
                <Button variant="ghost" size="sm" onClick={clearSearch}>
                  <X className="mr-1 h-4 w-4" />
                  Clear search
                </Button>
              )}
            </div>
            
          </div>
        )}

        {/* Loading State */}
        {searchLoading && (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/2 mb-4"></div>
                  <div className="h-16 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Error State */}
        {searchError && (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-destructive mb-4">Error loading search results</p>
              <Button onClick={() => search(query)}>Try Again</Button>
            </CardContent>
          </Card>
        )}

        {/* Global Search Results */}
        <div className="space-y-6">
          {/* Municipalities Results */}
          {searchMunicipalities.length > 0 && (activeFilters.size === 0 || activeFilters.has('municipalities')) && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Municipalities</h3>
                  <Badge variant="secondary">{searchMunicipalities.length}</Badge>
                </div>
                <div className="grid gap-3">
                  {searchMunicipalities.map((municipality: any) => (
                    <MunicipalityResultCard key={municipality.id} municipality={municipality} />
                  ))}
                </div>
              </div>
            )}

            {/* Documents Results */}
            {Array.isArray(searchDocuments) && searchDocuments.length > 0 && (activeFilters.size === 0 || activeFilters.has('documents')) && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Documents ({searchDocuments.length})</h3>
                </div>
                <div className="space-y-4">
                  {searchDocuments.map((document: any) => {
                    // Convert search result document to PdfDocument format
                    const pdfDocument = {
                      ...document,
                      id: createDocumentId(document.id),
                      municipality_id: createMunicipalityId(document.municipality_id),
                      file_size: (document as any).file_size || null,
                      content_text: (document as any).content_text || null,
                      is_favorited: (document as any).is_favorited || false,
                      is_relevant: (document as any).is_relevant || null,
                      relevance_score: (document as any).relevance_score || null,
                      date_found: (document as any).date_found || new Date().toISOString(),
                      date_published: (document as any).date_published || null,
                      last_checked: (document as any).last_checked || new Date().toISOString(),
                      storage_path: (document as any).storage_path || null,
                      search_vector: null,
                      categories: (document as any).categories || null,
                      categorized_at: (document as any).categorized_at || null,
                      content_hash: (document as any).content_hash || null,
                      analysis_date: (document as any).analysis_date || null,
                      analysis_error: (document as any).analysis_error || null,
                      has_aru_provisions: (document as any).has_aru_provisions || null,
                      highlighted: (document as any).content_snippet ? {
                        title: document.title,
                        content: (document as any).content_snippet
                      } : undefined,
                      municipality: document.municipality ? { name: document.municipality.name } : undefined
                    } as any as (PdfDocument & { municipality?: { name: string } })
                    
                    return (
                      <SearchResultCard 
                        key={document.id} 
                        document={pdfDocument} 
                        onOpenDocument={handleOpenDocument}
                      />
                    )
                  })}
                </div>
                
                {/* Pagination */}
                {(totalPages > 1 || hasNextPage || hasPrevPage) && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                    <div className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * limit) + 1} to{' '}
                      {Math.min(currentPage * limit, filteredTotalResults || searchDocuments.length)} of{' '}
                      {filteredTotalResults || `${searchDocuments.length}+`} documents
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        Page {currentPage} {totalPages > 0 ? `of ${totalPages}` : ''}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          disabled={!hasPrevPage}
                          onClick={prevPage}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!hasNextPage}
                          onClick={nextPage}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>

        {/* No Results */}
        {query && !searchLoading && (!hasResults || (
          activeFilters.size > 0 && (
            (!activeFilters.has('documents') || searchDocuments.length === 0) &&
            (!activeFilters.has('municipalities') || searchMunicipalities.length === 0)
          )
        )) && (
          <Card>
            <CardContent className="p-12 text-center">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No results found</h3>
              <p className="text-muted-foreground mb-4">
                Try adjusting your search query or use different terms
              </p>
              <div className="text-sm text-muted-foreground">
                <p>We search across:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Municipal bylaws and policies</li>
                  <li>Document content and titles</li>
                  <li>Municipality names</li>
                  <li>ADU-relevant documents prioritized</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!query && (
          <Card>
            <CardContent className="p-12 text-center">
              <Search className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
              <h2 className="text-2xl font-semibold mb-4">Search Municipal Documents</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Find bylaws, policies, and regulations with ADU-relevant content prioritized
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                <div className="text-center">
                  <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <h3 className="font-medium mb-1">Bylaws & Policies</h3>
                  <p className="text-sm text-muted-foreground">
                    Search through document content and titles
                  </p>
                </div>
                <div className="text-center">
                  <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <h3 className="font-medium mb-1">Municipalities</h3>
                  <p className="text-sm text-muted-foreground">
                    Browse documents by city or town
                  </p>
                </div>
                <div className="text-center">
                  <Star className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <h3 className="font-medium mb-1">ADU Priority</h3>
                  <p className="text-sm text-muted-foreground">
                    ADU-relevant results ranked higher
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      {/* Document Viewer Modal */}
      {selectedDocument && (
        <DocumentViewer
          document={selectedDocument}
          open={!!selectedDocument}
          onOpenChange={(open) => !open && setSelectedDocument(null)}
          onToggleFavorite={handleToggleFavorite}
          searchQuery={query}
        />
      )}

      {/* Search Guide */}
      <UserGuide
        title="Search Guide"
        sections={SEARCH_GUIDE_SECTIONS}
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
      />
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div>Loading search...</div>}>
      <SearchPageContent />
    </Suspense>
  )
}

// Search result card components

// Municipality result card component
interface MunicipalityResultCardProps {
  municipality: {
    id: number
    name: string
    website_url: string
    status: string
    document_count: number
  }
}

function MunicipalityResultCard({ municipality }: MunicipalityResultCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h4 className="font-semibold mb-1">{municipality.name}</h4>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
              <span>Status: {municipality.status}</span>
              <span>Documents: {municipality.document_count}</span>
            </div>
            {municipality.website_url && (
              <a 
                href={municipality.website_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {municipality.website_url}
              </a>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={`/municipalities/${municipality.id}`}>
                View Details
              </a>
            </Button>
            {municipality.website_url && (
              <Button size="sm" variant="ghost" asChild>
                <a href={municipality.website_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Document search result card component
interface SearchResultCardProps {
  document: PdfDocument & { municipality?: { id: number; name: string } }
  onOpenDocument: (document: PdfDocument & { municipality?: { name: string } }) => void
}

function SearchResultCard({ document, onOpenDocument }: SearchResultCardProps) {
  const relevanceScore = document.relevance_score
  
  // Use highlighted title if available
  const displayTitle = document.highlighted?.title || document.title
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            {document.highlighted?.title ? (
              <h3 
                className="text-lg font-semibold mb-1 line-clamp-2"
                dangerouslySetInnerHTML={{ __html: displayTitle }}
              />
            ) : (
              <h3 className="text-lg font-semibold mb-1 line-clamp-2">
                {document.title}
              </h3>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Building2 className="h-4 w-4" />
              <span>{document.municipality?.name}</span>
              <span>•</span>
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(document.date_found), 'MMM d, yyyy')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {document.is_relevant && (
              <Badge variant="secondary" className="text-xs">
                ADU Related
              </Badge>
            )}
            {document.is_favorited && (
              <Badge variant="outline" className="text-xs">
                <Star className="h-3 w-3 mr-1" />
                Favorite
              </Badge>
            )}
            {document.rank && (
              <Badge variant="secondary" className="text-xs">
                Match: {Math.round(document.rank * 100)}%
              </Badge>
            )}
          </div>
        </div>

        {/* Document excerpt/content preview */}
        {(document.highlighted?.content || document.content_text) && (
          <div className="mb-4">
            {document.highlighted?.content ? (
              <p 
                className="text-sm text-muted-foreground line-clamp-3"
                dangerouslySetInnerHTML={{ __html: document.highlighted.content }}
              />
            ) : (
              <p className="text-sm text-muted-foreground line-clamp-3">
                {document.content_text?.substring(0, 300)}...
              </p>
            )}
          </div>
        )}

        {/* Document metadata */}
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-4">
            <span>File: {document.filename}</span>
            {document.file_size && (
              <span>Size: {Math.round(document.file_size / 1024)} KB</span>
            )}
            <span>
              Status: {document.content_text ? 'Extracted' : 'Pending'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => onOpenDocument(document)}>
            <Eye className="mr-2 h-4 w-4" />
            View Document
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={document.url} download target="_blank" rel="noopener noreferrer">
              <Download className="mr-2 h-4 w-4" />
              Download
            </a>
          </Button>
          <Button variant="ghost" size="sm">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Original
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}