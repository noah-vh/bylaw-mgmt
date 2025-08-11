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
  ChevronsUpDown
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

import { useMunicipalitySearch, useCreateMunicipality, useUpdateMunicipality, useDeleteMunicipality } from "@/hooks/use-municipalities"
import { format } from "date-fns"
import type { Municipality } from "@/types/database"
import { createMunicipalityId, createDocumentId } from "@/types/database"

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
                        <span>Edit Settings</span>
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
                Edit
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    try {
      await updateMutation.mutateAsync({
        id: municipality.id,
        data: {
          name: formData.get('name') as string,
          website_url: formData.get('website_url') as string,
        }
      })
      
      onSuccess()
    } catch (error) {
      console.error('Failed to update municipality:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Municipality</DialogTitle>
            <DialogDescription>
              Update municipality information and settings.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Municipality Name</Label>
              <Input
                id="edit-name"
                name="name"
                defaultValue={municipality.name}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-website_url">Website URL</Label>
              <Input
                id="edit-website_url"
                name="website_url"
                type="url"
                defaultValue={municipality.website_url}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Municipality'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}