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
}

interface GlobalSearchResponse {
  query: string
  results: GlobalSearchResult
  meta: {
    duration: number
    types: string[]
    total: number
  }
}

// Fetch global search results
async function fetchGlobalSearch(
  query: string, 
  types: ('documents' | 'municipalities' | 'scrapers' | 'keywords')[] = ['documents', 'municipalities', 'scrapers', 'keywords'],
  limit = 100
): Promise<GlobalSearchResponse> {
  const searchParams = new URLSearchParams()
  searchParams.set('q', query)
  searchParams.set('limit', limit.toString())
  types.forEach(type => searchParams.append('types[]', type))

  const response = await fetch(`/api/search/global?${searchParams}`)
  
  if (!response.ok) {
    throw new Error(`Failed to search: ${response.statusText}`)
  }
  
  return await response.json()
}

// Query key factory for global search
const globalSearchKeys = {
  all: ['global-search'] as const,
  search: (query: string, types: string[], limit: number) => [...globalSearchKeys.all, query, types, limit] as const,
}

// Global search hook
export function useGlobalSearch(
  initialQuery: string = '',
  initialTypes: ('documents' | 'municipalities' | 'scrapers' | 'keywords')[] = ['documents', 'municipalities', 'scrapers', 'keywords'],
  initialLimit: number = 100
) {
  const [query, setQuery] = useState(initialQuery)
  const [searchTypes, setSearchTypes] = useState(initialTypes)
  const [limit, setLimit] = useState(initialLimit)

  const searchQuery = useQuery({
    queryKey: globalSearchKeys.search(query, searchTypes, limit),
    queryFn: () => fetchGlobalSearch(query, searchTypes, limit),
    enabled: query.length >= 2, // Only search with 2+ characters
    staleTime: 1000 * 30, // 30 seconds - shorter for search results
  })

  const search = (searchQuery: string) => {
    setQuery(searchQuery.trim())
  }

  const updateTypes = (types: typeof searchTypes) => {
    setSearchTypes(types)
  }

  const updateLimit = (newLimit: number) => {
    setLimit(newLimit)
  }

  const clearSearch = () => {
    setQuery('')
  }

  return {
    ...searchQuery,
    query,
    searchTypes,
    limit,
    search,
    updateTypes,
    updateLimit,
    clearSearch,
    // Convenience getters
    hasResults: searchQuery.data && searchQuery.data.meta.total > 0,
    totalResults: searchQuery.data?.meta.total || 0,
    documents: searchQuery.data?.results.documents || [],
    municipalities: searchQuery.data?.results.municipalities || [],
    scrapers: searchQuery.data?.results.scrapers || [],
    keywords: searchQuery.data?.results.keywords || [],
  }
}

// Simple search hook for quick searches (like in a navbar)
export function useQuickSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: globalSearchKeys.search(query, ['documents', 'municipalities', 'scrapers'], 5),
    queryFn: () => fetchGlobalSearch(query, ['documents', 'municipalities', 'scrapers'], 5),
    enabled: enabled && query.length >= 2,
    staleTime: 1000 * 30,
  })
}