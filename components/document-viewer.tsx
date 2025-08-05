"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import {
  Download,
  FileText,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  ExternalLink,
  Star,
  Share2,
  Building2,
  Eye,
  Search,
  Brain,
} from "lucide-react"
import { format } from "date-fns"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DocumentPipelineStatus } from "@/components/document-pipeline-status"
import type { PdfDocument, DocumentId } from "@/types/database"

interface DocumentViewerProps {
  document: PdfDocument & { 
    municipality?: { name: string }
    municipality_name?: string
  }
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggleFavorite?: (id: DocumentId) => void
}

// Document stage status badge component
function DocumentStageStatusBadge({ document }: { document: PdfDocument }) {
  // Simple status determination based on document properties
  const getStatus = () => {
    if (document.analysis_status === 'completed') {
      return {
        label: 'Processed',
        className: 'bg-green-100 text-green-800',
        icon: CheckCircle2,
        tooltip: 'Document has been fully analyzed for ADU relevance'
      }
    }
    if (document.extraction_status === 'completed') {
      return {
        label: 'Extracted',
        className: 'bg-blue-100 text-blue-800',
        icon: FileText,
        tooltip: 'PDF content has been extracted and is ready for analysis'
      }
    }
    if (document.download_status === 'downloaded') {
      return {
        label: 'Downloaded',
        className: 'bg-yellow-100 text-yellow-800',
        icon: Download,
        tooltip: 'Document has been downloaded successfully'
      }
    }
    if (document.download_status === 'error' || document.extraction_status === 'failed' || document.analysis_status === 'failed') {
      return {
        label: 'Failed',
        className: 'bg-red-100 text-red-800',
        icon: AlertCircle,
        tooltip: 'Processing failed - see document details for more information'
      }
    }
    return {
      label: 'Pending',
      className: 'bg-gray-100 text-gray-800',
      icon: Clock,
      tooltip: 'Document is queued for processing'
    }
  }

  const status = getStatus()
  const IconComponent = status.icon

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${status.className}`}>
            <IconComponent className="h-3 w-3" />
            {status.label}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            {status.tooltip}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function DocumentViewer({ 
  document, 
  open,
  onOpenChange,
  onToggleFavorite 
}: DocumentViewerProps) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [highlightedContent, setHighlightedContent] = React.useState("")
  const [activeTab, setActiveTab] = React.useState("content")
  
  const municipalityName = document.municipality?.name || document.municipality_name || 'Unknown'
  
  const handleReprocess = async (documentId: DocumentId, stage: 'download' | 'extract' | 'analyze') => {
    console.log(`Processing request for document ${documentId}, stage: ${stage}`)
    // Placeholder functionality - processing hook has been removed
    // In a real implementation, this would trigger the appropriate processing pipeline
    setActiveTab("processing")
  }
  
  // Create highlighted content when search query or document content changes
  React.useEffect(() => {
    if (!document.content_text) {
      setHighlightedContent("")
      return
    }

    let content = document.content_text

    if (searchQuery && searchQuery.trim().length > 0) {
      // Escape special regex characters and create case-insensitive regex
      const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(${escapedQuery})`, 'gi')
      content = content.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-900/50 font-medium px-0.5 rounded">$1</mark>')
    }

    setHighlightedContent(content)
  }, [document.content_text, searchQuery])
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'downloaded':
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'downloading':
      case 'processing':
        return 'bg-blue-100 text-blue-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'error':
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'downloaded':
      case 'completed':
        return <CheckCircle2 className="h-3 w-3" />
      case 'downloading':
      case 'processing':
        return <Clock className="h-3 w-3" />
      case 'pending':
        return <AlertCircle className="h-3 w-3" />
      case 'error':
      case 'failed':
        return <X className="h-3 w-3" />
      default:
        return <Clock className="h-3 w-3" />
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-xl font-semibold line-clamp-2 pr-8">
            {document.title}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span>{municipalityName}</span>
            <span>•</span>  
            <Calendar className="h-4 w-4" />
            <span>{format(new Date(document.date_found), 'MMM d, yyyy')}</span>
            {document.is_adu_relevant && (
              <>
                <span>•</span>
                <Badge variant="secondary" className="text-xs">
                  ADU Relevant
                </Badge>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pb-4 border-b">
          <Button asChild>
            <a href={document.url} target="_blank" rel="noopener noreferrer">
              <Eye className="mr-2 h-4 w-4" />
              Open PDF
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={document.url} download target="_blank" rel="noopener noreferrer">
              <Download className="mr-2 h-4 w-4" />
              Download
            </a>
          </Button>
          {onToggleFavorite && (
            <Button 
              variant="outline"
              onClick={() => onToggleFavorite(document.id)}
            >
              <Star className={`mr-2 h-4 w-4 ${document.is_favorited ? 'fill-current text-yellow-500' : ''}`} />
              {document.is_favorited ? 'Favorited' : 'Favorite'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: document.title,
                  text: `Check out this document: ${document.title}`,
                  url: document.url
                })
              } else {
                navigator.clipboard.writeText(document.url)
              }
            }}
          >
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        </div>

        {/* Content Tabs */}
        <div className="flex-1 flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="content">Document Content</TabsTrigger>
              <TabsTrigger value="processing">Processing Status</TabsTrigger>
              <TabsTrigger value="metadata">Metadata & Analysis</TabsTrigger>
            </TabsList>
            
            <TabsContent value="content" className="flex-1 flex flex-col min-h-0 mt-4">
              {document.content_text ? (
                <>
                  {/* Search Bar */}
                  <div className="flex items-center gap-2 pb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search within document..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearchQuery("")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  
                  {/* Document Content */}
                  <ScrollArea className="flex-1 -mx-6 px-6 border rounded-md h-full">
                    <div className="py-4 pr-4">
                      <div className="prose prose-sm max-w-none">
                        {highlightedContent ? (
                          <div 
                            className="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
                            dangerouslySetInnerHTML={{ __html: highlightedContent }}
                          />
                        ) : (
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                            {document.content_text}
                          </div>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center flex-1">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">Content not available</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    This document may not have been processed yet.
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => handleReprocess(document.id, 'extract')}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Extract Content
                    </Button>
                    <Button variant="outline" asChild>
                      <a href={document.url} target="_blank" rel="noopener noreferrer">
                        <Eye className="mr-2 h-4 w-4" />
                        View Original PDF
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="processing" className="flex-1 flex flex-col min-h-0 mt-4">
              <div className="space-y-4">
                <DocumentPipelineStatus 
                  document={document}
                  size="lg"
                  showActions={true}
                  showTimestamps={true}
                  onReprocess={handleReprocess}
                  className="border-0 p-0"
                />
                
                {/* Processing History */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Processing History</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-2 px-3 bg-muted/50 rounded">
                      <span>Document discovered</span>
                      <span className="text-muted-foreground">
                        {format(new Date(document.date_found), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                    
                    {document.download_status === 'downloaded' && (
                      <div className="flex justify-between py-2 px-3 bg-muted/50 rounded">
                        <span>Document downloaded</span>
                        <span className="text-muted-foreground">
                          {format(new Date(document.date_found), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                    )}
                    
                    {document.extraction_status === 'completed' && document.content_text && (
                      <div className="flex justify-between py-2 px-3 bg-muted/50 rounded">
                        <span>Content extracted ({document.content_text.length.toLocaleString()} characters)</span>
                        <span className="text-muted-foreground">
                          {format(new Date(document.date_found), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                    )}
                    
                    {document.analysis_status === 'completed' && document.analysis_date && (
                      <div className="flex justify-between py-2 px-3 bg-muted/50 rounded">
                        <span>Relevance analysis completed</span>
                        <span className="text-muted-foreground">
                          {format(new Date(document.analysis_date), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                    )}
                    
                    {(document.download_status === 'error' || 
                      document.extraction_status === 'failed' || 
                      document.analysis_status === 'failed') && (
                      <div className="py-2 px-3 bg-red-50 border border-red-200 rounded">
                        <div className="font-medium text-red-800 mb-1">Processing Error</div>
                        <div className="text-xs text-red-600">
                          {document.analysis_error || 'Unknown error occurred during processing'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="metadata" className="flex-1 flex flex-col min-h-0 mt-4">
              <ScrollArea className="flex-1 h-full">
                <div className="space-y-4 pr-4">
                  {/* Document Metadata */}
                  <div>
                    <h4 className="font-medium text-sm mb-3">Document Information</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Filename:</span>
                        <div className="font-mono text-xs mt-1 break-all">{document.filename}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">File Size:</span>
                        <div className="mt-1">
                          {document.file_size ? `${Math.round(document.file_size / 1024)} KB` : 'Unknown'}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Municipality:</span>
                        <div className="mt-1">{municipalityName}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Date Found:</span>
                        <div className="mt-1">{format(new Date(document.date_found), 'MMM d, yyyy')}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Content Hash:</span>
                        <div className="font-mono text-xs mt-1 break-all">
                          {document.content_hash || 'Not calculated'}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Storage Path:</span>
                        <div className="font-mono text-xs mt-1 break-all">
                          {document.storage_path || 'Not stored locally'}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Analysis Results */}
                  {document.analysis_status === 'completed' && (
                    <div>
                      <h4 className="font-medium text-sm mb-3">Analysis Results</h4>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">ADU Relevance:</span>
                            <div className="mt-1">
                              <Badge className={document.is_adu_relevant ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                                {document.is_adu_relevant ? 'Relevant' : 'Not Relevant'}
                              </Badge>
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Confidence Score:</span>
                            <div className="mt-1">
                              {document.relevance_confidence ? (
                                <Badge variant="outline">
                                  {Math.round(document.relevance_confidence * 100)}%
                                </Badge>
                              ) : (
                                'Not available'
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Analysis Date:</span>
                            <div className="mt-1">
                              {document.analysis_date ? 
                                format(new Date(document.analysis_date), 'MMM d, yyyy h:mm a') : 
                                'Not analyzed'
                              }
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Content Length:</span>
                            <div className="mt-1">
                              {document.content_text ? 
                                `${document.content_text.length.toLocaleString()} characters` : 
                                'No content extracted'
                              }
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Processing Actions */}
                  <div>
                    <h4 className="font-medium text-sm mb-3">Processing Actions</h4>
                    <div className="flex flex-wrap gap-2">
                      {document.download_status !== 'downloaded' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleReprocess(document.id, 'download')}
                        >
                          <Download className="mr-2 h-3 w-3" />
                          Download Document
                        </Button>
                      )}
                      
                      {document.download_status === 'downloaded' && document.extraction_status !== 'completed' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleReprocess(document.id, 'extract')}
                        >
                          <FileText className="mr-2 h-3 w-3" />
                          Extract Content
                        </Button>
                      )}
                      
                      {document.extraction_status === 'completed' && document.content_text && document.analysis_status !== 'completed' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleReprocess(document.id, 'analyze')}
                        >
                          <Brain className="mr-2 h-3 w-3" />
                          Analyze Relevance
                        </Button>
                      )}
                      
                      {/* Re-processing options */}
                      {document.extraction_status === 'completed' && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleReprocess(document.id, 'extract')}
                        >
                          <FileText className="mr-2 h-3 w-3" />
                          Re-extract
                        </Button>
                      )}
                      
                      {document.analysis_status === 'completed' && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleReprocess(document.id, 'analyze')}
                        >
                          <Brain className="mr-2 h-3 w-3" />
                          Re-analyze
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between pt-4 border-t text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="truncate">{document.filename}</span>
            {document.file_size && (
              <>
                <span>•</span>
                <span>{Math.round(document.file_size / 1024)} KB</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DocumentPipelineStatus document={document} size="sm" />
            {document.relevance_confidence !== null && document.relevance_confidence !== undefined && (
              <Badge variant="outline" className="text-xs">
                {Math.round(document.relevance_confidence * 100)}% confidence
              </Badge>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}