
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { 
  PdfDocument, 
  DocumentSearchParams,
  PaginatedResponse,
  DocumentId,
  MunicipalityId
} from "@/types/database"

// Query key factory
const documentKeys = {
  all: ['documents'] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (params: DocumentSearchParams) => [...documentKeys.lists(), params] as const,
  details: () => [...documentKeys.all, 'detail'] as const,
  detail: (id: DocumentId) => [...documentKeys.details(), id] as const,
  byMunicipality: (municipalityId: MunicipalityId) => [...documentKeys.all, 'municipality', municipalityId] as const,
  favorites: () => [...documentKeys.all, 'favorites'] as const,
  search: (query: string) => [...documentKeys.all, 'search', query] as const,
}

// Fetch documents list
async function fetchDocuments(params: DocumentSearchParams = {}): Promise<PaginatedResponse<PdfDocument>> {
  const searchParams = new URLSearchParams()
  
  if (params.page) searchParams.set('page', params.page.toString())
  if (params.limit) searchParams.set('limit', params.limit.toString())
  if (params.search) searchParams.set('search', params.search)
  if (params.searchType) searchParams.set('searchType', params.searchType)
  if (params.municipalityId) searchParams.set('municipalityId', params.municipalityId.toString())
  if (params.isAduRelevant !== undefined) searchParams.set('isAduRelevant', params.isAduRelevant.toString())
  if (params.isAnalyzed !== undefined) searchParams.set('isAnalyzed', params.isAnalyzed.toString())
  if (params.isFavorited !== undefined) searchParams.set('isFavorited', params.isFavorited.toString())
  if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom)
  if (params.dateTo) searchParams.set('dateTo', params.dateTo)
  if (params.minConfidence) searchParams.set('minConfidence', params.minConfidence.toString())
  if (params.maxConfidence) searchParams.set('maxConfidence', params.maxConfidence.toString())
  if (params.downloadStatus) searchParams.set('downloadStatus', params.downloadStatus)
  if (params.extractionStatus) searchParams.set('extractionStatus', params.extractionStatus)
  if (params.analysisStatus) searchParams.set('analysisStatus', params.analysisStatus)
  if (params.sort) searchParams.set('sort', params.sort)
  if (params.order) searchParams.set('order', params.order)

  const response = await fetch(`/api/documents?${searchParams}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch documents: ${response.statusText}`)
  }
  
  return response.json()
}

// Fetch single document
async function fetchDocument(id: DocumentId): Promise<PdfDocument> {
  const response = await fetch(`/api/documents/${id}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.statusText}`)
  }
  
  return response.json()
}

