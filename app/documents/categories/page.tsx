'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Building2, 
  Home, 
  Car, 
  Wrench, 
  MapPin, 
  FileText, 
  Ruler
} from 'lucide-react'

interface CategoryStats {
  category: string
  total: number
  documentCount: number
  averageScore: number
}

const categoryConfig: Record<string, { icon: any; gradient: string; description: string }> = {
  'Zoning': {
    icon: MapPin,
    gradient: 'from-blue-600 to-blue-400',
    description: 'Land use regulations and zoning classifications'
  },
  'Infrastructure': {
    icon: Wrench,
    gradient: 'from-emerald-600 to-emerald-400',
    description: 'Public works, utilities, and infrastructure requirements'
  },
  'Dimensional Requirements': {
    icon: Ruler,
    gradient: 'from-purple-600 to-purple-400',
    description: 'Setbacks, lot sizes, and dimensional standards'
  },
  'Property Specifications': {
    icon: FileText,
    gradient: 'from-orange-600 to-orange-400',
    description: 'Property standards and specifications'
  },
  'Existing Buildings': {
    icon: Building2,
    gradient: 'from-rose-600 to-rose-400',
    description: 'Regulations for existing structures and renovations'
  },
  'Building Types': {
    icon: Home,
    gradient: 'from-indigo-600 to-indigo-400',
    description: 'Different building classifications and types'
  },
  'Parking/Access': {
    icon: Car,
    gradient: 'from-amber-600 to-amber-400',
    description: 'Parking requirements and accessibility standards'
  },
  'ADU/ARU Regulations': {
    icon: Home,
    gradient: 'from-pink-600 to-pink-400',
    description: 'Additional dwelling unit regulations'
  }
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/categories/stats')
      
      if (!response.ok) {
        throw new Error('Failed to fetch categories')
      }
      
      const data = await response.json()
      setCategories(data.categories || [])
    } catch (err) {
      console.error('Error fetching categories:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch categories')
    } finally {
      setLoading(false)
    }
  }

  const maxTotal = Math.max(...categories.map(c => c.total), 1)

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Document Categories</h1>
          <p className="text-muted-foreground">Browse bylaws organized by category</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="shadow-sm">
              <CardHeader>
                <div className="space-y-4">
                  <Skeleton className="h-11 w-11 rounded-lg" />
                  <div>
                    <Skeleton className="h-6 w-32 mb-2" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Document Categories</h1>
          <p className="text-muted-foreground">Browse bylaws organized by category</p>
        </div>
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error loading categories</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Document Categories</h1>
        <p className="text-muted-foreground">
          Browse bylaws organized by category based on content analysis
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const config = categoryConfig[category.category] || {
            icon: FileText,
            gradient: 'from-gray-600 to-gray-400',
            description: 'Documents in this category'
          }
          const Icon = config.icon

          return (
            <Link 
              key={category.category}
              href={`/documents?category=${encodeURIComponent(category.category)}`}
            >
              <Card className="group relative overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer h-full">
                <CardHeader className="relative">
                  <div className="space-y-4">
                    <div className="inline-flex p-2.5 rounded-lg bg-muted">
                      <Icon className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-semibold tracking-tight mb-2">
                        {category.category}
                      </CardTitle>
                      <CardDescription className="text-sm leading-relaxed">
                        {config.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          )
        })}
      </div>

      {categories.length === 0 && !loading && (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">No categories found</p>
            <p className="text-muted-foreground">
              Document categorization is being processed. Please check back later.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}