
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { 
  Municipality, 
  MunicipalitySearchParams,
  PaginatedResponse,
  MunicipalityInsert,
  MunicipalityUpdate,
  MunicipalityId
} from "@/types/database"

// Query key factory
const municipalityKeys = {
  all: ['municipalities'] as const,
  lists: () => [...municipalityKeys.all, 'list'] as const,
  list: (params: MunicipalitySearchParams) => [...municipalityKeys.lists(), params] as const,
  details: () => [...municipalityKeys.all, 'detail'] as const,
  detail: (id: MunicipalityId) => [...municipalityKeys.details(), id] as const,
  stats: (id: MunicipalityId) => [...municipalityKeys.detail(id), 'stats'] as const,
}

// Fetch municipalities list
async function fetchMunicipalities(params: MunicipalitySearchParams & { source?: 'all' | 'client' | 'scraped' } = {}): Promise<PaginatedResponse<Municipality>> {
  const searchParams = new URLSearchParams()
  
  if (params.page) searchParams.set('page', params.page.toString())
  if (params.limit) searchParams.set('limit', params.limit.toString())
  if (params.search) searchParams.set('search', params.search)
  if (params.status) searchParams.set('status', params.status)
  if (params.hasDocuments) searchParams.set('hasDocuments', 'true')
  if (params.scheduledOnly) searchParams.set('scheduledOnly', 'true')
  if (params.sort) searchParams.set('sort', params.sort)
  if (params.order) searchParams.set('order', params.order)
  if (params.source) searchParams.set('source', params.source)

  const response = await fetch(`/api/municipalities?${searchParams}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch municipalities: ${response.statusText}`)
  }
  
  return response.json()
}

// Fetch single municipality
async function fetchMunicipality(id: MunicipalityId): Promise<Municipality> {
  const response = await fetch(`/api/municipalities/${id}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch municipality: ${response.statusText}`)
  }
  
  return response.json()
}

// Create municipality
async function createMunicipality(data: MunicipalityInsert): Promise<Municipality> {
  const response = await fetch('/api/municipalities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create municipality')
  }
  
  const result = await response.json()
  return result.data
}

// Update municipality
async function updateMunicipality({ id, data }: { id: MunicipalityId; data: MunicipalityUpdate }): Promise<Municipality> {
  const response = await fetch(`/api/municipalities/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update municipality')
  }
  
  const result = await response.json()
  return result.data
}

// Update municipality scraper assignment
async function updateMunicipalityScraperAssignment({ 
  id, 
  scraperName 
}: { 
  id: MunicipalityId; 
  scraperName: string | null 
}): Promise<Municipality> {
  const response = await fetch(`/api/municipalities/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      scraper_name: scraperName,
      updated_at: new Date().toISOString()
    }),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update scraper assignment')
  }
  
  const result = await response.json()
  return result.data
}

// Bulk update scraper assignments
async function bulkUpdateScraperAssignments({
  assignments
}: {
  assignments: Array<{ id: MunicipalityId; scraperName: string | null }>
}): Promise<Municipality[]> {
  const responses = await Promise.allSettled(
    assignments.map(({ id, scraperName }) => 
      updateMunicipalityScraperAssignment({ id, scraperName })
    )
  )
  
  const failures = responses
    .map((result, index) => ({ result, assignment: assignments[index] }))
    .filter(({ result }) => result.status === 'rejected')
  
  if (failures.length > 0) {
    throw new Error(`Failed to update ${failures.length} scraper assignments`)
  }
  
  return responses.map(result => 
    result.status === 'fulfilled' ? result.value : null
  ).filter(Boolean) as Municipality[]
}

// Delete municipality
async function deleteMunicipality(id: MunicipalityId): Promise<void> {
  const response = await fetch(`/api/municipalities/${id}`, {
    method: 'DELETE',
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete municipality')
  }
}

// Custom hooks
export function useMunicipalities(params: MunicipalitySearchParams & { source?: 'all' | 'client' | 'scraped' } = {}) {
  return useQuery({
    queryKey: [...municipalityKeys.list(params), params.source || 'client', 'v3'], // Include source in key for proper refetch
    queryFn: () => fetchMunicipalities(params),
    staleTime: 0, // Disable cache temporarily to ensure fresh data
  })
}

export function useMunicipality(id: MunicipalityId) {
  return useQuery({
    queryKey: municipalityKeys.detail(id),
    queryFn: () => fetchMunicipality(id),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useCreateMunicipality() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: createMunicipality,
    onSuccess: () => {
      // Invalidate and refetch municipalities list
      queryClient.invalidateQueries({ queryKey: municipalityKeys.lists() })
    },
  })
}

export function useUpdateMunicipality() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: updateMunicipality,
    onSuccess: (data, variables) => {
      // Update the municipality in the cache
      queryClient.setQueryData(municipalityKeys.detail(variables.id), data)
      // Invalidate lists to ensure they're updated
      queryClient.invalidateQueries({ queryKey: municipalityKeys.lists() })
    },
  })
}

