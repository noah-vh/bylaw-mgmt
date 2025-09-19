"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft, 
  Building2, 
  Globe, 
  Calendar, 
  Download, 
  FileText, 
  Settings,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Clock,
  Edit,
  Trash2,
  Eye,
  Save,
  X,
  Star,
  MoreHorizontal,
  MapPin,
  Shield
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
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
} from "@/components/ui/dropdown-menu"

import { format } from "date-fns"
import type { Municipality, PdfDocument, MunicipalityStatus } from "@/types/database"
import { createDocumentId } from "@/types/database"
import { DocumentViewer } from "@/components/document-viewer"
import { useToggleDocumentFavorite } from "@/hooks/use-documents"
import type { MunicipalityBylawData, MunicipalityBylawDataInput } from "@/lib/municipality-bylaw-types"

interface MunicipalityDetailData {
  municipality: Municipality & {
    totalDocuments?: number
    relevantDocuments?: number
  }
  documents: PdfDocument[]
  stats: {
    totalDocuments: number
    relevantDocuments: number
  }
  bylaw_data?: MunicipalityBylawData
}

// Conversion constants
const FEET_TO_METERS = 0.3048
const SQFT_TO_SQM = 0.092903

export default function MunicipalityDetailPage() {
  const params = useParams()
  const municipalityId = params.id as string

  const [data, setData] = useState<MunicipalityDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [documentsSearch, setDocumentsSearch] = useState("")
  const [documentsFilter, setDocumentsFilter] = useState<string>("all")
  const [selectedDocument, setSelectedDocument] = useState<(PdfDocument & { municipality?: { name: string } }) | null>(null)

  // Unit state
  const [units, setUnits] = useState<'imperial' | 'metric'>('imperial')

  // Combined editing state
  const [isEditing, setIsEditing] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    website_url: "",
    status: "pending" as MunicipalityStatus
  })
  const [bylawForm, setBylawForm] = useState<Partial<MunicipalityBylawDataInput>>({})
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  
  // Hook for toggling favorites
  const toggleFavoriteMutation = useToggleDocumentFavorite()

  // Unit conversion functions
  const toDisplay = (value: number | null | undefined, isArea = false): string => {
    if (value === null || value === undefined) return ''
    if (units === 'metric') {
      if (isArea) {
        return (value * SQFT_TO_SQM).toFixed(1)
      }
      return (value * FEET_TO_METERS).toFixed(1)
    }
    return value.toString()
  }

  const fromDisplay = (value: string, isArea = false): number | null => {
    const parsed = parseFloat(value)
    if (isNaN(parsed)) return null
    if (units === 'metric') {
      if (isArea) {
        return parsed / SQFT_TO_SQM
      }
      return parsed / FEET_TO_METERS
    }
    return parsed
  }

  const getUnitLabel = (isArea = false): string => {
    if (units === 'metric') {
      return isArea ? 'sq m' : 'm'
    }
    return isArea ? 'sq ft' : 'ft'
  }

  useEffect(() => {
    const fetchMunicipalityDetail = async () => {
      try {
        setLoading(true)
        const [municipalityResponse, bylawResponse] = await Promise.all([
          fetch(`/api/municipalities/${municipalityId}`),
          fetch(`/api/municipalities/${municipalityId}/bylaw-data`)
        ])
        
        if (!municipalityResponse.ok) {
          throw new Error(`Failed to fetch municipality: ${municipalityResponse.statusText}`)
        }
        
        const municipalityResult = await municipalityResponse.json()
        const dataWithBylaws = { ...municipalityResult.data }
        
        // Add bylaw data if available
        if (bylawResponse.ok) {
          const bylawResult = await bylawResponse.json()
          dataWithBylaws.bylaw_data = bylawResult.bylaw_data
        }
        
        setData(dataWithBylaws)
        
        // Populate settings form
        const municipality = municipalityResult.data.municipality
        setSettingsForm({
          name: municipality.name || "",
          website_url: municipality.website_url || "",
          status: municipality.status || "active"
        })
        
        // Populate bylaw form
        if (dataWithBylaws.bylaw_data) {
          setBylawForm(dataWithBylaws.bylaw_data)
        } else {
          // Initialize with minimal defaults - only set values that make logical sense
          setBylawForm({
            municipality_id: parseInt(municipalityId),
            max_primary_dwellings: 1,  // Most lots have 1 primary dwelling
            max_adus: 1,  // Most allow 1 ADU
            max_total_units: 2,  // Total of primary + ADU
            adu_parking_spaces_required: 1,  // Common requirement
            // Leave enum fields without defaults so users must explicitly choose
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
        }
      } catch (error) {
        console.error('Error fetching municipality:', error)
        setError(error instanceof Error ? error.message : 'Failed to load municipality')
      } finally {
        setLoading(false)
      }
    }

    if (municipalityId) {
      fetchMunicipalityDetail()
    }
  }, [municipalityId])

  const handleSaveCombined = async () => {
    if (!municipalityId) return

    setSaving(true)
    setSaveMessage(null)

    try {
      // Save municipality settings
      const settingsResponse = await fetch(`/api/municipalities/${municipalityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm)
      })

      if (!settingsResponse.ok) {
        const errorData = await settingsResponse.json()
        throw new Error(`Failed to save settings: ${errorData.error || 'Unknown error'}`)
      }

      // Clean bylaw form data - properly handle clearing of fields
      const cleanedBylawForm = Object.entries(bylawForm).reduce((acc, [key, value]) => {
        // Include the field if it has a value (including null for clearing)
        // Skip only undefined and NaN
        if (value !== undefined && !Number.isNaN(value)) {
          (acc as any)[key] = value
        }
        return acc
      }, {} as Partial<MunicipalityBylawDataInput>)
      
      console.log('Cleaned bylaw form being sent:', cleanedBylawForm)

      // Save bylaw data
      const isUpdate = data?.bylaw_data
      const bylawMethod = isUpdate ? 'PUT' : 'POST'
      const bylawUrl = `/api/municipalities/${municipalityId}/bylaw-data`

      const bylawResponse = await fetch(bylawUrl, {
        method: bylawMethod,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cleanedBylawForm),
      })

      if (!bylawResponse.ok) {
        const errorData = await bylawResponse.json()
        console.error('Bylaw save error details:', errorData)
        if (errorData.issues) {
          const issueMessages = errorData.issues.map((issue: any) => 
            `${issue.path.join('.')}: ${issue.message}`
          ).join(', ')
          throw new Error(`Failed to save bylaw data: ${issueMessages}`)
        }
        throw new Error(`Failed to save bylaw data: ${errorData.error || 'Unknown error'}`)
      }

      // Both saves successful
      const settingsResult = await settingsResponse.json()
      const bylawResult = await bylawResponse.json()

      setSaveMessage({ 
        type: 'success', 
        text: 'Municipality settings and bylaw data saved successfully!' 
      })

      // Update local data
      if (data) {
        setData({
          ...data,
          municipality: { ...data.municipality, ...settingsResult.data },
          bylaw_data: bylawResult.data
        })
      }
      setIsEditing(false)
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

  const handleCancelEditing = () => {
    if (data) {
      const municipality = data.municipality
      setSettingsForm({
        name: municipality.name || "",
        website_url: municipality.website_url || "",
        status: municipality.status || "active"
      })
      
      // Reset bylaw form
      if (data.bylaw_data) {
        setBylawForm(data.bylaw_data)
      } else {
        // Initialize with minimal defaults - only set values that make logical sense
        setBylawForm({
          municipality_id: parseInt(municipalityId),
          max_primary_dwellings: 1,  // Most lots have 1 primary dwelling
          max_adus: 1,  // Most allow 1 ADU
          max_total_units: 2,  // Total of primary + ADU
          adu_parking_spaces_required: 1,  // Common requirement
          // Leave enum fields without defaults so users must explicitly choose
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
      }
    }
    setIsEditing(false)
    setSaveMessage(null)
  }

  const handleToggleFavorite = async (documentId: number) => {
    try {
      await toggleFavoriteMutation.mutateAsync(createDocumentId(documentId))
      // Update local state to reflect the change
      if (data) {
        setData({
          ...data,
          documents: data.documents.map(doc => 
            doc.id === createDocumentId(documentId) 
              ? { ...doc, is_favorited: !doc.is_favorited }
              : doc
          )
        })
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }

  // Form update handlers
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


  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="h-8 bg-muted rounded w-1/3 animate-pulse"></div>
          <div className="grid gap-6 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-8 bg-muted rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Error Loading Municipality</h1>
          <p className="text-muted-foreground mb-4">{error || 'Municipality not found'}</p>
          <Button asChild>
            <Link href="/municipalities">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Municipalities
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const { municipality, documents, stats } = data

  // Filter documents based on search and filter
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = !documentsSearch || 
      doc.title?.toLowerCase().includes(documentsSearch.toLowerCase()) ||
      doc.filename?.toLowerCase().includes(documentsSearch.toLowerCase())
    
    const categories = doc.categories as Record<string, number> | null | undefined
    const matchesFilter = documentsFilter === "all" || 
      (documentsFilter === "zoning" && (categories?.["Zoning"] || 0) > 0) ||
      (documentsFilter === "building-types" && (categories?.["Building Types"] || 0) > 0) ||
      (documentsFilter === "infrastructure" && (categories?.["Infrastructure"] || 0) > 0) ||
      (documentsFilter === "parking-access" && (categories?.["Parking/Access"] || 0) > 0) ||
      (documentsFilter === "existing-buildings" && (categories?.["Existing Buildings"] || 0) > 0) ||
      (documentsFilter === "adu-aru" && (categories?.["ADU/ARU Regulations"] || 0) > 0) ||
      (documentsFilter === "property-specs" && (categories?.["Property Specifications"] || 0) > 0) ||
      (documentsFilter === "dimensional" && (categories?.["Dimensional Requirements"] || 0) > 0)
    
    return matchesSearch && matchesFilter
  })

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" asChild>
          <Link href="/municipalities">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{municipality.name}</h1>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="h-4 w-4" />
              <a href={municipality.website_url} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                {municipality.website_url}
              </a>
            </div>
          </div>
        </div>
      </div>


      {/* Tabs */}
      <Tabs defaultValue="documents" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="bylaw-data" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Bylaw Data
            {data?.bylaw_data && <Badge variant="secondary" className="ml-1 text-xs">✓</Badge>}
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-6">
          {/* Document Actions Bar */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <FileText className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    value={documentsSearch}
                    onChange={(e) => setDocumentsSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <Select value={documentsFilter} onValueChange={setDocumentsFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="zoning">Zoning</SelectItem>
                  <SelectItem value="building-types">Building Types</SelectItem>
                  <SelectItem value="infrastructure">Infrastructure</SelectItem>
                  <SelectItem value="parking-access">Parking/Access</SelectItem>
                  <SelectItem value="existing-buildings">Existing Buildings</SelectItem>
                  <SelectItem value="adu-aru">ADU/ARU Regulations</SelectItem>
                  <SelectItem value="property-specs">Property Specifications</SelectItem>
                  <SelectItem value="dimensional">Dimensional Requirements</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Documents Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date Published</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((document) => (
                    <TableRow key={document.id}>
                      <TableCell>
                        <div>
                          <button
                            onClick={() => setSelectedDocument({ ...document, municipality: { id: municipality.id, name: municipality.name } })}
                            className="font-medium text-left hover:text-primary transition-colors cursor-pointer"
                          >
                            {document.title || document.filename}
                          </button>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <span>{document.filename}</span>
                            {document.is_favorited && (
                              <Star className="h-3 w-3 text-favorite-active fill-favorite-active" />
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {document.content_text ? (
                          <Badge variant="default" className="text-xs">
                            Extracted
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {document.date_found ? format(new Date(document.date_found), 'MMM d, yyyy') : 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setSelectedDocument({ ...document, municipality: { id: municipality.id, name: municipality.name } })}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Document
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleFavorite(document.id)}>
                              <Star className={`mr-2 h-4 w-4 ${document.is_favorited ? 'fill-current text-yellow-500' : ''}`} />
                              {document.is_favorited ? 'Remove from Favorites' : 'Add to Favorites'}
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Relevance
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredDocuments.length === 0 && (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No documents found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bylaw-data" className="space-y-6">
          {saveMessage && (
            <div className={`p-3 rounded-lg flex items-center gap-2 ${
              saveMessage.type === 'success' 
                ? 'bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300' 
                : 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300'
            }`}>
              {saveMessage.type === 'success' ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {saveMessage.text}
            </div>
          )}

          {/* Basic Information */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    ADU Bylaw Data
                  </CardTitle>
                  <CardDescription>
                    Configure ADU requirements and regulations for this municipality
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  {/* Edit/Save Buttons */}
                  {isEditing ? (
                    <>
                      <Button variant="outline" onClick={handleCancelEditing} disabled={saving}>
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
                    </>
                  ) : (
                    <Button onClick={() => setIsEditing(true)}>
                      <Edit className="mr-2 h-4 w-4" />
                      {data?.bylaw_data ? 'Edit' : 'Add'} Municipality Data
                    </Button>
                  )}
                </div>
              </div>
              {/* Bylaw Information Header with Units Toggle */}
              <div className="flex items-center justify-between pt-4 border-t">
                <h3 className="text-lg font-semibold">Bylaw Information</h3>
                {/* Unit Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Units:</span>
                  <div className="flex border border-border rounded-md overflow-hidden">
                    <Button
                      variant={units === 'imperial' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setUnits('imperial')}
                      className="h-7 px-3 text-xs rounded-none border-0"
                      type="button"
                    >
                      Imperial (ft)
                    </Button>
                    <Button
                      variant={units === 'metric' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setUnits('metric')}
                      className="h-7 px-3 text-xs rounded-none border-0"
                      type="button"
                    >
                      Metric (m)
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ordinance">Bylaw/Ordinance Number</Label>
                    {isEditing ? (
                      <Input
                        id="ordinance"
                        value={bylawForm.bylaw_ordinance_number || ''}
                        onChange={(e) => updateBylawForm('bylaw_ordinance_number', e.target.value)}
                        placeholder="e.g., 2024-15"
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.bylaw_ordinance_number || 'Not specified'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="effective_date">Effective Date</Label>
                    {isEditing ? (
                      <Input
                        id="effective_date"
                        type="date"
                        value={bylawForm.effective_date || ''}
                        onChange={(e) => updateBylawForm('effective_date', e.target.value)}
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.effective_date ? 
                          format(new Date(data.bylaw_data.effective_date), 'PPP') : 
                          'Not specified'
                        }
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Permit Type */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Permit Type</h3>
                <div className="space-y-2">
                  <Label htmlFor="permit_type">Permit Type Required</Label>
                  {isEditing ? (
                    <Select
                      value={bylawForm.permit_type || ''}
                      onValueChange={(value) => updateBylawForm('permit_type', value || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select permit type (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="by_right">By Right</SelectItem>
                        <SelectItem value="special_permit">Special Permit</SelectItem>
                        <SelectItem value="conditional_use">Conditional Use</SelectItem>
                        <SelectItem value="variance">Variance</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="p-2 bg-muted rounded-md">
                      {data?.bylaw_data?.permit_type === 'by_right' ? 'By Right' :
                       data?.bylaw_data?.permit_type === 'special_permit' ? 'Special Permit' :
                       data?.bylaw_data?.permit_type === 'conditional_use' ? 'Conditional Use' :
                       data?.bylaw_data?.permit_type === 'variance' ? 'Variance' :
                       'Not specified'}
                    </div>
                  )}
                </div>
              </div>

              {/* ADU Types Allowed */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">ADU Types Allowed</h3>
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
                        disabled={!isEditing}
                      />
                      <Label htmlFor={key} className="text-sm">{label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Owner Occupancy Requirements */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Owner Occupancy Requirements</h3>
                <div className="space-y-2">
                  <Label htmlFor="owner_occupancy">Owner Occupancy Requirement</Label>
                  {isEditing ? (
                    <Select
                      value={bylawForm.owner_occupancy_required || ''}
                      onValueChange={(value) => updateBylawForm('owner_occupancy_required', value || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select requirement (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Requirement</SelectItem>
                        <SelectItem value="primary_residence">Primary Residence</SelectItem>
                        <SelectItem value="either_unit">Either Unit</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="p-2 bg-muted rounded-md">
                      {data?.bylaw_data?.owner_occupancy_required === 'none' ? 'No Requirement' :
                       data?.bylaw_data?.owner_occupancy_required === 'primary_residence' ? 'Primary Residence' :
                       data?.bylaw_data?.owner_occupancy_required === 'either_unit' ? 'Either Unit' :
                       'Not specified'}
                    </div>
                  )}
                </div>
              </div>

              {/* Setback Requirements */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Setback Requirements ({getUnitLabel()})</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="front_setback">Front Setback (min)</Label>
                    {isEditing ? (
                      <Input
                        id="front_setback"
                        type="number"
                        step="0.1"
                        value={toDisplay(bylawForm.front_setback_min_ft)}
                        onChange={(e) => updateBylawForm('front_setback_min_ft', fromDisplay(e.target.value))}
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.front_setback_min_ft ? `${toDisplay(data.bylaw_data.front_setback_min_ft)} ${getUnitLabel()}` : 'Not specified'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rear_setback">Rear Setback (min)</Label>
                    {isEditing ? (
                      <Input
                        id="rear_setback"
                        type="number"
                        step="0.1"
                        value={toDisplay(bylawForm.rear_setback_standard_ft)}
                        onChange={(e) => updateBylawForm('rear_setback_standard_ft', fromDisplay(e.target.value))}
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.rear_setback_standard_ft ? `${toDisplay(data.bylaw_data.rear_setback_standard_ft)} ${getUnitLabel()}` : 'Not specified'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="side_setback">Side Setback (min)</Label>
                    {isEditing ? (
                      <Input
                        id="side_setback"
                        type="number"
                        step="0.1"
                        value={toDisplay(bylawForm.side_setback_interior_ft)}
                        onChange={(e) => updateBylawForm('side_setback_interior_ft', fromDisplay(e.target.value))}
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.side_setback_interior_ft ? `${toDisplay(data.bylaw_data.side_setback_interior_ft)} ${getUnitLabel()}` : 'Not specified'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ADU Size Limits */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">ADU Size Limits</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="min_size">Minimum Size ({getUnitLabel(true)})</Label>
                    {isEditing ? (
                      <Input
                        id="min_size"
                        type="number"
                        value={toDisplay(bylawForm.detached_adu_min_size_sqft, true)}
                        onChange={(e) => updateBylawForm('detached_adu_min_size_sqft', fromDisplay(e.target.value, true) ? Math.round(fromDisplay(e.target.value, true)!) : null)}
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.detached_adu_min_size_sqft ? `${toDisplay(data.bylaw_data.detached_adu_min_size_sqft, true)} ${getUnitLabel(true)}` : 'Not specified'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_size">Maximum Size ({getUnitLabel(true)})</Label>
                    {isEditing ? (
                      <Input
                        id="max_size"
                        type="number"
                        value={toDisplay(bylawForm.detached_adu_max_size_sqft, true)}
                        onChange={(e) => updateBylawForm('detached_adu_max_size_sqft', fromDisplay(e.target.value, true) ? Math.round(fromDisplay(e.target.value, true)!) : null)}
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.detached_adu_max_size_sqft ? `${toDisplay(data.bylaw_data.detached_adu_max_size_sqft, true)} ${getUnitLabel(true)}` : 'Not specified'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_height">Maximum Height ({getUnitLabel()})</Label>
                    {isEditing ? (
                      <Input
                        id="max_height"
                        type="number"
                        step="0.1"
                        value={toDisplay(bylawForm.detached_adu_max_height_ft)}
                        onChange={(e) => updateBylawForm('detached_adu_max_height_ft', fromDisplay(e.target.value))}
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.detached_adu_max_height_ft ? `${toDisplay(data.bylaw_data.detached_adu_max_height_ft)} ${getUnitLabel()}` : 'Not specified'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_coverage">Max Lot Coverage (%)</Label>
                    {isEditing ? (
                      <Input
                        id="max_coverage"
                        type="number"
                        step="0.1"
                        max="100"
                        value={bylawForm.max_lot_coverage_percent || ''}
                        onChange={(e) => updateBylawForm('max_lot_coverage_percent', e.target.value ? parseFloat(e.target.value) : null)}
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.max_lot_coverage_percent ? `${data.bylaw_data.max_lot_coverage_percent}%` : 'Not specified'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Parking Requirements */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Parking Requirements</h3>
                <div className="space-y-2">
                  <Label htmlFor="parking_spaces">Parking Spaces Required</Label>
                  {isEditing ? (
                    <Input
                      id="parking_spaces"
                      type="number"
                      min="0"
                      value={bylawForm.adu_parking_spaces_required || 1}
                      onChange={(e) => updateBylawForm('adu_parking_spaces_required', e.target.value ? parseInt(e.target.value) : null)}
                    />
                  ) : (
                    <div className="p-2 bg-muted rounded-md">
                      {data?.bylaw_data?.adu_parking_spaces_required ?? 'Not specified'} spaces
                    </div>
                  )}
                </div>
              </div>

              {/* Design Standards */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Design Standards</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="architectural_compatibility">Architectural Compatibility</Label>
                    {isEditing ? (
                      <Select
                        value={bylawForm.architectural_compatibility || ''}
                        onValueChange={(value) => updateBylawForm('architectural_compatibility', value || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select compatibility (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="must_match">Must Match</SelectItem>
                          <SelectItem value="compatible_materials">Compatible Materials</SelectItem>
                          <SelectItem value="none">No Requirement</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.architectural_compatibility === 'must_match' ? 'Must Match' :
                         data?.bylaw_data?.architectural_compatibility === 'compatible_materials' ? 'Compatible Materials' :
                         data?.bylaw_data?.architectural_compatibility === 'none' ? 'No Requirement' :
                         'Not specified'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="entrance_requirements">Entrance Requirements</Label>
                    {isEditing ? (
                      <Select
                        value={bylawForm.entrance_requirements || ''}
                        onValueChange={(value) => updateBylawForm('entrance_requirements', value || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select entrance (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no_restriction">No Restriction</SelectItem>
                          <SelectItem value="cannot_face_street">Cannot Face Street</SelectItem>
                          <SelectItem value="must_face_street">Must Face Street</SelectItem>
                          <SelectItem value="separate_required">Separate Required</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.entrance_requirements === 'no_restriction' ? 'No Restriction' :
                         data?.bylaw_data?.entrance_requirements === 'cannot_face_street' ? 'Cannot Face Street' :
                         data?.bylaw_data?.entrance_requirements === 'must_face_street' ? 'Must Face Street' :
                         data?.bylaw_data?.entrance_requirements === 'separate_required' ? 'Separate Required' :
                         'Not specified'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Utilities */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Utilities</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="utility_connections">Utility Connections</Label>
                    {isEditing ? (
                      <Select
                        value={bylawForm.utility_connections || ''}
                        onValueChange={(value) => updateBylawForm('utility_connections', value || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select utility (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="may_share">May Share</SelectItem>
                          <SelectItem value="separate_required">Separate Required</SelectItem>
                          <SelectItem value="depends_on_size">Depends on Size</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.utility_connections === 'may_share' ? 'May Share' :
                         data?.bylaw_data?.utility_connections === 'separate_required' ? 'Separate Required' :
                         data?.bylaw_data?.utility_connections === 'depends_on_size' ? 'Depends on Size' :
                         'Not specified'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="septic_sewer_requirements">Septic/Sewer Requirements</Label>
                    {isEditing ? (
                      <Select
                        value={bylawForm.septic_sewer_requirements || ''}
                        onValueChange={(value) => updateBylawForm('septic_sewer_requirements', value || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select sewer (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public_sewer_required">Public Sewer Required</SelectItem>
                          <SelectItem value="septic_with_capacity_proof">Septic with Capacity Proof</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.septic_sewer_requirements === 'public_sewer_required' ? 'Public Sewer Required' :
                         data?.bylaw_data?.septic_sewer_requirements === 'septic_with_capacity_proof' ? 'Septic with Capacity Proof' :
                         data?.bylaw_data?.septic_sewer_requirements === 'other' ? 'Other' :
                         'Not specified'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Coverage and Height Rules */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Coverage and Height Rules</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="adu_coverage_counting">ADU Coverage Counting</Label>
                    {isEditing ? (
                      <Select
                        value={bylawForm.adu_coverage_counting || ''}
                        onValueChange={(value) => updateBylawForm('adu_coverage_counting', value || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select coverage (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full">Full</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                          <SelectItem value="exempt">Exempt</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.adu_coverage_counting === 'full' ? 'Full' :
                         data?.bylaw_data?.adu_coverage_counting === 'partial' ? 'Partial' :
                         data?.bylaw_data?.adu_coverage_counting === 'exempt' ? 'Exempt' :
                         'Not specified'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="attached_adu_height_rule">Attached ADU Height Rule</Label>
                    {isEditing ? (
                      <Select
                        value={bylawForm.attached_adu_height_rule || ''}
                        onValueChange={(value) => updateBylawForm('attached_adu_height_rule', value || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select height rule (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="same_as_primary">Same as Primary</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.attached_adu_height_rule === 'same_as_primary' ? 'Same as Primary' :
                         data?.bylaw_data?.attached_adu_height_rule === 'custom' ? 'Custom' :
                         'Not specified'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="attached_adu_setback_rule">Attached ADU Setback Rule</Label>
                    {isEditing ? (
                      <Select
                        value={bylawForm.attached_adu_setback_rule || ''}
                        onValueChange={(value) => updateBylawForm('attached_adu_setback_rule', value || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select setback rule (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="same_as_primary">Same as Primary</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        {data?.bylaw_data?.attached_adu_setback_rule === 'same_as_primary' ? 'Same as Primary' :
                         data?.bylaw_data?.attached_adu_setback_rule === 'custom' ? 'Custom' :
                         'Not specified'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Additional Notes */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Additional Notes</h3>
                {isEditing ? (
                  <Textarea
                    value={bylawForm.additional_notes || ''}
                    onChange={(e) => updateBylawForm('additional_notes', e.target.value)}
                    placeholder="Any additional requirements, exceptions, or clarifications..."
                    rows={4}
                  />
                ) : (
                  <div className="p-2 bg-muted rounded-md min-h-[100px]">
                    {data?.bylaw_data?.additional_notes || 'No additional notes'}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          {saveMessage && (
            <div className={`p-3 rounded-lg flex items-center gap-2 ${
              saveMessage.type === 'success' 
                ? 'bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300' 
                : 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300'
            }`}>
              {saveMessage.type === 'success' ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {saveMessage.text}
            </div>
          )}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Municipality Settings</CardTitle>
                  <CardDescription>Configure municipality details and scraping settings</CardDescription>
                </div>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button variant="outline" onClick={handleCancelEditing} disabled={saving}>
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
                    </>
                  ) : (
                    <Button onClick={() => setIsEditing(true)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Municipality Data
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Municipality Name</Label>
                    {isEditing ? (
                      <Input
                        id="name"
                        value={settingsForm.name}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter municipality name"
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">{municipality.name}</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website_url">Website URL</Label>
                    {isEditing ? (
                      <Input
                        id="website_url"
                        type="url"
                        value={settingsForm.website_url}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, website_url: e.target.value }))}
                        placeholder="https://example.com"
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        <a href={municipality.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {municipality.website_url}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    {isEditing ? (
                      <Select value={settingsForm.status} onValueChange={(value) => setSettingsForm(prev => ({ ...prev, status: value as MunicipalityStatus }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="testing">Testing</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="error">Error</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="p-2 bg-muted rounded-md">
                        <span className="text-sm text-muted-foreground">
                          Status: {municipality.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Statistics */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Statistics</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{stats.totalDocuments}</div>
                    <div className="text-sm text-muted-foreground">Total Documents</div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{stats.relevantDocuments}</div>
                    <div className="text-sm text-muted-foreground">Relevant Documents</div>
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Timeline</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Created</Label>
                    <div className="p-2 bg-muted rounded-md">
                      {municipality.created_at ? format(new Date(municipality.created_at), 'PPP') : 'Unknown'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Last Updated</Label>
                    <div className="p-2 bg-muted rounded-md">
                      {municipality.updated_at ? format(new Date(municipality.updated_at), 'PPP') : 'Never'}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
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