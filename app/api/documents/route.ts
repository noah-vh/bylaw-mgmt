import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'
import { z } from 'zod'

// Validation schema for query parameters
const getDocumentsQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform(val => val ? Math.min(parseInt(val, 10), 100) : 20),
  search: z.string().optional(),
  searchType: z.enum(['basic', 'fulltext']).optional().default('basic'),
  municipalityId: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined),
  isAduRelevant: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
  isAnalyzed: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
  isFavorited: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
  sort: z.enum(['title', 'date_found', 'file_size', 'municipality_name', 'relevance_confidence', 'relevance']).optional().default('date_found'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
})

// GET /api/documents - List documents with filtering and pagination
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams
    const queryParams = Object.fromEntries(searchParams.entries())
    
    const validation = getDocumentsQuerySchema.safeParse(queryParams)
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid query parameters',
          details: validation.error.format()
        },
        { status: 400 }
      )
    }
    
    const { 
      page, 
      limit, 
      search, 
      searchType,
      municipalityId, 
      isAduRelevant, 
      isAnalyzed, 
      isFavorited, 
      sort: sortBy, 
      order: sortOrder 
    } = validation.data

    // Handle full-text search if requested
    if (search && searchType === 'fulltext') {
      const offset = (page - 1) * limit
      
      // Build query for full-text search using PostgreSQL text search
      let searchQuery = supabase
        .from('pdf_documents')
        .select('*', { count: 'exact' })
      
      // Build comprehensive search with ranking
      const searchWords = search.toLowerCase().split(' ').filter(word => word.trim().length > 0)
      const conditions = []
      
      console.log('Documents API - processing search:', { search, searchWords })
      
      // Add exact phrase matches - always include these
      conditions.push(`title.ilike.%${search}%`)
      conditions.push(`filename.ilike.%${search}%`)
      if (search.trim().length > 0) {
        conditions.push(`and(content_text.not.is.null,content_text.ilike.%${search}%)`)
      }
      
      // Add individual word matches if we have multiple words
      if (searchWords.length > 1) {
        searchWords.forEach(word => {
          if (word.trim().length > 0) {
            conditions.push(`title.ilike.%${word}%`)
            conditions.push(`filename.ilike.%${word}%`)
            conditions.push(`and(content_text.not.is.null,content_text.ilike.%${word}%)`)
          }
        })
      }
      
      console.log('Documents API - search conditions:', conditions)
      
      searchQuery = searchQuery.or(conditions.join(','))
      
      // Apply municipality filter
      if (municipalityId) {
        searchQuery = searchQuery.eq('municipality_id', municipalityId)
      }
      
      // Apply other filters
      if (isAduRelevant !== undefined) {
        searchQuery = searchQuery.eq('is_adu_relevant', isAduRelevant)
      }
      
      if (isAnalyzed !== undefined) {
        searchQuery = searchQuery.eq('content_analyzed', isAnalyzed)
      }
      
      if (isFavorited !== undefined) {
        searchQuery = searchQuery.eq('is_favorited', isFavorited)
      }
      
      // Apply sorting
      if (sortBy === 'municipality_name') {
        searchQuery = searchQuery.order('municipality_id', { ascending: sortOrder === 'asc' })
      } else {
        searchQuery = searchQuery.order(sortBy, { ascending: sortOrder === 'asc' })
      }
      
      // Get more results for ranking, then paginate
      searchQuery = searchQuery.limit(1000) // Get many results for ranking
      
      const { data: allResults, error: searchError, count } = await searchQuery
      
      console.log('Documents API - raw results found:', allResults?.length)
      
      // Rank the results  
      const rankingWords = search.toLowerCase().split(' ').filter(word => word.trim().length > 0)
      const rankedResults = allResults?.map(doc => {
        let score = 0
        const titleLower = doc.title?.toLowerCase() || ''
        const filenameLower = doc.filename?.toLowerCase() || ''
        const contentLower = doc.content_text?.toLowerCase() || ''
        const queryLower = search.toLowerCase()
        
        // Exact phrase matches get highest scores
        if (titleLower.includes(queryLower)) score += 100
        if (filenameLower.includes(queryLower)) score += 90
        if (contentLower.includes(queryLower)) score += 80
        
        // Individual word matches
        rankingWords.forEach(word => {
          const wordLower = word.toLowerCase()
          if (titleLower.includes(wordLower)) score += 10
          if (filenameLower.includes(wordLower)) score += 5
          if (contentLower.includes(wordLower)) score += 3
        })
        
        // If no score yet, give minimal score to prevent filtering
        if (score === 0) {
          score = 1
        }
        
        // Boost for ADU relevant documents
        if (doc.is_adu_relevant) score += 20
        
        // Boost for analyzed documents  
        if (doc.content_analyzed) score += 10
        
        return { ...doc, searchScore: score }
      }).sort((a, b) => b.searchScore - a.searchScore) // Sort by score descending
      
      // Apply pagination after ranking
      const searchResults = rankedResults?.slice(offset, offset + limit) || []
      
      console.log('Document search results:', {
        searchTerm: search,
        totalMatches: rankedResults?.length || 0,
        actualResults: searchResults?.length,
        firstResult: searchResults?.[0]?.title,
        firstScore: searchResults?.[0]?.searchScore,
        hasContent: searchResults?.[0]?.content_text ? 'yes' : 'no'
      })
      
      if (searchError) {
        console.error('Full-text search error:', searchError)
        return NextResponse.json(
          { error: 'Failed to perform full-text search' },
          { status: 500 }
        )
      }

      // Get municipality names
      const municipalityIds = [...new Set(searchResults?.map(doc => doc.municipality_id).filter(Boolean) || [])]
      let municipalityMap: Record<number, string> = {}
      
      if (municipalityIds.length > 0) {
        const { data: municipalities } = await supabase
          .from('municipalities')
          .select('id, name')
          .in('id', municipalityIds)
        
        municipalityMap = (municipalities || []).reduce((acc, muni) => {
          acc[muni.id] = muni.name
          return acc
        }, {} as Record<number, string>)
      }

      // Transform results with municipality names and content snippets
      const transformedDocuments = searchResults?.map(doc => {
        // Create a content snippet for search results
        let contentSnippet = null
        let matchedInContent = false
        
        if (doc.content_text && typeof doc.content_text === 'string' && doc.content_text.trim().length > 0) {
          const searchTerms = search.toLowerCase().split(' ').filter(Boolean)
          const content = doc.content_text.toLowerCase()
          
          // Check if any search term is found in content
          let snippetStart = -1
          for (const term of searchTerms) {
            if (term.length > 0) {
              const index = content.indexOf(term)
              if (index !== -1) {
                matchedInContent = true
                if (snippetStart === -1 || index < snippetStart) {
                  snippetStart = index
                }
              }
            }
          }
          
          if (snippetStart !== -1) {
            // Extract a snippet around the found term
            const start = Math.max(0, snippetStart - 100)
            const end = Math.min(doc.content_text.length, snippetStart + 200)
            contentSnippet = doc.content_text.substring(start, end).trim()
            if (start > 0) contentSnippet = '...' + contentSnippet
            if (end < doc.content_text.length) contentSnippet = contentSnippet + '...'
          }
        }
        
        // Check if title matches
        const titleMatches = doc.title && search.toLowerCase().split(' ').some(term => 
          term.length > 0 && doc.title.toLowerCase().includes(term)
        )
        
        console.log('Document processing:', {
          title: doc.title,
          hasContent: !!doc.content_text,
          contentLength: doc.content_text?.length || 0,
          titleMatches,
          matchedInContent,
          hasSnippet: !!contentSnippet
        })
        
        return {
          ...doc,
          municipality_name: municipalityMap[doc.municipality_id] || 'Unknown',
          content_snippet: contentSnippet,
          highlighted: {
            title: doc.title,
            content: contentSnippet
          }
        }
      }) || []

      const result = {
        data: transformedDocuments,
        pagination: {
          page,
          limit,
          total: rankedResults?.length || 0, // Use ranked results count
          totalPages: Math.ceil((rankedResults?.length || 0) / limit),
          hasNextPage: offset + limit < (rankedResults?.length || 0),
          hasPrevPage: page > 1
        },
        meta: {
          duration: Date.now() - startTime,
          searchType: 'fulltext',
          filters: {
            search,
            municipalityId,
            isAduRelevant,
            isAnalyzed,
            isFavorited
          }
        }
      }

      return NextResponse.json(result)
    }

    // Build query for basic search
    let query = supabase
      .from('pdf_documents')
      .select('*', { count: 'exact' })

    // Apply filters
    if (search && searchType === 'basic') {
      query = query.or(`title.ilike.%${search}%,filename.ilike.%${search}%`)
    }

    if (municipalityId) {
      query = query.eq('municipality_id', municipalityId)
    }

    if (isAduRelevant !== undefined) {
      query = query.eq('is_adu_relevant', isAduRelevant)
    }

    if (isAnalyzed !== undefined) {
      query = query.eq('content_analyzed', isAnalyzed)
    }

    if (isFavorited !== undefined) {
      query = query.eq('is_favorited', isFavorited)
    }

    // Apply sorting
    if (sortBy === 'municipality_name') {
      // Municipality name sorting will be handled after fetching the data
      query = query.order('municipality_id', { ascending: sortOrder === 'asc' })
    } else {
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })
    }

    // Apply pagination
    const offset = (page - 1) * limit
    query = query.range(offset, offset + limit - 1)

    const { data: documents, error, count } = await query
    
    console.log('Documents query result:', {
      documentsCount: documents?.length,
      totalCount: count,
      municipalityId,
      search,
      firstDoc: documents?.[0]
    })

    if (error) {
      console.error('Database error fetching documents:', error)
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      )
    }

    // Get unique municipality IDs from documents
    const municipalityIds = [...new Set(documents?.map(doc => doc.municipality_id).filter(Boolean) || [])]
    
    // Fetch municipality names
    let municipalityMap: Record<number, string> = {}
    if (municipalityIds.length > 0) {
      const { data: municipalities } = await supabase
        .from('municipalities')
        .select('id, name')
        .in('id', municipalityIds)
      
      municipalityMap = (municipalities || []).reduce((acc, muni) => {
        acc[muni.id] = muni.name
        return acc
      }, {} as Record<number, string>)
    }
    
    // Transform the data to add municipality names
    const transformedDocuments = documents?.map(doc => ({
      ...doc,
      municipality_name: municipalityMap[doc.municipality_id] || 'Unknown'
    })) || []
    
    // Apply client-side sorting for municipality name
    if (sortBy === 'municipality_name') {
      transformedDocuments.sort((a, b) => {
        const nameA = a.municipality_name.toLowerCase()
        const nameB = b.municipality_name.toLowerCase()
        if (sortOrder === 'asc') {
          return nameA.localeCompare(nameB)
        } else {
          return nameB.localeCompare(nameA)
        }
      })
    }

    const result = {
      data: transformedDocuments,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasNextPage: offset + limit < (count || 0),
        hasPrevPage: page > 1
      },
      meta: {
        duration: Date.now() - startTime,
        searchType: search ? searchType : null,
        filters: {
          search,
          municipalityId,
          isAduRelevant,
          isAnalyzed,
          isFavorited
        }
      }
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Unexpected error in GET /api/documents:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/documents - Create new document (for future use)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const { data: document, error } = await supabase
      .from('pdf_documents')
      .insert(body)
      .select()
      .single()

    if (error) {
      console.error('Database error creating document:', error)
      return NextResponse.json(
        { error: 'Failed to create document' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { data: document, message: 'Document created successfully' },
      { status: 201 }
    )

  } catch (error) {
    console.error('Unexpected error in POST /api/documents:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}