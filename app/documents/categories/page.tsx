"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  FileText, 
  Search, 
  Building2, 
  Car, 
  Trees, 
  Home, 
  Shield, 
  DollarSign,
  Users,
  Gavel,
  Zap,
  Volume2
} from "lucide-react"

interface DocumentCategory {
  id: string
  name: string
  description: string
  icon: React.ComponentType<any>
  color: string
  documentCount: number
  relevantCount: number
  keywords: string[]
  examples: string[]
}

export default function DocumentCategoriesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Mock categories - in a real app, these would come from the API based on document analysis
  const categories: DocumentCategory[] = [
    {
      id: 'zoning',
      name: 'Zoning & Land Use',
      description: 'Bylaws related to zoning, land use planning, and development regulations',
      icon: Building2,
      color: 'bg-blue-100 text-blue-800',
      documentCount: 1247,
      relevantCount: 892,
      keywords: ['zoning', 'land use', 'development', 'planning', 'subdivision', 'variance'],
      examples: ['Zoning Bylaw 2023-001', 'Site Plan Control Bylaw', 'Development Charges Bylaw']
    },
    {
      id: 'parking',
      name: 'Parking & Traffic',
      description: 'Traffic regulations, parking restrictions, and road use bylaws',
      icon: Car,
      color: 'bg-green-100 text-green-800',
      documentCount: 623,
      relevantCount: 445,
      keywords: ['parking', 'traffic', 'road', 'vehicle', 'speed limit', 'no parking'],
      examples: ['Parking Bylaw 2023-045', 'Traffic Control Bylaw', 'Street Parking Regulations']
    },
    {
      id: 'environmental',
      name: 'Environmental',
      description: 'Environmental protection, tree preservation, and green space bylaws',
      icon: Trees,
      color: 'bg-emerald-100 text-emerald-800',
      documentCount: 384,
      relevantCount: 298,
      keywords: ['environment', 'tree', 'green', 'conservation', 'pollution', 'waste'],
      examples: ['Tree Preservation Bylaw', 'Environmental Protection Bylaw', 'Green Roof Bylaw']
    },
    {
      id: 'building',
      name: 'Building & Construction',
      description: 'Building codes, construction permits, and property maintenance',
      icon: Home,
      color: 'bg-orange-100 text-orange-800',
      documentCount: 756,
      relevantCount: 534,
      keywords: ['building', 'construction', 'permit', 'inspection', 'code', 'maintenance'],
      examples: ['Building Code Bylaw', 'Property Standards Bylaw', 'Demolition Control Bylaw']
    },
    {
      id: 'business',
      name: 'Business & Licensing',
      description: 'Business licenses, commercial regulations, and trade bylaws',
      icon: DollarSign,
      color: 'bg-purple-100 text-purple-800',
      documentCount: 445,
      relevantCount: 321,
      keywords: ['business', 'license', 'commercial', 'trade', 'permit', 'operation'],
      examples: ['Business License Bylaw', 'Street Vendor Bylaw', 'Home Business Bylaw']
    },
    {
      id: 'public-safety',
      name: 'Public Safety',
      description: 'Public safety, emergency services, and security regulations',
      icon: Shield,
      color: 'bg-red-100 text-red-800',
      documentCount: 298,
      relevantCount: 267,
      keywords: ['safety', 'emergency', 'fire', 'security', 'public order', 'protection'],
      examples: ['Fire Safety Bylaw', 'Public Order Bylaw', 'Emergency Response Bylaw']
    },
    {
      id: 'animal',
      name: 'Animal Control',
      description: 'Pet bylaws, animal control, and wildlife management',
      icon: Users,
      color: 'bg-yellow-100 text-yellow-800',
      documentCount: 187,
      relevantCount: 156,
      keywords: ['animal', 'pet', 'dog', 'cat', 'wildlife', 'control'],
      examples: ['Dog Control Bylaw', 'Pet Licensing Bylaw', 'Wildlife Protection Bylaw']
    },
    {
      id: 'governance',
      name: 'Governance & Procedures',
      description: 'Municipal procedures, council operations, and administrative bylaws',
      icon: Gavel,
      color: 'bg-indigo-100 text-indigo-800',
      documentCount: 234,
      relevantCount: 187,
      keywords: ['procedure', 'council', 'governance', 'administrative', 'meeting', 'policy'],
      examples: ['Procedure Bylaw', 'Council Code of Conduct', 'Administrative Penalties Bylaw']
    },
    {
      id: 'utilities',
      name: 'Utilities & Services',
      description: 'Water, sewer, utilities, and municipal service bylaws',
      icon: Zap,
      color: 'bg-cyan-100 text-cyan-800',
      documentCount: 167,
      relevantCount: 134,
      keywords: ['water', 'sewer', 'utility', 'service', 'infrastructure', 'maintenance'],
      examples: ['Water Utility Bylaw', 'Sewer Use Bylaw', 'Utility Right-of-Way Bylaw']
    },
    {
      id: 'noise',
      name: 'Noise Control',
      description: 'Noise bylaws, sound regulations, and nuisance control',
      icon: Volume2,
      color: 'bg-pink-100 text-pink-800',
      documentCount: 123,
      relevantCount: 98,
      keywords: ['noise', 'sound', 'quiet', 'disturbance', 'nuisance', 'hours'],
      examples: ['Noise Control Bylaw', 'Construction Hours Bylaw', 'Public Nuisance Bylaw']
    }
  ]

  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    category.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    category.keywords.some(keyword => 
      keyword.toLowerCase().includes(searchQuery.toLowerCase())
    )
  )

  const totalDocuments = categories.reduce((sum, cat) => sum + cat.documentCount, 0)
  const totalRelevant = categories.reduce((sum, cat) => sum + cat.relevantCount, 0)

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Document Categories</h1>
          <p className="text-muted-foreground">
            Browse bylaw documents organized by category and topic
          </p>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDocuments.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Across all categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Relevant Documents</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRelevant.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {Math.round((totalRelevant / totalDocuments) * 100)}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
            <p className="text-xs text-muted-foreground">Document categories</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="h-5 w-5" />
            <span>Search Categories</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search categories by name, description, or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="grid" className="space-y-6">
        <TabsList>
          <TabsTrigger value="grid">Grid View</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
        </TabsList>

        <TabsContent value="grid">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCategories.map((category) => {
              const IconComponent = category.icon
              return (
                <Card key={category.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${category.color}`}>
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{category.name}</CardTitle>
                        </div>
                      </div>
                      <Badge variant="secondary">{category.documentCount}</Badge>
                    </div>
                    <CardDescription className="line-clamp-2">
                      {category.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Relevant documents</span>
                      <span className="font-medium">{category.relevantCount}</span>
                    </div>
                    
                    <div className="space-y-2">
                      <span className="text-sm font-medium">Keywords:</span>
                      <div className="flex flex-wrap gap-1">
                        {category.keywords.slice(0, 4).map(keyword => (
                          <Badge key={keyword} variant="outline" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                        {category.keywords.length > 4 && (
                          <Badge variant="outline" className="text-xs">
                            +{category.keywords.length - 4} more
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <Link href={`/documents?category=${category.id}`}>
                        <Button className="w-full" variant="outline">
                          View Documents
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="list">
          <div className="space-y-4">
            {filteredCategories.map((category) => {
              const IconComponent = category.icon
              return (
                <Card key={category.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4 flex-1">
                        <div className={`p-3 rounded-lg ${category.color}`}>
                          <IconComponent className="h-6 w-6" />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center space-x-2">
                            <h3 className="text-xl font-semibold">{category.name}</h3>
                            <Badge variant="secondary">{category.documentCount} docs</Badge>
                            <Badge variant="outline">{category.relevantCount} relevant</Badge>
                          </div>
                          <p className="text-muted-foreground">{category.description}</p>
                          
                          <div className="space-y-2">
                            <div>
                              <span className="text-sm font-medium">Keywords: </span>
                              <span className="text-sm text-muted-foreground">
                                {category.keywords.join(', ')}
                              </span>
                            </div>
                            <div>
                              <span className="text-sm font-medium">Examples: </span>
                              <span className="text-sm text-muted-foreground">
                                {category.examples.join(', ')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <Link href={`/documents?category=${category.id}`}>
                          <Button variant="outline">
                            View Documents
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>

      {filteredCategories.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No categories found</h3>
            <p className="text-muted-foreground mb-4">
              No categories match your search criteria. Try different keywords.
            </p>
            <Button onClick={() => setSearchQuery('')} variant="outline">
              Clear Search
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Popular Categories Quick Links */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Popular Categories</CardTitle>
          <CardDescription>
            Quick access to the most commonly accessed document categories
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {categories
              .sort((a, b) => b.documentCount - a.documentCount)
              .slice(0, 6)
              .map(category => (
                <Link key={category.id} href={`/documents?category=${category.id}`}>
                  <Badge 
                    variant="secondary" 
                    className="cursor-pointer hover:bg-secondary/80 px-3 py-1"
                  >
                    {category.name} ({category.documentCount})
                  </Badge>
                </Link>
              ))
            }
          </div>
        </CardContent>
      </Card>
    </div>
  )
}