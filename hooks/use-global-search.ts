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
  municipalityIds: number[] = [],
  categories: string[] = [],
  aduType: string = '',
  expandedSearch: boolean = false
): Promise<GlobalSearchResponse> {
  const searchParams = new URLSearchParams()
  searchParams.set('q', query)
  searchParams.set('limit', limit.toString())
  searchParams.set('offset', offset.toString())
  types.forEach(type => searchParams.append('types[]', type))
  municipalityIds.forEach(id => searchParams.append('municipalityIds[]', id.toString()))
  categories.forEach(category => searchParams.append('categories[]', category))
  if (aduType) searchParams.set('aduType', aduType)
  if (expandedSearch) searchParams.set('expandedSearch', 'true')
  

  const response = await fetch(`/api/search/global?${searchParams}`)
  
  if (!response.ok) {
    throw new Error(`Failed to search: ${response.statusText}`)
  }
  
  const result = await response.json()
  console.log('📦 API RESPONSE:', { 
    documentsCount: result.results?.documents?.length, 
    query: result.query,
    municipalityFilter: municipalityIds 
  })
  
  return result
}

// Query key factory for global search
const globalSearchKeys = {
  all: ['global-search'] as const,
  search: (query: string, types: string[], limit: number, offset: number, municipalityIds: number[], categories: string[], aduType: string, expandedSearch: boolean) => 
    [...globalSearchKeys.all, 'v7', query, types, limit, offset, municipalityIds, categories, aduType, expandedSearch] as const,
}

// Global search hook
export function useGlobalSearch(
  initialQuery: string = '',
  initialTypes: ('documents' | 'municipalities' | 'scrapers' | 'keywords')[] = ['documents', 'municipalities'],
  initialLimit: number = 100,
  initialOffset: number = 0,
  initialMunicipalityIds: number[] = [],
  initialCategories: string[] = [],
  initialAduType: string = '',
  initialExpandedSearch: boolean = false
) {
  const [query, setQuery] = useState(initialQuery)
  const [searchTypes, setSearchTypes] = useState(initialTypes)
  const [limit, setLimit] = useState(initialLimit)
  const [offset, setOffset] = useState(initialOffset)
  const [municipalityIds, setMunicipalityIds] = useState(initialMunicipalityIds)
  const [categories, setCategories] = useState(initialCategories)
  const [aduType, setAduType] = useState(initialAduType)
  const [expandedSearch, setExpandedSearch] = useState(initialExpandedSearch)

  const searchQuery = useQuery({
    queryKey: globalSearchKeys.search(query, searchTypes, limit, offset, municipalityIds, categories, aduType, expandedSearch),
    queryFn: () => {
      console.log('🚀 FETCH TRIGGERED:', { query, municipalityIds, limit, offset, expandedSearch })
      return fetchGlobalSearch(query, searchTypes, limit, offset, municipalityIds, categories, aduType, expandedSearch)
    },
    enabled: query.length >= 2, // Only search with 2+ characters
    staleTime: 1000 * 60 * 2, // 2 minutes cache - increased from 30 seconds
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes - increased from 5
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch if data exists
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
  
  const updateCategories = (newCategories: string[]) => {
    setCategories(newCategories)
    setOffset(0) // Reset to first page when changing filter
  }
  
  const updateAduType = (newAduType: string) => {
    setAduType(newAduType)
    setOffset(0) // Reset to first page when changing filter
  }
  
  const updateExpandedSearch = (enabled: boolean) => {
    setExpandedSearch(enabled)
    setOffset(0) // Reset to first page when changing search type
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
    categories,
    aduType,
    search,
    updateTypes,
    updateLimit,
    updateOffset,
    updateMunicipalityIds,
    updateCategories,
    updateAduType,
    updateExpandedSearch,
    nextPage,
    prevPage,
    clearSearch,
    // Convenience getters - force boolean values to prevent undefined
    hasResults: Boolean(searchQuery.data?.meta?.total && searchQuery.data.meta.total > 0),
    totalResults: searchQuery.data?.meta?.total || 0,
    documents: searchQuery.data?.results?.documents || [],
    municipalities: searchQuery.data?.results?.municipalities || [],
    scrapers: searchQuery.data?.results?.scrapers || [],
    keywords: searchQuery.data?.results?.keywords || [],
    municipalityCounts: searchQuery.data?.results?.municipalityCounts || [],
    // Pagination info - force boolean values to prevent undefined
    totalDocuments: searchQuery.data?.meta?.pagination?.documentsTotal === -1 ? -1 : (searchQuery.data?.meta?.pagination?.documentsTotal || 0),
    currentPage: Math.floor(offset / limit) + 1,
    totalPages: searchQuery.data?.meta?.pagination?.documentsTotal === -1 
      ? 0 // Unknown total
      : Math.ceil((searchQuery.data?.meta?.pagination?.documentsTotal || 0) / limit),
    hasNextPage: Boolean(searchQuery.data?.meta?.pagination?.hasMore),
    hasPrevPage: offset > 0,
  }
}

// Simple search hook for quick searches (like in a navbar)
export function useQuickSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: globalSearchKeys.search(query, ['documents', 'municipalities'], 5, 0, [], [], '', false),
    queryFn: () => fetchGlobalSearch(query, ['documents', 'municipalities'], 5, 0, [], [], '', false),
    enabled: enabled && query.length >= 2,
    staleTime: 1000 * 30
  })
}