"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  FileText, 
  Building2, 
  Car, 
  Trees, 
  Home, 
  Shield, 
  DollarSign,
  Users,
  Gavel,
  Zap,
  Volume2,
  Loader2,
  AlertCircle,
  RefreshCw,
  List,
  Grid3x3
} from "lucide-react"
import { useCategories } from "@/hooks/use-categories"

// Map icon names to components
const iconMap: Record<string, React.ComponentType<any>> = {
  'Building2': Building2,
  'Home': Home,
  'Car': Car,
  'Zap': Zap,
  'Shield': Shield,
  'FileText': FileText,
  'Trees': Trees,
  'DollarSign': DollarSign,
  'Users': Users,
  'Gavel': Gavel,
  'Volume2': Volume2
}

export default function DocumentCategoriesPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const { categories, totals, loading, error, refresh } = useCategories()

  // Sort categories by total documents
  const sortedCategories = [...categories].sort((a, b) => b.totalDocuments - a.totalDocuments)

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p>Error loading categories: {error}</p>
            </div>
            <Button onClick={refresh} variant="outline" className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Document Categories</h1>
            <p className="text-muted-foreground">
              Browse bylaw documents organized by category based on content analysis
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('table')}
              className="h-10 w-10"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('grid')}
              className="h-10 w-10"
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedCategories.map((category) => {
              const IconComponent = iconMap[category.icon] || FileText
              
              return (
                <Card key={category.id} className="hover:shadow-lg transition-shadow">
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
                      <Badge variant="secondary">{category.totalDocuments}</Badge>
                    </div>
                    <CardDescription className="line-clamp-2">
                      {category.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="pt-4">
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
      )}

      {viewMode === 'table' && (
          <div className="space-y-4">
            {sortedCategories.map((category) => {
              const IconComponent = iconMap[category.icon] || FileText
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
                            <Badge variant="secondary">{category.totalDocuments} documents</Badge>
                          </div>
                          <p className="text-muted-foreground">{category.description}</p>
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
      )}

      {sortedCategories.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No categories found</h3>
            <p className="text-muted-foreground mb-4">
              No categorized documents found yet. Documents are being processed.
            </p>
          </CardContent>
        </Card>
      )}

    </div>
  )
}