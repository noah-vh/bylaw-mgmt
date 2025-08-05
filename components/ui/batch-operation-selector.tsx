"use client"

import * as React from "react"
import { Check, ChevronDown, Search, Filter, X, Calendar, Database, MapPin } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

type MunicipalityStatus = "active" | "inactive" | "error" | "pending" | "updating"
type ScraperType = "v1" | "v2" | "enhanced" | "ajax" | "custom"

interface Municipality {
  id: string
  name: string
  status: MunicipalityStatus
  scraperType: ScraperType
  lastUpdated: Date
  documentsCount?: number
  region?: string
  population?: number
}

interface FilterCriteria {
  status?: MunicipalityStatus[]
  scraperType?: ScraperType[]
  region?: string[]
  lastUpdatedDays?: number
  minDocuments?: number
  searchQuery?: string
}

const statusVariants = cva(
  "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
  {
    variants: {
      status: {
        active: "bg-accent-success/10 text-accent-success",
        inactive: "bg-muted text-muted-foreground",
        error: "bg-accent-error/10 text-accent-error",
        pending: "bg-accent-warning/10 text-accent-warning",
        updating: "bg-accent-info/10 text-accent-info",
      },
    },
  }
)

const getStatusIcon = (status: MunicipalityStatus) => {
  switch (status) {
    case "active":
      return "●"
    case "inactive":
      return "○"
    case "error":
      return "⚠"
    case "pending":
      return "⏳"
    case "updating":
      return "↻"
    default:
      return "○"
  }
}

const formatLastUpdated = (date: Date) => {
  const now = new Date()
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
  
  if (diffInHours < 1) return "Just now"
  if (diffInHours < 24) return `${diffInHours}h ago`
  
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) return `${diffInDays}d ago`
  
  const diffInWeeks = Math.floor(diffInDays / 7)
  if (diffInWeeks < 4) return `${diffInWeeks}w ago`
  
  return date.toLocaleDateString()
}

interface BatchOperationSelectorProps {
  municipalities: Municipality[]
  selectedIds: string[]
  onSelectionChange: (selectedIds: string[]) => void
  filters?: FilterCriteria
  onFiltersChange?: (filters: FilterCriteria) => void
  className?: string
  disabled?: boolean
  showStats?: boolean
  maxHeight?: string
}

