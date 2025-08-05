"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, Calendar, Search, Filter, ExternalLink, Clock, TrendingUp } from "lucide-react"
import { useDocuments } from "@/hooks/use-documents"
import { useMunicipalities } from "@/hooks/use-municipalities"

import type { PdfDocument } from "@/types/database"
import { createMunicipalityId } from "@/types/database"

export default function RecentDocumentsPage() {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d')
  const [searchQuery, setSearchQuery] = useState('')
  const [municipalityFilter, setMunicipalityFilter] = useState<string>('all')
  const [relevanceFilter, setRelevanceFilter] = useState<string>('all')

  // Calculate date range
  const getDateRange = () => {
    const now = new Date()
    const ranges = {
      '24h': new Date(now.getTime() - 24 * 60 * 60 * 1000),
      '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }
    return ranges[timeRange]
  }

  const {
    data,
    isLoading: loading,
    error,
    refetch
  } = useDocuments({
    search: searchQuery,
    municipalityId: municipalityFilter !== 'all' ? createMunicipalityId(parseInt(municipalityFilter)) : undefined,
    isAduRelevant: relevanceFilter === 'relevant' ? true : relevanceFilter === 'not-relevant' ? false : undefined,
    sort: 'date_found',
    order: 'desc',
    limit: 20
  })
  
  const documents = data?.data || []
  const pagination = data?.pagination
  
  const { data: municipalitiesData } = useMunicipalities({ limit: 100 })

  // Filter documents by date range
  const recentDocuments = documents?.filter(doc => {
    const docDate = new Date(doc.date_found)
    return docDate >= getDateRange()
  }) || []

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours}h ago`
    
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `${diffInDays}d ago`
    
    return date.toLocaleDateString()
  }

  const getTimeRangeStats = () => {
    const stats = {
      total: recentDocuments.length,
      relevant: recentDocuments.filter(doc => doc.is_adu_relevant).length,
      analyzed: recentDocuments.filter(doc => doc.content_analyzed).length,
      municipalities: new Set(recentDocuments.map(doc => doc.municipality_id)).size
    }
    return stats
  }

  const stats = getTimeRangeStats()

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Recent Documents</h1>
          <p className="text-muted-foreground">
            Recently found bylaw documents from municipality scraping
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={loading}>
          <Clock className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={timeRange} onValueChange={(value) => setTimeRange(value as '24h' | '7d' | '30d')} className="space-y-6">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="24h">Last 24 Hours</TabsTrigger>
            <TabsTrigger value="7d">Last 7 Days</TabsTrigger>
            <TabsTrigger value="30d">Last 30 Days</TabsTrigger>
          </TabsList>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                Found in {timeRange === '24h' ? 'last 24 hours' : timeRange === '7d' ? 'last 7 days' : 'last 30 days'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Relevant Documents</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.relevant}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0 ? Math.round((stats.relevant / stats.total) * 100) : 0}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Analyzed Documents</CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.analyzed}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0 ? Math.round((stats.analyzed / stats.total) * 100) : 0}% processed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Municipalities</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.municipalities}</div>
              <p className="text-xs text-muted-foreground">
                With new documents
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Filters</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Search Documents</label>
                <Input
                  placeholder="Search by title or filename..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Municipality</label>
                <Select value={municipalityFilter} onValueChange={setMunicipalityFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All municipalities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All municipalities</SelectItem>
                    {municipalitiesData?.data?.map((municipality) => (
                      <SelectItem key={municipality.id} value={municipality.id.toString()}>
                        {municipality.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Relevance</label>
                <Select value={relevanceFilter} onValueChange={setRelevanceFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All documents" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All documents</SelectItem>
                    <SelectItem value="relevant">Relevant only</SelectItem>
                    <SelectItem value="not-relevant">Not relevant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <TabsContent value={timeRange} className="space-y-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-4">
              {[...Array(5)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="animate-pulse space-y-4">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card>
              <CardContent className="p-6 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Error loading documents</h3>
                <p className="text-muted-foreground mb-4">
                  There was an error loading recent documents. Please try again.
                </p>
                <Button onClick={() => refetch()}>
                  Try Again
                </Button>
              </CardContent>
            </Card>
          ) : recentDocuments.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No recent documents</h3>
                <p className="text-muted-foreground mb-4">
                  No documents have been found in the selected time range.
                </p>
                <Link href="/documents">
                  <Button>
                    View All Documents
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {recentDocuments.map((document) => (
                <Card key={document.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <h3 className="font-semibold text-lg leading-tight">
                            {document.title || document.filename}
                          </h3>
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          <span>
                            <Link 
                              href={`/municipalities/${document.municipality_id}`}
                              className="hover:underline"
                            >
                              {document.municipality_name}
                            </Link>
                          </span>
                          <span>•</span>
                          <span>{formatDate(document.date_found)}</span>
                          <span>•</span>
                          <span>{formatFileSize(document.file_size || 0)}</span>
                        </div>

                        <div className="flex items-center space-x-2">
                          {document.is_adu_relevant && (
                            <Badge variant="default">Relevant</Badge>
                          )}
                          {document.content_analyzed && (
                            <Badge variant="secondary">Analyzed</Badge>
                          )}
                          {!document.content_analyzed && (
                            <Badge variant="outline">Pending Analysis</Badge>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground">
                          {document.filename}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 ml-4">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/documents/${document.id}`}>
                            View Details
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a href={document.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {recentDocuments.length > 0 && (
                <div className="flex justify-center">
                  <Link href="/documents">
                    <Button variant="outline">
                      View All Documents
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}