// Update document
async function updateDocument({ id, data }: { id: DocumentId; data: Partial<PdfDocument> }): Promise<PdfDocument> {
  const response = await fetch(`/api/documents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update document')
  }
  
  const result = await response.json()
  return result.data
}

// Toggle document favorite
async function toggleDocumentFavorite(id: DocumentId): Promise<PdfDocument> {
  const response = await fetch(`/api/documents/${id}/favorite`, {
    method: 'POST',
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to toggle favorite')
  }
  
  const result = await response.json()
  return result.data
}

// Search documents
async function searchDocuments(query: string, filters?: Omit<DocumentSearchParams, 'search'>): Promise<PaginatedResponse<PdfDocument>> {
  const params: DocumentSearchParams = { ...filters, search: query }
  return fetchDocuments(params)
}

// Get documents by municipality
async function fetchDocumentsByMunicipality(municipalityId: MunicipalityId, limit = 50): Promise<PdfDocument[]> {
  const response = await fetch(`/api/municipalities/${municipalityId}/documents?limit=${limit}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch documents for municipality: ${response.statusText}`)
  }
  
  const result = await response.json()
  return result.data
}

// Get favorite documents
async function fetchFavoriteDocuments(): Promise<PdfDocument[]> {
  const response = await fetch('/api/documents/favorites')
  
  if (!response.ok) {
    throw new Error(`Failed to fetch favorite documents: ${response.statusText}`)
  }
  
  const result = await response.json()
  return result.data
}

// Custom hooks
export function useDocuments(params: DocumentSearchParams = {}) {
  return useQuery({
    queryKey: documentKeys.list(params),
    queryFn: () => fetchDocuments(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useDocument(id: DocumentId) {
  return useQuery({
    queryKey: documentKeys.detail(id),
    queryFn: () => fetchDocument(id),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useDocumentsByMunicipality(municipalityId: MunicipalityId, limit = 50) {
  return useQuery({
    queryKey: documentKeys.byMunicipality(municipalityId),
    queryFn: () => fetchDocumentsByMunicipality(municipalityId, limit),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useFavoriteDocuments() {
  return useQuery({
    queryKey: documentKeys.favorites(),
    queryFn: fetchFavoriteDocuments,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

export function useUpdateDocument() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: updateDocument,
    onSuccess: (data, variables) => {
      // Update the document in the cache
      queryClient.setQueryData(documentKeys.detail(variables.id), data)
      // Invalidate lists to ensure they're updated
      queryClient.invalidateQueries({ queryKey: documentKeys.lists() })
      // Also invalidate municipality documents if this document belongs to one
      if (data.municipality_id) {
        queryClient.invalidateQueries({ 
          queryKey: documentKeys.byMunicipality(data.municipality_id) 
        })
      }
    },
  })
}

export function useToggleDocumentFavorite() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: toggleDocumentFavorite,
    onMutate: async (documentId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: documentKeys.lists() })
      await queryClient.cancelQueries({ queryKey: documentKeys.detail(documentId) })
      
      // Get all list queries and update them optimistically
      const queryCache = queryClient.getQueryCache()
      const queries = queryCache.findAll({ queryKey: documentKeys.lists() })
      
      const previousData: any[] = []
      
      queries.forEach((query) => {
        const oldData = query.state.data as PaginatedResponse<PdfDocument> | undefined
        if (oldData?.data) {
          previousData.push({ queryKey: query.queryKey, data: oldData })
          
          const newData = {
            ...oldData,
            data: oldData.data.map((doc) =>
              doc.id === documentId ? { ...doc, is_favorited: !doc.is_favorited } : doc
            ),
          }
          
          queryClient.setQueryData(query.queryKey, newData)
        }
      })
      
      return { previousData }
    },
    onError: (err, documentId, context) => {
      // Rollback on error
      if (context?.previousData) {
        context.previousData.forEach(({ queryKey, data }) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
    },
    onSuccess: (data) => {
      // Update with the actual data from the server
      const queryCache = queryClient.getQueryCache()
      const queries = queryCache.findAll({ queryKey: documentKeys.lists() })
      
      queries.forEach((query) => {
        const oldData = query.state.data as PaginatedResponse<PdfDocument> | undefined
        if (oldData?.data && data) {
          const newData = {
            ...oldData,
            data: oldData.data.map((doc) =>
              doc.id === data.id ? { ...doc, is_favorited: data.is_favorited } : doc
            ),
          }
          queryClient.setQueryData(query.queryKey, newData)
        }
      })
    },
    onSettled: () => {
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: documentKeys.favorites() })
    },
  })
}

// Document search hook
export function useDocumentSearch(initialQuery: string = '', initialSearchType: 'basic' | 'fulltext' = 'basic') {
  const [searchParams, setSearchParams] = useState<DocumentSearchParams>({
    page: 1,
    limit: 50, // Higher limit for better search results
    search: initialQuery,
    searchType: initialSearchType,
    sort: 'date_found',
    order: 'desc',
  })

  const query = useDocuments(searchParams)

  const updateSearch = (newParams: Partial<DocumentSearchParams>) => {
    setSearchParams(prev => ({
      ...prev,
      ...newParams,
      // Reset to page 1 when search parameters change (except page itself)
      page: (newParams.search !== prev.search || 
             newParams.municipalityId !== prev.municipalityId ||
             newParams.isAduRelevant !== prev.isAduRelevant) && 
             !('page' in newParams) ? 1 : (newParams.page ?? prev.page),
    }))
  }

  const resetSearch = () => {
    setSearchParams({
      page: 1,
      limit: 20,
      sort: 'date_found',
      order: 'desc',
    })
  }

  return {
    ...query,
    searchParams,
    updateSearch,
    resetSearch,
    // Convenience methods
    setSearch: (search: string) => updateSearch({ search }),
    setSearchType: (searchType: 'basic' | 'fulltext') => updateSearch({ searchType }),
    setMunicipality: (municipalityId: MunicipalityId | undefined) => updateSearch({ municipalityId }),
    setRelevanceFilter: (isAduRelevant: boolean | undefined) => updateSearch({ isAduRelevant }),
    setAnalyzedFilter: (isAnalyzed: boolean | undefined) => updateSearch({ isAnalyzed }),
    setFavoritesFilter: (isFavorited: boolean | undefined) => updateSearch({ isFavorited }),
    setDateRange: (dateFrom?: string, dateTo?: string) => updateSearch({ dateFrom, dateTo }),
    setConfidenceRange: (minConfidence?: number, maxConfidence?: number) => updateSearch({ minConfidence, maxConfidence }),
    setPipelineStatusFilter: (downloadStatus?: DownloadStatus, extractionStatus?: ExtractionStatus, analysisStatus?: AnalysisStatus) => 
      updateSearch({ downloadStatus, extractionStatus, analysisStatus }),
    setPage: (page: number) => updateSearch({ page }),
    setLimit: (limit: number) => updateSearch({ limit }),
    setSorting: (sort: string, order: 'asc' | 'desc') => updateSearch({ sort, order }),
  }
}

// Advanced search hook
export function useAdvancedDocumentSearch() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Omit<DocumentSearchParams, 'search'>>({
    page: 1,
    limit: 20,
    searchType: 'fulltext',
    sort: 'relevance',
    order: 'desc',
  })

  const searchQuery = useQuery({
    queryKey: documentKeys.search(query),
    queryFn: () => searchDocuments(query, filters),
    enabled: query.length > 0,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })

  const updateFilters = (newFilters: Partial<typeof filters>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      // Reset to page 1 when filters change
      page: 1,
    }))
  }

  const search = (searchQuery: string) => {
    setQuery(searchQuery)
    setFilters(prev => ({ ...prev, page: 1 }))
  }

  const clearSearch = () => {
    setQuery('')
    setFilters({
      page: 1,
      limit: 20,
      sort: 'relevance',
      order: 'desc',
    })
  }

  return {
    ...searchQuery,
    query,
    filters,
    search,
    updateFilters,
    clearSearch,
    setPage: (page: number) => setFilters(prev => ({ ...prev, page })),
    setSearchType: (searchType: 'basic' | 'fulltext') => setFilters(prev => ({ ...prev, searchType })),
  }
}

// Start processing for specific documents
async function startDocumentProcessing(
  documentIds: DocumentId[],
  operation: 'extract' | 'analyze'
): Promise<any> {
  const response = await fetch('/api/processing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation,
      documentIds,
      options: {
        priority: 'normal',
        skipExisting: false,
        retryFailedJobs: true,
        validateResults: true,
        batchSize: operation === 'analyze' ? 5 : 10
      }
    })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || `Failed to start ${operation} processing`)
  }
  
  return response.json()
}

// Get processing status for documents
async function getDocumentProcessingStatus(documentIds: DocumentId[]): Promise<any> {
  const response = await fetch('/api/processing/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentIds })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get processing status')
  }
  
  return response.json()
}

// Bulk operations API (legacy support)
async function executeBulkOperation(
  operation: 'extract' | 'analyze' | 'export' | 'delete' | 'archive',
  documentIds: DocumentId[]
) {
  // For extract and analyze operations, use the new processing framework
  if (operation === 'extract' || operation === 'analyze') {
    return startDocumentProcessing(documentIds, operation)
  }
  
  // For other operations, still use the old endpoint for now
  const response = await fetch('/api/documents/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, documentIds }),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || `Failed to execute ${operation} operation`)
  }
  
  return response.json()
}

// Bulk operations hook
export function useBulkDocumentOperations() {
  const queryClient = useQueryClient()
  
  const bulkUpdate = useMutation({
    mutationFn: async ({ ids, data }: { ids: DocumentId[]; data: Partial<PdfDocument> }) => {
      const responses = await Promise.allSettled(
        ids.map(id => updateDocument({ id, data }))
      )
      
      const failures = responses
        .map((result, index) => ({ result, id: ids[index] }))
        .filter(({ result }) => result.status === 'rejected')
      
      if (failures.length > 0) {
        throw new Error(`Failed to update ${failures.length} documents`)
      }
      
      return responses.map(result => 
        result.status === 'fulfilled' ? result.value : null
      ).filter(Boolean) as PdfDocument[]
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
    },
  })

  const bulkFavorite = useMutation({
    mutationFn: async ({ ids, favorite }: { ids: DocumentId[]; favorite: boolean }) => {
      const responses = await Promise.allSettled(
        ids.map(id => updateDocument({ id, data: { is_favorited: favorite } }))
      )
      
      const failures = responses
        .map((result, index) => ({ result, id: ids[index] }))
        .filter(({ result }) => result.status === 'rejected')
      
      if (failures.length > 0) {
        throw new Error(`Failed to update ${failures.length} documents`)
      }
      
      return responses.map(result => 
        result.status === 'fulfilled' ? result.value : null
      ).filter(Boolean) as PdfDocument[]
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
      queryClient.invalidateQueries({ queryKey: documentKeys.favorites() })
    },
  })

  const bulkExtract = useMutation({
    mutationFn: (documentIds: DocumentId[]) => startDocumentProcessing(documentIds, 'extract'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
    },
    onError: (error) => {
      console.error('Bulk extraction failed:', error)
    }
  })

  const bulkAnalyze = useMutation({
    mutationFn: (documentIds: DocumentId[]) => startDocumentProcessing(documentIds, 'analyze'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
    },
    onError: (error) => {
      console.error('Bulk analysis failed:', error)
    }
  })

  const bulkExport = useMutation({
    mutationFn: (documentIds: DocumentId[]) => executeBulkOperation('export', documentIds),
  })

  const bulkDelete = useMutation({
    mutationFn: (documentIds: DocumentId[]) => executeBulkOperation('delete', documentIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
    },
  })

  const bulkArchive = useMutation({
    mutationFn: (documentIds: DocumentId[]) => executeBulkOperation('archive', documentIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
    },
  })

  return {
    bulkUpdate,
    bulkFavorite,
    bulkExtract,
    bulkAnalyze,
    bulkExport,
    bulkDelete,
    bulkArchive,
    // Processing status helpers
    getProcessingStatus: (documentIds: DocumentId[]) => 
      getDocumentProcessingStatus(documentIds),
    startExtraction: (documentIds: DocumentId[]) => 
      startDocumentProcessing(documentIds, 'extract'),
    startAnalysis: (documentIds: DocumentId[]) => 
      startDocumentProcessing(documentIds, 'analyze'),
  }
}

// Hook for tracking document processing status
export function useDocumentProcessingStatus(documentIds: DocumentId[]) {
  return useQuery({
    queryKey: [...documentKeys.all, 'processing-status', documentIds],
    queryFn: () => getDocumentProcessingStatus(documentIds),
    enabled: documentIds.length > 0,
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 1000, // Consider data stale after 1 second
  })
}

// Hook for pipeline filtering
export function usePipelineFilter() {
  const [filter, setFilter] = useState<{
    stage?: 'scraping' | 'extraction' | 'analysis'
    status?: 'pending' | 'processing' | 'completed' | 'failed'
  }>({})

  const applyFilter = (params: DocumentSearchParams) => {
    const filtered = { ...params }
    
    if (filter.stage && filter.status) {
      switch (filter.stage) {
        case 'scraping':
          filtered.downloadStatus = filter.status === 'completed' ? 'downloaded' : 
                                   filter.status === 'processing' ? 'downloading' :
                                   filter.status === 'failed' ? 'error' : 'pending'
          break
        case 'extraction':
          filtered.extractionStatus = filter.status as any
          break
        case 'analysis':
          filtered.analysisStatus = filter.status as any
          break
      }
    }
    
    return filtered
  }
  
  return {
    filter,
    setFilter,
    applyFilter,
    clearFilter: () => setFilter({}),
    
    // Convenience setters
    setPendingExtraction: () => setFilter({ stage: 'extraction', status: 'pending' }),
    setProcessingExtraction: () => setFilter({ stage: 'extraction', status: 'processing' }),
    setCompletedExtraction: () => setFilter({ stage: 'extraction', status: 'completed' }),
    setFailedExtraction: () => setFilter({ stage: 'extraction', status: 'failed' }),
    
    setPendingAnalysis: () => setFilter({ stage: 'analysis', status: 'pending' }),
    setProcessingAnalysis: () => setFilter({ stage: 'analysis', status: 'processing' }),
    setCompletedAnalysis: () => setFilter({ stage: 'analysis', status: 'completed' }),
    setFailedAnalysis: () => setFilter({ stage: 'analysis', status: 'failed' }),
  }
}