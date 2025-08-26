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
  const [openSection, setOpenSection] = useState<number>(0) // Only one section open at a time

  const toggleSection = (index: number) => {
    setOpenSection(prev => prev === index ? -1 : index) // Close if same, open if different
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl max-h-[80vh] flex flex-col">
        <CardHeader className="flex-shrink-0 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-xl">{title}</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription className="text-base">
            Learn how to search effectively and get the best results
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-y-auto px-6 pb-6">
          <div className="space-y-4">
            {sections.map((section, index) => (
              <Collapsible
                key={index}
                open={openSection === index}
                onOpenChange={() => toggleSection(index)}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between h-auto p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="text-left flex-1 pr-4">
                      <div className="font-semibold text-base mb-1">{section.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {section.description}
                      </div>
                    </div>
                    {openSection === index ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <div className="bg-muted/20 rounded-lg p-5 space-y-5">
                    {/* Special layout for Synonym Reference section */}
                    {section.title === "Synonym Reference" ? (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground mb-4">
                          Search any one term to automatically find all related terms:
                        </p>
                        <div className="grid gap-4">
                          {section.steps.map((group, groupIndex) => {
                            const [category, terms] = group.split(': ');
                            return (
                              <div key={groupIndex} className="border border-border/30 rounded-lg p-4 bg-background/50">
                                <h4 className="font-semibold text-sm mb-2 text-foreground">{category}</h4>
                                <div className="flex flex-wrap gap-2">
                                  {terms.split(', ').map((term, termIndex) => (
                                    <Badge key={termIndex} variant="outline" className="text-xs font-normal">
                                      {term}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {section.tips && section.tips.length > 0 && (
                          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                            <div className="space-y-2">
                              {section.tips.map((tip, tipIndex) => (
                                <p key={tipIndex} className="text-sm text-blue-800 dark:text-blue-200">
                                  {tip}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Default layout for other sections */
                      <>
                        <div>
                          <h4 className="font-semibold text-sm mb-4 text-foreground">How it works:</h4>
                          <div className="space-y-4">
                            {section.steps.map((step, stepIndex) => (
                              <div key={stepIndex} className="flex items-start gap-3">
                                <Badge variant="secondary" className="text-xs px-2 py-1 min-w-fit mt-0.5 flex-shrink-0">
                                  {stepIndex + 1}
                                </Badge>
                                <span className="text-sm text-foreground leading-relaxed flex-1">{step}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {section.tips && section.tips.length > 0 && (
                          <div className="border-t border-border/50 pt-5">
                            <h4 className="font-semibold text-sm mb-4 text-amber-700 dark:text-amber-400">
                              💡 Examples & Tips:
                            </h4>
                            <div className="space-y-3">
                              {section.tips.map((tip, tipIndex) => (
                                <div key={tipIndex} className="flex items-start gap-3">
                                  <span className="text-amber-500 font-bold text-sm mt-0.5 flex-shrink-0">•</span>
                                  <span className="text-sm text-foreground leading-relaxed flex-1">{tip}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
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
    title: "How Search Works",
    description: "This is keyword-based search, not semantic. Use specific words from documents.",
    steps: [
      "Search finds documents containing your exact keywords",
      "It's NOT like asking a question - looks for specific words",
      "Multiple words are connected with AND (all must be present)",
      "Some synonyms work automatically (max → maximum, ADU → garden suite)"
    ],
    tips: [
      "❌ Don't search: 'What is the max height for ADUs in Toronto?'",
      "✅ Do search: 'maximum height' then use Toronto + ADU filters",
      "Think: What specific terms would appear in the bylaw document?",
      "Use filters for categories and locations, not search terms"
    ]
  },
  {
    title: "Best Search Practices",
    description: "Simple strategies to find what you need quickly",
    steps: [
      "Use specific keywords from building/zoning terminology",
      "Use municipality filters instead of typing city names",
      "Use category filters (like 'ADU Regulations') for document types",
      "Combine 2-3 specific keywords rather than long phrases"
    ],
    tips: [
      "🎯 Good keywords: 'setback', 'maximum height', 'lot coverage', 'permit required'",
      "🏠 For ADU docs: Use ADU category filter + specific requirement keywords",
      "🏘️ For specific cities: Click municipality filter buttons",
      "📝 Think like the document: Use terms that would appear in bylaws"
    ]
  },
  {
    title: "Synonym Reference",
    description: "Search any one term to automatically find all related terms:",
    steps: [
      "🏠 ADU/Dwelling: ADU, accessory dwelling unit, garden suite, laneway house, granny flat, secondary suite, ARU, accessory residential unit, coach house, carriage house, in-law suite, basement apartment, tiny home",
      "📏 Height: height, tall, elevation, maximum, max, greatest, highest, peak, tallest, limit, storey, story, floor, level",  
      "📐 Measurements: meter/metre/m, foot/feet/ft, yard/yd, square meter/sq m/m², square foot/sq ft/ft²",
      "🏗️ Building: structure, building, construction, dwelling, residence, residential, home, house, unit",
      "📋 Legal: permit, permission, authorization, approval, regulation, bylaw, by-law, code, ordinance, requirement, allowed, permitted, prohibited, compliance",
      "📍 Property: lot, property, parcel, site, setback, yard requirement, separation, coverage, lot coverage, building coverage, footprint, area, floor area, GFA"
    ],
    tips: [
      "Search ONE term from any group to find documents with ALL terms",
      "Example: Search 'max' automatically finds 'maximum', 'highest', 'limit', etc.",
      "Example: Search 'ADU' automatically finds 'garden suite', 'laneway house', 'ARU', etc."
    ]
  },
  {
    title: "Common Examples",
    description: "See what works and what doesn't",
    steps: [
      "✅ Search 'maximum height' → finds height regulations",
      "❌ Search 'how tall can I build' → may find nothing",
      "✅ Use Toronto filter + 'garden suite' → finds Toronto ADU rules",
      "❌ Search 'Toronto garden suite rules' → less effective than using filters"
    ],
    tips: [
      "For height limits: Search 'maximum height' or 'height limit'",
      "For setbacks: Search 'setback' or 'minimum distance'",
      "For permits: Search 'permit required' or 'building permit'",
      "For coverage: Search 'lot coverage' or 'building coverage'"
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