export function useDeleteMunicipality() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: deleteMunicipality,
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: municipalityKeys.detail(id) })
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: municipalityKeys.lists() })
    },
  })
}

/**
 * Hook to update municipality scraper assignment
 */
export function useUpdateScraperAssignment() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: updateMunicipalityScraperAssignment,
    onSuccess: (data, variables) => {
      // Update the municipality in the cache
      queryClient.setQueryData(municipalityKeys.detail(variables.id), data)
      // Invalidate lists to ensure they're updated
      queryClient.invalidateQueries({ queryKey: municipalityKeys.lists() })
      // Also invalidate scrapers list as assignments affect scraper status
      queryClient.invalidateQueries({ queryKey: ['scrapers'] })
    },
  })
}

/**
 * Hook for bulk scraper assignment updates
 */
export function useBulkUpdateScraperAssignments() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: bulkUpdateScraperAssignments,
    onSuccess: (updatedMunicipalities, variables) => {
      // Update individual municipalities in cache
      updatedMunicipalities.forEach(municipality => {
        queryClient.setQueryData(municipalityKeys.detail(municipality.id), municipality)
      })
      
      // Invalidate lists and scrapers
      queryClient.invalidateQueries({ queryKey: municipalityKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['scrapers'] })
    },
  })
}

// Search hook
export function useMunicipalitySearch() {
  const [searchParams, setSearchParams] = useState<MunicipalitySearchParams>({
    page: 1,
    limit: 100, // Show more municipalities by default
    sort: 'name',
    order: 'asc',
  })

  const query = useMunicipalities(searchParams)

  const updateSearch = (newParams: Partial<MunicipalitySearchParams>) => {
    setSearchParams(prev => ({
      ...prev,
      ...newParams,
      // Reset to page 1 when search parameters change
      page: newParams.search !== prev.search || newParams.status !== prev.status ? 1 : prev.page,
    }))
  }

  const resetSearch = () => {
    setSearchParams({
      page: 1,
      sort: 'name',
      order: 'asc',
    })
  }

  return {
    ...query,
    searchParams,
    updateSearch,
    resetSearch,
    // Convenience methods
    setSearch: (search: string) => updateSearch({ search }),
    setStatus: (status: MunicipalitySearchParams['status']) => updateSearch({ status }),
    setPage: (page: number) => updateSearch({ page }),
    setLimit: (limit: number) => updateSearch({ limit }),
    setSorting: (sort: string, order: 'asc' | 'desc') => updateSearch({ sort, order }),
  }
}

// Bulk operations hook
export function useBulkMunicipalityOperations() {
  const queryClient = useQueryClient()
  
  const bulkUpdate = useMutation({
    mutationFn: async ({ ids, data }: { ids: MunicipalityId[]; data: MunicipalityUpdate }) => {
      const responses = await Promise.allSettled(
        ids.map(id => updateMunicipality({ id, data }))
      )
      
      const failures = responses
        .map((result, index) => ({ result, id: ids[index] }))
        .filter(({ result }) => result.status === 'rejected')
      
      if (failures.length > 0) {
        throw new Error(`Failed to update ${failures.length} municipalities`)
      }
      
      return responses.map(result => 
        result.status === 'fulfilled' ? result.value : null
      ).filter(Boolean) as Municipality[]
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: municipalityKeys.all })
    },
  })

  const bulkDelete = useMutation({
    mutationFn: async (ids: MunicipalityId[]) => {
      const responses = await Promise.allSettled(
        ids.map(id => deleteMunicipality(id))
      )
      
      const failures = responses
        .map((result, index) => ({ result, id: ids[index] }))
        .filter(({ result }) => result.status === 'rejected')
      
      if (failures.length > 0) {
        throw new Error(`Failed to delete ${failures.length} municipalities`)
      }
      
      return ids
    },
    onSuccess: (ids) => {
      // Remove all deleted items from cache
      ids.forEach(id => {
        queryClient.removeQueries({ queryKey: municipalityKeys.detail(id) })
      })
      queryClient.invalidateQueries({ queryKey: municipalityKeys.lists() })
    },
  })

  // Bulk scraper assignment operations
  const bulkAssignScrapers = useBulkUpdateScraperAssignments()

  const bulkUnassignScrapers = useMutation({
    mutationFn: async (ids: MunicipalityId[]) => {
      const assignments = ids.map(id => ({ id, scraperName: null }))
      return bulkUpdateScraperAssignments({ assignments })
    },
    onSuccess: (updatedMunicipalities) => {
      // Update individual municipalities in cache
      updatedMunicipalities.forEach(municipality => {
        queryClient.setQueryData(municipalityKeys.detail(municipality.id), municipality)
      })
      
      // Invalidate lists and scrapers
      queryClient.invalidateQueries({ queryKey: municipalityKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['scrapers'] })
    },
  })

  return {
    bulkUpdate,
    bulkDelete,
    bulkAssignScrapers,
    bulkUnassignScrapers,
  }
}

/**
 * Comprehensive hook for managing municipality-scraper assignments
 */
