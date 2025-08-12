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
  ChevronUp,
  ChevronDown,
} from "lucide-react"
import { format } from "date-fns"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PdfDocument, DocumentId } from "@/types/database"

interface DocumentViewerProps {
  document: PdfDocument & { 
    municipality?: { name: string }
    municipality_name?: string
  }
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggleFavorite?: (id: DocumentId) => void
  searchQuery?: string
}

// Document stage status badge component
function DocumentStageStatusBadge({ document }: { document: PdfDocument }) {
  // Simple status determination based on document properties
  const getStatus = () => {
    if (document.content_text) {
      return {
        label: 'Extracted',
        className: 'bg-blue-100 text-blue-800',
        icon: FileText,
        tooltip: 'PDF content has been extracted'
      }
    }
    if (document.storage_path) {
      return {
        label: 'Downloaded',
        className: 'bg-yellow-100 text-yellow-800',
        icon: Download,
        tooltip: 'Document has been downloaded successfully'
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
  onToggleFavorite,
  searchQuery: initialSearchQuery 
}: DocumentViewerProps) {
  const [searchQuery, setSearchQuery] = React.useState(initialSearchQuery || "")
  const [highlightedContent, setHighlightedContent] = React.useState("")
  const [activeTab, setActiveTab] = React.useState("content")
  const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0)
  const [totalMatches, setTotalMatches] = React.useState(0)
  const [matchPositions, setMatchPositions] = React.useState<number[]>([])
  const contentRef = React.useRef<HTMLDivElement>(null)
  
  
  const municipalityName = document.municipality?.name || document.municipality_name || 'Unknown'
  
  const handleReprocess = async (documentId: DocumentId, stage: 'download' | 'extract' | 'analyze') => {
    console.log(`Processing request for document ${documentId}, stage: ${stage}`)
    // Placeholder functionality - processing hook has been removed
    // In a real implementation, this would trigger the appropriate processing pipeline
    setActiveTab("processing")
  }
  
  // Initialize search query from prop when modal opens
  React.useEffect(() => {
    if (open && initialSearchQuery) {
      setSearchQuery(initialSearchQuery)
    }
  }, [open, initialSearchQuery])

  // Create highlighted content when search query or document content changes
  React.useEffect(() => {
    if (!document.content_text) {
      setHighlightedContent("")
      setTotalMatches(0)
      setMatchPositions([])
      return
    }

    let content = document.content_text
    const positions: number[] = []

    if (searchQuery && searchQuery.trim().length > 0) {
      // Escape special regex characters and create case-insensitive regex
      const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(escapedQuery, 'gi')
      
      // Find all matches and their positions
      let match
      while ((match = regex.exec(document.content_text)) !== null) {
        positions.push(match.index)
      }
      
      // Replace matches with highlighted version
      let matchCount = 0
      content = document.content_text.replace(new RegExp(`(${escapedQuery})`, 'gi'), (match) => {
        const isCurrentMatch = matchCount === currentMatchIndex
        matchCount++
        return `<mark data-match-index="${matchCount - 1}" class="${
          isCurrentMatch 
            ? 'bg-yellow-300 dark:bg-yellow-400 text-black dark:text-black' 
            : 'bg-yellow-200 dark:bg-yellow-300 text-black dark:text-black'
        } font-medium px-1 py-0.5 rounded transition-colors shadow-sm">${match}</mark>`
      })
      
      setTotalMatches(positions.length)
      setMatchPositions(positions)
    } else {
      setTotalMatches(0)
      setMatchPositions([])
      setCurrentMatchIndex(0)
    }

    setHighlightedContent(content)
  }, [document.content_text, searchQuery, currentMatchIndex])

  // Navigation functions
  const goToNextMatch = () => {
    if (totalMatches > 0) {
      const nextIndex = (currentMatchIndex + 1) % totalMatches
      setCurrentMatchIndex(nextIndex)
      scrollToMatch(nextIndex)
    }
  }

  const goToPreviousMatch = () => {
    if (totalMatches > 0) {
      const prevIndex = currentMatchIndex === 0 ? totalMatches - 1 : currentMatchIndex - 1
      setCurrentMatchIndex(prevIndex)
      scrollToMatch(prevIndex)
    }
  }

  const scrollToMatch = (index: number) => {
    if (contentRef.current) {
      const marks = contentRef.current.querySelectorAll('mark')
      if (marks[index]) {
        marks[index].scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }

  // Handle keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return
      
      // Enter key or F3 for next match
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'F3') {
        e.preventDefault()
        goToNextMatch()
      }
      // Shift+Enter or Shift+F3 for previous match
      else if ((e.key === 'Enter' && e.shiftKey) || (e.key === 'F3' && e.shiftKey)) {
        e.preventDefault()
        goToPreviousMatch()
      }
      // Escape to clear search
      else if (e.key === 'Escape' && searchQuery) {
        e.preventDefault()
        setSearchQuery('')
        setCurrentMatchIndex(0)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, searchQuery, totalMatches, currentMatchIndex])
  
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
      <DialogContent className="max-w-6xl max-h-[95vh] h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="pb-4 pr-12">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {document.highlighted?.title ? (
                <DialogTitle 
                  className="text-xl font-semibold line-clamp-2 mb-2"
                  dangerouslySetInnerHTML={{ __html: document.highlighted.title }}
                />
              ) : (
                <DialogTitle className="text-xl font-semibold line-clamp-2 mb-2">
                  {document.title}
                </DialogTitle>
              )}
              <div className="flex items-center gap-2 text-muted-foreground flex-wrap text-sm">
                <Building2 className="h-4 w-4" />
                <span>{municipalityName}</span>
                <span>•</span>  
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(document.date_found), 'MMM d, yyyy')}</span>
                <span>•</span>
                <span className="truncate">{document.filename}</span>
                {document.file_size && (
                  <>
                    <span>•</span>
                    <span>{Math.round(document.file_size / 1024)} KB</span>
                  </>
                )}
                {document.is_relevant && (
                  <>
                    <span>•</span>
                    <Badge variant="secondary" className="text-xs">
                      ADU Related
                    </Badge>
                  </>
                )}
              </div>
            </div>
            
            {/* Actions moved to top right */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button size="sm" asChild>
                <a href={document.url} target="_blank" rel="noopener noreferrer">
                  <Eye className="mr-2 h-4 w-4" />
                  Open PDF
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={document.url} download target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
              {onToggleFavorite && (
                <Button 
                  variant="outline"
                  size="sm"
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
          </div>
        </DialogHeader>

        {/* Document Content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {document.content_text ? (
            <>
              {/* Search Bar */}
              <div className="flex items-center gap-2 mb-4 flex-shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search within document..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setCurrentMatchIndex(0)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (e.shiftKey) {
                          goToPreviousMatch()
                        } else {
                          goToNextMatch()
                        }
                      }
                    }}
                    className="pl-10 pr-24"
                  />
                  {searchQuery && totalMatches > 0 && (
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1 text-sm text-muted-foreground">
                      <span>{currentMatchIndex + 1} / {totalMatches}</span>
                    </div>
                  )}
                </div>
                {searchQuery && (
                  <>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={goToPreviousMatch}
                        disabled={totalMatches === 0}
                        title="Previous match (Shift+Enter)"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={goToNextMatch}
                        disabled={totalMatches === 0}
                        title="Next match (Enter)"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchQuery("")
                        setCurrentMatchIndex(0)
                      }}
                      title="Clear search (Esc)"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
              
              {/* Tabs for Content and PDF Preview */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="content">Document Content</TabsTrigger>
                  <TabsTrigger value="pdf">PDF Preview</TabsTrigger>
                </TabsList>
                
                <TabsContent value="content" className="flex-1 mt-0">
                  <div className="border rounded-md bg-background overflow-hidden" style={{ height: 'calc(90vh - 260px)' }}>
                    <div className="h-full overflow-y-auto p-6" ref={contentRef}>
                      <div className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
                        {highlightedContent ? (
                          <div dangerouslySetInnerHTML={{ __html: highlightedContent }} />
                        ) : (
                          document.content_text
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="pdf" className="flex-1 mt-0">
                  <div className="border rounded-md bg-background overflow-hidden flex items-center justify-center" style={{ height: 'calc(90vh - 260px)' }}>
                    <div className="flex flex-col items-center justify-center p-8 text-center max-w-md">
                      <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">PDF Preview Not Available</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Due to security restrictions, PDFs cannot be previewed inline. 
                        Click below to view the original document.
                      </p>
                      <Button asChild size="lg">
                        <a href={document.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View Original PDF
                        </a>
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center flex-1">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">Content not available</h3>
              <p className="text-sm text-muted-foreground mb-4">
                This document may not have been processed yet.
              </p>
              <Button variant="outline" asChild>
                <a href={document.url} target="_blank" rel="noopener noreferrer">
                  <Eye className="mr-2 h-4 w-4" />
                  View Original PDF
                </a>
              </Button>
            </div>
          )}
        </div>

      </DialogContent>
    </Dialog>
  )
}