import { useState, useEffect } from 'react'

interface CategoryStats {
  id: string
  name: string
  description: string
  icon: string
  color: string
  strongMatches: number
  moderateMatches: number
  weakMatches: number
  totalDocuments: number
  avgScore: number
}

interface CategoryData {
  categories: CategoryStats[]
  totals: {
    totalDocuments: number
    strongMatches: number
    moderateMatches: number
    weakMatches: number
  }
  lastUpdated: string
}

export function useCategories() {
  const [data, setData] = useState<CategoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/categories/stats')
      
      if (!response.ok) {
        throw new Error(`Failed to fetch categories: ${response.statusText}`)
      }
      
      const result = await response.json()
      setData(result)
    } catch (err) {
      console.error('Error fetching categories:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch categories')
    } finally {
      setLoading(false)
    }
  }

  return {
    categories: data?.categories || [],
    totals: data?.totals || {
      totalDocuments: 0,
      strongMatches: 0,
      moderateMatches: 0,
      weakMatches: 0
    },
    loading,
    error,
    refresh: fetchCategories
  }
}