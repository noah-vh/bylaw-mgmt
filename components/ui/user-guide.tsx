"use client"

import { useState } from "react"
import { BookOpen, X, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface GuideSection {
  title: string
  description: string
  steps: string[]
  tips?: string[]
}

interface UserGuideProps {
  title: string
  sections: GuideSection[]
  isOpen: boolean
  onClose: () => void
}

export function UserGuide({ title, sections, isOpen, onClose }: UserGuideProps) {
  const [openSections, setOpenSections] = useState<number[]>([0])

  const toggleSection = (index: number) => {
    setOpenSections(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-500" />
              <CardTitle>{title}</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Step-by-step guide to help you get the most out of this feature
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-y-auto">
          <div className="space-y-4">
            {sections.map((section, index) => (
              <Collapsible
                key={index}
                open={openSections.includes(index)}
                onOpenChange={() => toggleSection(index)}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between h-auto p-4"
                  >
                    <div className="text-left">
                      <div className="font-medium">{section.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {section.description}
                      </div>
                    </div>
                    {openSections.includes(index) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="pl-4 border-l-2 border-muted space-y-3">
                    <div>
                      <h4 className="font-medium text-sm mb-2">Steps:</h4>
                      <ol className="space-y-2">
                        {section.steps.map((step, stepIndex) => (
                          <li key={stepIndex} className="flex items-start gap-2 text-sm">
                            <Badge variant="outline" className="text-xs px-2 py-0 min-w-fit">
                              {stepIndex + 1}
                            </Badge>
                            <span className="text-muted-foreground">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    
                    {section.tips && section.tips.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm mb-2 text-amber-700 dark:text-amber-400">
                          💡 Pro Tips:
                        </h4>
                        <ul className="space-y-1">
                          {section.tips.map((tip, tipIndex) => (
                            <li key={tipIndex} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-amber-500 font-bold">•</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Predefined guides for common features
export const SEARCH_GUIDE_SECTIONS: GuideSection[] = [
  {
    title: "Basic Search",
    description: "Learn how to search for documents, municipalities, and scrapers",
    steps: [
      "Enter your search terms in the search box",
      "Press Enter or click the search button",
      "Review results categorized by type (Documents, Municipalities, Scrapers)",
      "Click on any result to view details or open documents"
    ],
    tips: [
      "Use quotes for exact phrases: \"accessory dwelling unit\"",
      "Results show match counts for each category",
      "Search works across titles and content simultaneously"
    ]
  },
  {
    title: "Advanced Filtering",
    description: "Use filters to narrow down your search results",
    steps: [
      "Click the 'Filters' button to open advanced options",
      "Enable 'Search within document content' for full-text search",
      "Select specific municipalities to limit results",
      "Choose document types (ADU relevant, analyzed documents)",
      "Apply filters and review updated results"
    ],
    tips: [
      "Content search is more thorough but may be slower",
      "Multiple municipality filters work as OR conditions",
      "Filter combinations help find exactly what you need"
    ]
  },
  {
    title: "Understanding Results",
    description: "Make sense of search results and relevance scoring",
    steps: [
      "Review result categories and counts",
      "Check relevance scores and match percentages",
      "Look for highlighted matching text in excerpts",
      "Use document status badges to understand processing state"
    ],
    tips: [
      "Higher relevance scores indicate better matches",
      "Highlighted text shows where your search terms appear",
      "Status badges indicate if documents are fully processed"
    ]
  }
]

export const DOCUMENT_GUIDE_SECTIONS: GuideSection[] = [
  {
    title: "Browsing Documents",
    description: "Navigate and view municipal bylaw documents",
    steps: [
      "Browse documents in table or grid view",
      "Use sort options to organize by date, relevance, or municipality",
      "Apply filters to narrow down documents",
      "Click 'View Document' to open the document viewer"
    ],
    tips: [
      "Table view shows more details, grid view is more visual",
      "Sort by relevance to find most relevant ADU documents first",
      "Filters help you focus on specific municipalities or document types"
    ]
  },
  {
    title: "Document Actions",
    description: "Work with documents using available actions",
    steps: [
      "Click the star icon to favorite important documents",
      "Use 'Download' to save documents locally",
      "Click 'View' to open in the document viewer",
      "Use 'Original' to visit the source webpage"
    ],
    tips: [
      "Favorited documents appear on your dashboard",
      "Downloaded files keep their original names and formats",
      "Document viewer shows extracted text for easy reading"
    ]
  },
]