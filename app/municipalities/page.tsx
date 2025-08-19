"use client"

import { useState, useEffect, useRef } from "react"
import { Metadata } from "next"
import Link from "next/link"
import { 
  Building2, 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Eye, 
  Calendar,
  Grid3x3,
  List,
  RefreshCw,
  Settings,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Shield,
  Save,
  X,
  CheckCircle,
  AlertTriangle
} from "lucide-react"

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { useMunicipalitySearch, useCreateMunicipality, useUpdateMunicipality, useDeleteMunicipality } from "@/hooks/use-municipalities"
import { format } from "date-fns"
import type { Municipality } from "@/types/database"
import { createMunicipalityId, createDocumentId } from "@/types/database"
import type { MunicipalityBylawData, MunicipalityBylawDataInput } from "@/lib/municipality-bylaw-types"

export default function MunicipalitiesPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table')
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<number[]>([])
  const [editingMunicipality, setEditingMunicipality] = useState<Municipality | null>(null)
  const [deletingMunicipality, setDeletingMunicipality] = useState<Municipality | null>(null)
  
  const {
    data,
    isLoading,
    error,
    searchParams,
    setSearch,
    setPage,
    setLimit,
    setSorting,
    resetSearch,
    refetch,
    updateSearch
  } = useMunicipalitySearch()



  const createMutation = useCreateMunicipality()
  const updateMutation = useUpdateMunicipality()
  const deleteMutation = useDeleteMunicipality()
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedMunicipalities(data?.data.map(m => m.id) || [])
    } else {
      setSelectedMunicipalities([])
    }
  }

  const handleSelectMunicipality = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedMunicipalities(prev => [...prev, id])
    } else {
      setSelectedMunicipalities(prev => prev.filter(selectedId => selectedId !== id))
    }
  }

  const handleDelete = async (municipality: Municipality) => {
    try {
      await deleteMutation.mutateAsync(municipality.id)
      setDeletingMunicipality(null)
      refetch()
    } catch (error) {
      console.error('Failed to delete municipality:', error)
    }
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Error Loading Municipalities</h1>
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
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Municipalities</h1>
            <p className="text-muted-foreground">
              Manage municipalities and their bylaw collections
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <CreateMunicipalityDialog onSuccess={() => refetch()} />
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search municipalities..."
              value={searchParams.search || ''}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Select 
            value={searchParams.limit?.toString() || "100"} 
            onValueChange={(value) => {
              const limit = parseInt(value)
              updateSearch({ limit, page: 1 })
            }}
          >
            <SelectTrigger className="w-20 h-10">
              <SelectValue>
                {searchParams.limit || 100}
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
              size="sm"
              onClick={() => setViewMode('grid')}
              className="h-10 px-3"
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('table')}
              className="h-10 px-3"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'table' ? (
        <TableView
          data={data}
          isLoading={isLoading}
          selectedMunicipalities={selectedMunicipalities}
          onSelectAll={handleSelectAll}
          onSelectMunicipality={handleSelectMunicipality}
          onEdit={setEditingMunicipality}
          onDelete={setDeletingMunicipality}
        />
      ) : (
        <GridView
          data={data}
          isLoading={isLoading}
          onEdit={setEditingMunicipality}
          onDelete={setDeletingMunicipality}
        />
      )}

      {/* Pagination */}
      {data?.pagination && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-muted-foreground">
            Showing {((data.pagination.page - 1) * (data.pagination.limit || 0)) + 1} to{' '}
            {Math.min(data.pagination.page * (data.pagination.limit || 0), data.pagination.total)} of{' '}
            {data.pagination.total} municipalities
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

      {/* Edit Municipality Dialog */}
      {editingMunicipality && (
        <EditMunicipalityDialog
          municipality={editingMunicipality}
          open={!!editingMunicipality}
          onOpenChange={(open) => !open && setEditingMunicipality(null)}
          onSuccess={() => {
            setEditingMunicipality(null)
            refetch()
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingMunicipality} onOpenChange={(open) => !open && setDeletingMunicipality(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Municipality</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deletingMunicipality?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingMunicipality(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deletingMunicipality && handleDelete(deletingMunicipality)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


// Table view component
interface TableViewProps {
  data: any
  isLoading: boolean
  selectedMunicipalities: number[]
  onSelectAll: (checked: boolean) => void
  onSelectMunicipality: (id: number, checked: boolean) => void
  onEdit: (municipality: Municipality) => void
  onDelete: (municipality: Municipality) => void
}

function TableView({ data, isLoading, selectedMunicipalities, onSelectAll, onSelectMunicipality, onEdit, onDelete }: TableViewProps) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [sortField, setSortField] = useState<string>('totalDocuments')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Client-side sorting function
  const sortMunicipalities = (municipalities: Municipality[], field: string, order: 'asc' | 'desc') => {
    return [...municipalities].sort((a, b) => {
      let aValue: any
      let bValue: any
      
      switch (field) {
        case 'name':
          aValue = a.name?.toLowerCase() || ''
          bValue = b.name?.toLowerCase() || ''
          break
        case 'updated_at':
          aValue = new Date(a.updated_at || 0).getTime()
          bValue = new Date(b.updated_at || 0).getTime()
          break
        case 'totalDocuments':
          aValue = a.totalDocuments || 0
          bValue = b.totalDocuments || 0
          break
        case 'created_at':
          aValue = new Date(a.created_at || 0).getTime()
          bValue = new Date(b.created_at || 0).getTime()
          break
        default:
          return 0
      }
      
      if (aValue < bValue) return order === 'asc' ? -1 : 1
      if (aValue > bValue) return order === 'asc' ? 1 : -1
      return 0
    })
  }

  // Get sorted data
  const sortedData = data?.data ? sortMunicipalities(data.data, sortField, sortOrder) : []

  // Helper component for sortable headers
  const SortableHeader = ({ field, children }: { field: string; children: React.ReactNode }) => {
    const isCurrentSort = sortField === field
    const currentOrder = sortOrder
    const nextOrder = isCurrentSort && currentOrder === 'asc' ? 'desc' : 'asc'
    
    const handleSort = () => {
      setSortField(field)
      setSortOrder(nextOrder)
    }
    
    return (
      <TableHead 
        className="cursor-pointer hover:bg-muted/50 select-none"
        onClick={handleSort}
      >
        <div className="flex items-center gap-2">
          {children}
          {isCurrentSort ? (
            currentOrder === 'asc' ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )
          ) : (
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          )}
        </div>
      </TableHead>
    )
  }
  
  const handleMouseEnter = (municipalityId: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    setHoveredRow(municipalityId)
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
              <div key={i} className="h-12 bg-muted rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedMunicipalities.length === sortedData.length && sortedData.length > 0}
                  onCheckedChange={onSelectAll}
                />
              </TableHead>
              <SortableHeader field="name">
                Municipality
              </SortableHeader>
              <SortableHeader field="totalDocuments">
                Documents
              </SortableHeader>
              <TableHead>
                Bylaw Data
              </TableHead>
              <SortableHeader field="updated_at">
                Last Updated
              </SortableHeader>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((municipality: Municipality) => (
              <TableRow key={municipality.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedMunicipalities.includes(municipality.id)}
                    onCheckedChange={(checked) => onSelectMunicipality(municipality.id, checked as boolean)}
                  />
                </TableCell>
                <TableCell>
                  <div>
                    <div>
                      <Link 
                        href={`/municipalities/${municipality.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {municipality.name}
                      </Link>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {municipality.website_url}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div className="font-medium">{municipality.totalDocuments || 0} total</div>
                    <div className="text-xs text-muted-foreground">
                      Documents found
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center">
                    {(municipality as any).bylaw_data ? (
                      <Badge variant="secondary" className="text-xs">
                        <Shield className="h-3 w-3 mr-1" />
                        Configured
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not configured</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>{municipality.updated_at ? format(new Date(municipality.updated_at), 'MMM d, yyyy') : 'Never'}</div>
                    <div className="text-xs text-muted-foreground">
                      Last modified
                    </div>
                  </div>
                </TableCell>
                <TableCell className="relative">
                  <div 
                    className="inline-block"
                    onMouseEnter={() => handleMouseEnter(municipality.id)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <DropdownMenu modal={false} open={hoveredRow === municipality.id}>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 p-0 text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent 
                        align="end" 
                        className="w-56"
                        onMouseEnter={() => handleMouseEnter(municipality.id)}
                        onMouseLeave={handleMouseLeave}
                      >
                      <DropdownMenuItem asChild className="cursor-pointer">
                        <Link href={`/municipalities/${municipality.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onEdit(municipality)} className="cursor-pointer">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Edit Municipality Data</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive cursor-pointer"
                        onClick={() => onDelete(municipality)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>Delete Municipality</span>
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
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No municipalities found</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Grid view component
interface GridViewProps {
  data: any
  isLoading: boolean
  onEdit: (municipality: Municipality) => void
  onDelete: (municipality: Municipality) => void
}

function GridView({ data, isLoading, onEdit, onDelete }: GridViewProps) {
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
      {data?.data?.map((municipality: Municipality) => (
        <Card key={municipality.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg">
                  <div className="flex items-center gap-2">
                    <Link 
                      href={`/municipalities/${municipality.id}`}
                      className="hover:text-primary"
                    >
                      {municipality.name}
                    </Link>
                  </div>
                </CardTitle>
                <CardDescription className="mt-1">
                  {municipality.website_url}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Documents:</span>
                <span className="font-medium">{municipality.totalDocuments || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bylaw Data:</span>
                {(municipality as any).bylaw_data ? (
                  <Badge variant="secondary" className="text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Not configured</span>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Updated:</span>
                <span className="font-medium">
                  {municipality.updated_at ? format(new Date(municipality.updated_at), 'MMM d') : 'Never'}
                </span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/municipalities/${municipality.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => onEdit(municipality)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Data
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {(!data?.data || data.data.length === 0) && (
        <div className="col-span-full text-center py-12">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No municipalities found</p>
        </div>
      )}
    </div>
  )
}

// Create municipality dialog component
interface CreateMunicipalityDialogProps {
  onSuccess: () => void
}

function CreateMunicipalityDialog({ onSuccess }: CreateMunicipalityDialogProps) {
  const [open, setOpen] = useState(false)
  const createMutation = useCreateMunicipality()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    try {
      await createMutation.mutateAsync({
        name: formData.get('name') as string,
        website_url: formData.get('website_url') as string,
      })
      
      setOpen(false)
      onSuccess()
    } catch (error) {
      console.error('Failed to create municipality:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Municipality
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add New Municipality</DialogTitle>
            <DialogDescription>
              Create a new municipality to start collecting bylaw documents.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Municipality Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="City of Toronto"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="website_url">Website URL</Label>
              <Input
                id="website_url"
                name="website_url"
                type="url"
                placeholder="https://www.toronto.ca"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Municipality'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Edit municipality dialog component
interface EditMunicipalityDialogProps {
  municipality: Municipality
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function EditMunicipalityDialog({ municipality, open, onOpenChange, onSuccess }: EditMunicipalityDialogProps) {
  const updateMutation = useUpdateMunicipality()
  
  // Form states
  const [settingsForm, setSettingsForm] = useState({
    name: municipality.name || "",
    website_url: municipality.website_url || "",
  })
  const [bylawForm, setBylawForm] = useState<Partial<MunicipalityBylawDataInput>>({})
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [bylawData, setBylawData] = useState<MunicipalityBylawData | null>(null)

  // Load bylaw data when dialog opens
  useEffect(() => {
    if (open && municipality.id) {
      const fetchBylawData = async () => {
        try {
          const response = await fetch(`/api/municipalities/${municipality.id}/bylaw-data`)
          if (response.ok) {
            const result = await response.json()
            setBylawData(result.bylaw_data)
            setBylawForm(result.bylaw_data || getDefaultBylawForm())
          } else {
            setBylawData(null)
            setBylawForm(getDefaultBylawForm())
          }
        } catch (error) {
          console.error('Error loading bylaw data:', error)
          setBylawData(null)
          setBylawForm(getDefaultBylawForm())
        }
      }
      
      fetchBylawData()
      setSettingsForm({
        name: municipality.name || "",
        website_url: municipality.website_url || "",
      })
      setSaveMessage(null)
    }
  }, [open, municipality.id])

  const getDefaultBylawForm = (): Partial<MunicipalityBylawDataInput> => ({
    municipality_id: municipality.id,
    permit_type: 'special_permit',
    owner_occupancy_required: 'none',
    max_primary_dwellings: 1,
    max_adus: 1,
    max_total_units: 2,
    attached_adu_height_rule: 'same_as_primary',
    attached_adu_setback_rule: 'same_as_primary',
    adu_coverage_counting: 'full',
    adu_parking_spaces_required: 1,
    architectural_compatibility: 'none',
    entrance_requirements: 'no_restriction',
    utility_connections: 'may_share',
    septic_sewer_requirements: 'public_sewer_required',
    adu_types_allowed: {
      detached: false,
      attached: false,
      garage_conversion: false,
      basement_conversion: false,
      interior: false,
    },
    parking_configuration_allowed: {
      uncovered: true,
      covered: true,
      garage: true,
      tandem: false,
      on_street: false,
    },
    permitted_zones: [],
    source_documents: [],
  })

  const updateBylawForm = (field: keyof MunicipalityBylawDataInput, value: any) => {
    setBylawForm(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const updateNestedBylawData = (field: keyof MunicipalityBylawDataInput, subField: string, value: any) => {
    setBylawForm(prev => ({
      ...prev,
      [field]: {
        ...(prev[field] as any),
        [subField]: value
      }
    }))
  }

  const handleSaveCombined = async () => {
    if (!municipality.id) return

    setSaving(true)
    setSaveMessage(null)

    try {
      // Save municipality settings
      const settingsResponse = await fetch(`/api/municipalities/${municipality.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm)
      })

      if (!settingsResponse.ok) {
        const errorData = await settingsResponse.json()
        throw new Error(`Failed to save settings: ${errorData.error || 'Unknown error'}`)
      }

      // Save bylaw data
      const isUpdate = bylawData
      const bylawMethod = isUpdate ? 'PUT' : 'POST'
      const bylawUrl = `/api/municipalities/${municipality.id}/bylaw-data`

      const bylawResponse = await fetch(bylawUrl, {
        method: bylawMethod,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bylawForm),
      })

      if (!bylawResponse.ok) {
        const errorData = await bylawResponse.json()
        throw new Error(`Failed to save bylaw data: ${errorData.error || 'Unknown error'}`)
      }

      // Both saves successful
      setSaveMessage({ 
        type: 'success', 
        text: 'Municipality settings and bylaw data saved successfully!' 
      })

      // Wait a moment to show success message
      setTimeout(() => {
        onSuccess()
      }, 1000)
    } catch (error) {
      setSaveMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Error saving data' 
      })
      console.error('Error saving:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setSettingsForm({
      name: municipality.name || "",
      website_url: municipality.website_url || "",
    })
    setBylawForm(bylawData || getDefaultBylawForm())
    setSaveMessage(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Municipality Data</DialogTitle>
          <DialogDescription>
            Update municipality information and bylaw data.
          </DialogDescription>
        </DialogHeader>

        {saveMessage && (
          <div className={`p-3 rounded-lg flex items-center gap-2 ${
            saveMessage.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300' 
              : 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300'
          }`}>
            {saveMessage.type === 'success' ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {saveMessage.text}
          </div>
        )}

        <Tabs defaultValue="basic" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="bylaw">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Bylaw Data
                {bylawData && <span className="ml-1 text-xs">✓</span>}
              </div>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Municipality Name</Label>
                <Input
                  id="edit-name"
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-website_url">Website URL</Label>
                <Input
                  id="edit-website_url"
                  type="url"
                  value={settingsForm.website_url}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, website_url: e.target.value }))}
                  required
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bylaw" className="space-y-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h4 className="font-semibold">Basic Information</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ordinance">Bylaw/Ordinance Number</Label>
                  <Input
                    id="ordinance"
                    value={bylawForm.bylaw_ordinance_number || ''}
                    onChange={(e) => updateBylawForm('bylaw_ordinance_number', e.target.value)}
                    placeholder="e.g., 2024-15"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="effective_date">Effective Date</Label>
                  <Input
                    id="effective_date"
                    type="date"
                    value={bylawForm.effective_date || ''}
                    onChange={(e) => updateBylawForm('effective_date', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* ADU Types Allowed */}
            <div className="space-y-4">
              <h4 className="font-semibold">ADU Types Allowed</h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'detached', label: 'Detached ADU' },
                  { key: 'attached', label: 'Attached ADU' },
                  { key: 'garage_conversion', label: 'Garage Conversion' },
                  { key: 'basement_conversion', label: 'Basement Conversion' },
                  { key: 'interior', label: 'Interior ADU' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Checkbox
                      id={key}
                      checked={bylawForm.adu_types_allowed?.[key as keyof typeof bylawForm.adu_types_allowed] || false}
                      onCheckedChange={(checked) => 
                        updateNestedBylawData('adu_types_allowed', key, checked)
                      }
                    />
                    <Label htmlFor={key} className="text-sm">{label}</Label>
                  </div>
                ))}
              </div>
            </div>

            {/* ADU Size Limits */}
            <div className="space-y-4">
              <h4 className="font-semibold">ADU Size Limits</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min_size">Minimum Size (sq ft)</Label>
                  <Input
                    id="min_size"
                    type="number"
                    value={bylawForm.detached_adu_min_size_sqft || ''}
                    onChange={(e) => updateBylawForm('detached_adu_min_size_sqft', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_size">Maximum Size (sq ft)</Label>
                  <Input
                    id="max_size"
                    type="number"
                    value={bylawForm.detached_adu_max_size_sqft || ''}
                    onChange={(e) => updateBylawForm('detached_adu_max_size_sqft', parseInt(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Parking Requirements */}
            <div className="space-y-4">
              <h4 className="font-semibold">Parking Requirements</h4>
              <div className="space-y-2">
                <Label htmlFor="parking_spaces">Parking Spaces Required</Label>
                <Input
                  id="parking_spaces"
                  type="number"
                  min="0"
                  value={bylawForm.adu_parking_spaces_required || 1}
                  onChange={(e) => updateBylawForm('adu_parking_spaces_required', parseInt(e.target.value))}
                />
              </div>
            </div>

            {/* Additional Notes */}
            <div className="space-y-4">
              <h4 className="font-semibold">Additional Notes</h4>
              <Textarea
                value={bylawForm.additional_notes || ''}
                onChange={(e) => updateBylawForm('additional_notes', e.target.value)}
                placeholder="Any additional requirements, exceptions, or clarifications..."
                rows={4}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel} disabled={saving}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleSaveCombined} disabled={saving}>
            {saving ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save All Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}