function BatchOperationSelector({
  municipalities,
  selectedIds,
  onSelectionChange,
  filters = {},
  onFiltersChange,
  className,
  disabled = false,
  showStats = true,
  maxHeight = "400px",
}: BatchOperationSelectorProps) {
  const [searchQuery, setSearchQuery] = React.useState(filters.searchQuery || "")
  const [showFilters, setShowFilters] = React.useState(false)
  
  // Filter municipalities based on criteria
  const filteredMunicipalities = React.useMemo(() => {
    return municipalities.filter((municipality) => {
      // Search query filter
      if (searchQuery && !municipality.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      
      // Status filter
      if (filters.status && filters.status.length > 0 && !filters.status.includes(municipality.status)) {
        return false
      }
      
      // Scraper type filter
      if (filters.scraperType && filters.scraperType.length > 0 && !filters.scraperType.includes(municipality.scraperType)) {
        return false
      }
      
      // Region filter
      if (filters.region && filters.region.length > 0 && municipality.region && !filters.region.includes(municipality.region)) {
        return false
      }
      
      // Last updated filter
      if (filters.lastUpdatedDays) {
        const daysSinceUpdate = Math.floor((new Date().getTime() - municipality.lastUpdated.getTime()) / (1000 * 60 * 60 * 24))
        if (daysSinceUpdate > filters.lastUpdatedDays) {
          return false
        }
      }
      
      // Minimum documents filter
      if (filters.minDocuments && municipality.documentsCount && municipality.documentsCount < filters.minDocuments) {
        return false
      }
      
      return true
    })
  }, [municipalities, searchQuery, filters])
  
  const selectedCount = selectedIds.length
  const filteredCount = filteredMunicipalities.length
  const totalCount = municipalities.length
  
  const isAllSelected = filteredMunicipalities.length > 0 && 
    filteredMunicipalities.every(m => selectedIds.includes(m.id))
  const isPartiallySelected = selectedIds.length > 0 && !isAllSelected
  
  const handleSelectAll = () => {
    if (isAllSelected) {
      // Deselect all filtered items
      const filteredIds = new Set(filteredMunicipalities.map(m => m.id))
      onSelectionChange(selectedIds.filter(id => !filteredIds.has(id)))
    } else {
      // Select all filtered items
      const newSelected = new Set([...selectedIds, ...filteredMunicipalities.map(m => m.id)])
      onSelectionChange(Array.from(newSelected))
    }
  }
  
  const handleSelectNone = () => {
    onSelectionChange([])
  }
  
  const handleSelectByStatus = (status: MunicipalityStatus) => {
    const statusMunicipalities = filteredMunicipalities.filter(m => m.status === status)
    const newSelected = new Set([...selectedIds, ...statusMunicipalities.map(m => m.id)])
    onSelectionChange(Array.from(newSelected))
  }
  
  const handleToggleItem = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(selectedId => selectedId !== id))
    } else {
      onSelectionChange([...selectedIds, id])
    }
  }
  
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    onFiltersChange?.({ ...filters, searchQuery: value })
  }
  
  const clearFilters = () => {
    setSearchQuery("")
    onFiltersChange?.({})
  }
  
  const activeFiltersCount = Object.values(filters).filter(Boolean).length
  
  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with stats */}
      {showStats && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="text-sm text-muted-foreground">
              {selectedCount} of {filteredCount} selected
              {filteredCount !== totalCount && ` (${totalCount} total)`}
            </div>
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-auto p-1 text-xs"
              >
                <X className="w-3 h-3 mr-1" />
                Clear filters
              </Button>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              disabled={disabled || filteredMunicipalities.length === 0}
            >
              {isAllSelected ? "Deselect All" : "Select All"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectNone}
              disabled={disabled || selectedIds.length === 0}
            >
              Select None
            </Button>
          </div>
        </div>
      )}
      
      {/* Search and filters */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search municipalities..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8"
            disabled={disabled}
          />
        </div>
        
        <Popover open={showFilters} onOpenChange={setShowFilters}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={disabled}>
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 min-w-5 text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="font-medium">Filter Options</div>
              
              {/* Status filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Status</Label>
                <div className="flex flex-wrap gap-2">
                  {["active", "inactive", "error", "pending", "updating"].map((status) => (
                    <Button
                      key={status}
                      variant={filters.status?.includes(status as MunicipalityStatus) ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        const currentStatuses = filters.status || []
                        const newStatuses = currentStatuses.includes(status as MunicipalityStatus)
                          ? currentStatuses.filter(s => s !== status)
                          : [...currentStatuses, status as MunicipalityStatus]
                        onFiltersChange?.({ ...filters, status: newStatuses })
                      }}
                      className="h-8 text-xs capitalize"
                    >
                      {getStatusIcon(status as MunicipalityStatus)} {status}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Scraper type filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Scraper Type</Label>
                <div className="flex flex-wrap gap-2">
                  {["v1", "v2", "enhanced", "ajax", "custom"].map((type) => (
                    <Button
                      key={type}
                      variant={filters.scraperType?.includes(type as ScraperType) ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        const currentTypes = filters.scraperType || []
                        const newTypes = currentTypes.includes(type as ScraperType)
                          ? currentTypes.filter(t => t !== type)
                          : [...currentTypes, type as ScraperType]
                        onFiltersChange?.({ ...filters, scraperType: newTypes })
                      }}
                      className="h-8 text-xs uppercase"
                    >
                      {type}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Last updated filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Last Updated</Label>
                <Select
                  value={filters.lastUpdatedDays?.toString() || ""}
                  onValueChange={(value) => {
                    onFiltersChange?.({
                      ...filters,
                      lastUpdatedDays: value ? parseInt(value) : undefined
                    })
                  }}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Any time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any time</SelectItem>
                    <SelectItem value="1">Last 24 hours</SelectItem>
                    <SelectItem value="7">Last week</SelectItem>
                    <SelectItem value="30">Last month</SelectItem>
                    <SelectItem value="90">Last 3 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      
      {/* Quick select options */}
      <div className="flex items-center space-x-2">
        <div className="text-sm text-muted-foreground">Quick select:</div>
        {["active", "error", "pending"].map((status) => (
          <Button
            key={status}
            variant="ghost"
            size="sm"
            onClick={() => handleSelectByStatus(status as MunicipalityStatus)}
            disabled={disabled}
            className="h-7 text-xs capitalize"
          >
            {getStatusIcon(status as MunicipalityStatus)} {status}
          </Button>
        ))}
      </div>
      
      {/* Municipalities list */}
      <ScrollArea className="border rounded-md" style={{ maxHeight }}>
        <div className="p-4 space-y-2">
          {filteredMunicipalities.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No municipalities found matching the current filters.
            </div>
          ) : (
            filteredMunicipalities.map((municipality) => {
              const isSelected = selectedIds.includes(municipality.id)
              
              return (
                <div
                  key={municipality.id}
                  className={cn(
                    "flex items-center space-x-3 p-3 rounded-md border transition-colors",
                    isSelected && "bg-accent border-accent-foreground/20",
                    !disabled && "hover:bg-accent/50 cursor-pointer",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => !disabled && handleToggleItem(municipality.id)}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => !disabled && handleToggleItem(municipality.id)}
                    disabled={disabled}
                    className="shrink-0"
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <div className="font-medium truncate">{municipality.name}</div>
                      <Badge className={cn(statusVariants({ status: municipality.status }))}>
                        {getStatusIcon(municipality.status)} {municipality.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {municipality.scraperType.toUpperCase()}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center space-x-4 mt-1 text-xs text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>{formatLastUpdated(municipality.lastUpdated)}</span>
                      </div>
                      
                      {municipality.documentsCount !== undefined && (
                        <div className="flex items-center space-x-1">
                          <Database className="w-3 h-3" />
                          <span>{municipality.documentsCount.toLocaleString()} docs</span>
                        </div>
                      )}
                      
                      {municipality.region && (
                        <div className="flex items-center space-x-1">
                          <MapPin className="w-3 h-3" />
                          <span>{municipality.region}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
      
      {/* Selection summary */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between p-3 bg-accent rounded-md">
          <div className="text-sm font-medium">
            {selectedCount} municipalities selected
          </div>
          <div className="flex items-center space-x-2">
            {selectedCount > 1 && (
              <Badge variant="secondary">
                Batch operation ready
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export { BatchOperationSelector, statusVariants, getStatusIcon, formatLastUpdated }
export type { Municipality, FilterCriteria, MunicipalityStatus, ScraperType, BatchOperationSelectorProps }