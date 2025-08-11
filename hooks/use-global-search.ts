import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

// Types for global search
interface GlobalSearchResult {
  documents: Array<{
    id: number
    title: string
    municipality_id: number
    municipality?: { id: number; name: string }
    highlighted?: {
      title: string
      content: string | null
    }
    url: string
    filename: string
    is_adu_relevant: boolean
    date_found: string
    relevance_confidence?: number
    rank?: number
  }>
  municipalities: Array<{
    id: number
    name: string
    website_url: string
    status: string
    document_count: number
  }>
  scrapers: Array<{
    name: string
    description: string
    is_enhanced: boolean
    supported: boolean
  }>
  keywords: Array<{
    keyword: string
    type: string
    relevance: number
  }>
  municipalityCounts?: Array<{
    municipality_id: number
    municipality_name: string
    document_count: number
  }>
}

interface GlobalSearchResponse {
  query: string
  results: GlobalSearchResult
  meta: {
    duration: number
    types: string[]
    total: number
    pagination?: {
      documentsTotal: number
      hasMore?: boolean
      offset: number
      limit: number
    }
  }
}

// Fetch global search results
async function fetchGlobalSearch(
  query: string, 
  types: ('documents' | 'municipalities' | 'scrapers' | 'keywords')[] = ['documents', 'municipalities'],
  limit = 100,
  offset = 0,
  municipalityIds: number[] = []
): Promise<GlobalSearchResponse> {
  const searchParams = new URLSearchParams()
  searchParams.set('q', query)
  searchParams.set('limit', limit.toString())
  searchParams.set('offset', offset.toString())
  types.forEach(type => searchParams.append('types[]', type))
  municipalityIds.forEach(id => searchParams.append('municipalityIds[]', id.toString()))
  
  // Debug logging (can be removed later)
  console.log('Search params:', {
    query,
    municipalityIds,
    limit,
    offset,
    url: `/api/search/global?${searchParams}`
  })

  const response = await fetch(`/api/search/global?${searchParams}`)
  
  if (!response.ok) {
    throw new Error(`Failed to search: ${response.statusText}`)
  }
  
  return await response.json()
}

// Query key factory for global search
const globalSearchKeys = {
  all: ['global-search'] as const,
  search: (query: string, types: string[], limit: number, offset: number, municipalityIds: number[]) => 
    [...globalSearchKeys.all, 'v5', query, types, limit, offset, municipalityIds] as const,
}

// Global search hook
export function useGlobalSearch(
  initialQuery: string = '',
  initialTypes: ('documents' | 'municipalities' | 'scrapers' | 'keywords')[] = ['documents', 'municipalities'],
  initialLimit: number = 100,
  initialOffset: number = 0,
  initialMunicipalityIds: number[] = []
) {
  const [query, setQuery] = useState(initialQuery)
  const [searchTypes, setSearchTypes] = useState(initialTypes)
  const [limit, setLimit] = useState(initialLimit)
  const [offset, setOffset] = useState(initialOffset)
  const [municipalityIds, setMunicipalityIds] = useState(initialMunicipalityIds)

  const searchQuery = useQuery({
    queryKey: globalSearchKeys.search(query, searchTypes, limit, offset, municipalityIds),
    queryFn: () => fetchGlobalSearch(query, searchTypes, limit, offset, municipalityIds),
    enabled: query.length >= 2, // Only search with 2+ characters
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus
  })

  const search = (searchQuery: string) => {
    setQuery(searchQuery.trim())
  }

  const updateTypes = (types: typeof searchTypes) => {
    setSearchTypes(types)
  }

  const updateLimit = (newLimit: number) => {
    setLimit(newLimit)
    setOffset(0) // Reset offset when changing limit
  }
  
  const updateOffset = (newOffset: number) => {
    setOffset(newOffset)
  }
  
  const updateMunicipalityIds = (ids: number[]) => {
    setMunicipalityIds(ids)
    setOffset(0) // Reset to first page when changing filter
  }
  
  const nextPage = () => {
    setOffset(prev => prev + limit)
  }
  
  const prevPage = () => {
    setOffset(prev => Math.max(0, prev - limit))
  }

  const clearSearch = () => {
    setQuery('')
    setOffset(0)
  }

  return {
    ...searchQuery,
    query,
    searchTypes,
    limit,
    offset,
    municipalityIds,
    search,
    updateTypes,
    updateLimit,
    updateOffset,
    updateMunicipalityIds,
    nextPage,
    prevPage,
    clearSearch,
    // Convenience getters
    hasResults: searchQuery.data && searchQuery.data.meta.total > 0,
    totalResults: searchQuery.data?.meta.total || 0,
    documents: searchQuery.data?.results.documents || [],
    municipalities: searchQuery.data?.results.municipalities || [],
    scrapers: searchQuery.data?.results.scrapers || [],
    keywords: searchQuery.data?.results.keywords || [],
    municipalityCounts: searchQuery.data?.results.municipalityCounts || [],
    // Pagination info
    totalDocuments: searchQuery.data?.meta.pagination?.documentsTotal === -1 ? -1 : (searchQuery.data?.meta.pagination?.documentsTotal || 0),
    currentPage: Math.floor(offset / limit) + 1,
    totalPages: searchQuery.data?.meta.pagination?.documentsTotal === -1 
      ? 0 // Unknown total
      : Math.ceil((searchQuery.data?.meta.pagination?.documentsTotal || 0) / limit),
    hasNextPage: searchQuery.data?.meta.pagination?.hasMore || false,
    hasPrevPage: offset > 0,
  }
}

// Simple search hook for quick searches (like in a navbar)
export function useQuickSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: globalSearchKeys.search(query, ['documents', 'municipalities'], 5),
    queryFn: () => fetchGlobalSearch(query, ['documents', 'municipalities'], 5),
    enabled: enabled && query.length >= 2,
    staleTime: 1000 * 30
  })
}