export function useScraperAssignmentManager() {
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<MunicipalityId[]>([])
  const [selectedScraper, setSelectedScraper] = useState<string | null>(null)
  
  const municipalities = useMunicipalities()
  const updateAssignment = useUpdateScraperAssignment()
  const bulkOperations = useBulkMunicipalityOperations()
  
  // Helper functions for getting municipality-scraper relationships
  const getUnassignedMunicipalities = () => 
    municipalities.data?.data?.filter(m => !m.scraper_name) || []
  
  const getAssignedMunicipalities = () =>
    municipalities.data?.data?.filter(m => m.scraper_name) || []
  
  const getMunicipalitiesByScraperName = (scraperName: string) =>
    municipalities.data?.data?.filter(m => m.scraper_name === scraperName) || []
  
  const getUniqueScraperNames = () => {
    const scraperNames = municipalities.data?.data
      ?.map(m => m.scraper_name)
      .filter(Boolean) as string[]
    return Array.from(new Set(scraperNames)).sort()
  }
  
  // Assignment operations
  const assignScraper = async (municipalityId: MunicipalityId, scraperName: string) => {
    return updateAssignment.mutateAsync({ id: municipalityId, scraperName })
  }
  
  const unassignScraper = async (municipalityId: MunicipalityId) => {
    return updateAssignment.mutateAsync({ id: municipalityId, scraperName: null })
  }
  
  const assignScraperToSelected = async (scraperName: string) => {
    if (selectedMunicipalities.length === 0) {
      throw new Error('No municipalities selected')
    }
    
    const assignments = selectedMunicipalities.map(id => ({ id, scraperName }))
    return bulkOperations.bulkAssignScrapers.mutateAsync({ assignments })
  }
  
  const unassignSelectedScrapers = async () => {
    if (selectedMunicipalities.length === 0) {
      throw new Error('No municipalities selected')
    }
    
    return bulkOperations.bulkUnassignScrapers.mutateAsync(selectedMunicipalities)
  }
  
  const reassignScraper = async (fromScraperName: string, toScraperName: string) => {
    const municipalitiesToReassign = getMunicipalitiesByScraperName(fromScraperName)
    const assignments = municipalitiesToReassign.map(m => ({ id: m.id, scraperName: toScraperName }))
    
    if (assignments.length === 0) {
      throw new Error(`No municipalities found with scraper: ${fromScraperName}`)
    }
    
    return bulkOperations.bulkAssignScrapers.mutateAsync({ assignments })
  }
  
  // Selection helpers
  const selectUnassigned = () => {
    const unassigned = getUnassignedMunicipalities()
    setSelectedMunicipalities(unassigned.map(m => m.id))
  }
  
  const selectByScraperName = (scraperName: string) => {
    const municipalities = getMunicipalitiesByScraperName(scraperName)
    setSelectedMunicipalities(municipalities.map(m => m.id))
  }
  
  const selectAll = () => {
    setSelectedMunicipalities(municipalities.data?.data?.map(m => m.id) || [])
  }
  
  const selectNone = () => {
    setSelectedMunicipalities([])
  }
  
  const toggleMunicipality = (id: MunicipalityId) => {
    setSelectedMunicipalities(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
  }
  
  // Statistics
  const getAssignmentStats = () => {
    const allMunicipalities = municipalities.data?.data || []
    const assigned = getAssignedMunicipalities()
    const unassigned = getUnassignedMunicipalities()
    const uniqueScrapers = getUniqueScraperNames()
    
    return {
      total: allMunicipalities.length,
      assigned: assigned.length,
      unassigned: unassigned.length,
      assignmentRate: allMunicipalities.length > 0 
        ? Math.round((assigned.length / allMunicipalities.length) * 100) 
        : 0,
      uniqueScrapers: uniqueScrapers.length,
      scraperNames: uniqueScrapers
    }
  }
  
  return {
    // Data
    municipalities: municipalities.data?.data || [],
    unassignedMunicipalities: getUnassignedMunicipalities(),
    assignedMunicipalities: getAssignedMunicipalities(),
    uniqueScraperNames: getUniqueScraperNames(),
    selectedMunicipalities,
    selectedScraper,
    assignmentStats: getAssignmentStats(),
    
    // Loading states
    isLoading: municipalities.isLoading,
    isUpdating: updateAssignment.isPending || bulkOperations.bulkAssignScrapers.isPending || bulkOperations.bulkUnassignScrapers.isPending,
    
    // Actions
    setSelectedMunicipalities,
    setSelectedScraper,
    assignScraper,
    unassignScraper,
    assignScraperToSelected,
    unassignSelectedScrapers,
    reassignScraper,
    
    // Selection helpers
    selectUnassigned,
    selectByScraperName,
    selectAll,
    selectNone,
    toggleMunicipality,
    
    // Utilities
    getMunicipalitiesByScraperName,
    hasSelection: selectedMunicipalities.length > 0,
    refetch: municipalities.refetch,
    
    // Bulk operations
    bulkOperations: {
      assignScrapers: bulkOperations.bulkAssignScrapers,
      unassignScrapers: bulkOperations.bulkUnassignScrapers,
    }
  }
}