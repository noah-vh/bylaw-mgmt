import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'
import { z } from 'zod'

// Validation schema for global search
const globalSearchSchema = z.object({
  q: z.string().min(2).max(255),
  types: z.array(z.enum(['documents', 'municipalities', 'keywords', 'scrapers'])).optional(),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 100), // Much higher default, no artificial max
})

// GET /api/search/global - Global search across documents, municipalities, and keywords
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const searchParams = request.nextUrl.searchParams
    const queryParams = {
      q: searchParams.get('q') || '',
      types: searchParams.getAll('types[]'),
      limit: searchParams.get('limit') || '5',
    }
    
    const validation = globalSearchSchema.safeParse(queryParams)
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid search parameters',
          details: validation.error.format()
        },
        { status: 400 }
      )
    }
    
    const { q: query, types = ['documents', 'municipalities', 'keywords', 'scrapers'], limit } = validation.data

    const results = {
      documents: [] as any[],
      municipalities: [] as any[],
      keywords: [] as any[],
      scrapers: [] as any[],
    }

    // Parallel search across different types
    const searchPromises = []

    // Search documents
    if (types.includes('documents')) {
      searchPromises.push(
        (async () => {
          try {
            // Use direct query for document search
            console.log('Global search - searching documents for:', query, 'with limit:', limit)
            
            // Get all potential matches without limit, then rank them
            const searchWords = query.toLowerCase().split(' ').filter(word => word.trim().length > 0)
            
            console.log('Global search - processing query:', { query, searchWords })
            
            // Build comprehensive search conditions
            const conditions = []
            
            // Add exact phrase matches (highest priority) - always include these
            conditions.push(`title.ilike.%${query}%`)
            conditions.push(`filename.ilike.%${query}%`) // Also search filenames
            if (query.trim().length > 0) {
              conditions.push(`and(content_text.not.is.null,content_text.ilike.%${query}%)`)
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
            
            console.log('Global search - search conditions:', conditions)
            
            const { data: allMatches, error: searchError } = await supabase
              .from('pdf_documents')
              .select('*')
              .or(conditions.join(','))
              .limit(1000) // Very high limit to get all matches
              
            if (searchError) {
              console.error('Document search error in global search:', searchError)
              return
            }
            
            console.log('Global search - raw matches found:', allMatches?.length)
            
            // Rank the results
            const rankedResults = allMatches?.map(doc => {
              let score = 0
              const titleLower = doc.title?.toLowerCase() || ''
              const filenameLower = doc.filename?.toLowerCase() || ''
              const contentLower = doc.content_text?.toLowerCase() || ''
              const queryLower = query.toLowerCase()
              
              // Exact phrase matches get highest scores
              if (titleLower.includes(queryLower)) score += 100
              if (filenameLower.includes(queryLower)) score += 90
              if (contentLower.includes(queryLower)) score += 80
              
              // Individual word matches (for multi-word queries)
              searchWords.forEach(word => {
                const wordLower = word.toLowerCase()
                if (titleLower.includes(wordLower)) score += 10
                if (filenameLower.includes(wordLower)) score += 5
                if (contentLower.includes(wordLower)) score += 3
              })
              
              // If no score yet, this document shouldn't be filtered out
              // Give it a minimal score if it matched the database query
              if (score === 0) {
                score = 1 // Minimal score to prevent filtering
              }
              
              // Boost for ADU relevant documents
              if (doc.is_adu_relevant) score += 20
              
              // Boost for analyzed documents
              if (doc.content_analyzed) score += 10
              
              return { ...doc, searchScore: score }
            }).sort((a, b) => b.searchScore - a.searchScore) // Sort by score descending
            .slice(0, limit) // Apply limit after ranking
            
            console.log('Global search - ranked results:', {
              totalRanked: rankedResults?.length,
              topScores: rankedResults?.slice(0, 3).map(doc => ({ title: doc.title, score: doc.searchScore }))
            })
            
            const searchData = rankedResults || []
            
            console.log('Global search - document results:', {
              query,
              resultsCount: searchData?.length || 0,
              hasError: !!searchError,
              firstResultTitle: searchData?.[0]?.title,
              firstResultHasContent: !!searchData?.[0]?.content_text
            })
            
            if (searchError) {
              console.error('Document search error in global search:', searchError)
              return
            }
            
            if (searchData && searchData.length > 0) {
              // Get municipality names
              const municipalityIds = [...new Set(searchData.map(doc => doc.municipality_id).filter(Boolean))]
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

              // Create content snippets for search results
              results.documents = searchData.map(doc => {
                let contentSnippet = null
                
                if (doc.content_text && typeof doc.content_text === 'string' && doc.content_text.trim().length > 0) {
                  const searchTerms = query.toLowerCase().split(' ').filter(Boolean)
                  const content = doc.content_text.toLowerCase()
                  
                  // Find the first occurrence of any search term in content
                  let snippetStart = -1
                  for (const term of searchTerms) {
                    if (term.length > 0) {
                      const index = content.indexOf(term)
                      if (index !== -1 && (snippetStart === -1 || index < snippetStart)) {
                        snippetStart = index
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
                
                return {
                  ...doc,
                  municipality: municipalityMap[doc.municipality_id] ? {
                    id: doc.municipality_id,
                    name: municipalityMap[doc.municipality_id]
                  } : null,
                  highlighted: {
                    title: doc.title,
                    content: contentSnippet
                  }
                }
              })
            }
          } catch (error) {
            console.error('Unexpected error in document search:', error)
          }
        })()
      )
    }

    // Search municipalities
    if (types.includes('municipalities')) {
      searchPromises.push(
        supabase
          .from('municipalities')
          .select(`
            id,
            name,
            website_url,
            status,
            pdf_documents(count)
          `)
          .ilike('name', `%${query}%`)
          .limit(limit)
          .then(({ data, error }) => {
            if (!error && data) {
              results.municipalities = data.map(muni => ({
                ...muni,
                document_count: muni.pdf_documents?.[0]?.count || 0,
                pdf_documents: undefined // Remove the array from response
              }))
            }
          })
      )
    }

    // Search scrapers
    if (types.includes('scrapers')) {
      const availableScrapers = [
        { name: 'ajax', description: 'Ajax Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'brampton', description: 'Brampton Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'burlington', description: 'Burlington Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'caledon', description: 'Caledon Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'hamilton', description: 'Hamilton Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'markham', description: 'Markham Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'milton', description: 'Milton Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'mississauga', description: 'Mississauga Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'oakville', description: 'Oakville Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'oshawa', description: 'Oshawa Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'pickering', description: 'Pickering Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'richmond_hill', description: 'Richmond Hill Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'toronto', description: 'Toronto Municipal Bylaw Scraper', is_enhanced: true, supported: true },
        { name: 'vaughan', description: 'Vaughan Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        { name: 'whitby', description: 'Whitby Municipal Bylaw Scraper', is_enhanced: false, supported: true },
        // New versions
        { name: 'ajax_new', description: 'Ajax Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'brampton_new', description: 'Brampton Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'burlington_new', description: 'Burlington Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'caledon_new', description: 'Caledon Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'hamilton_new', description: 'Hamilton Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'markham_new', description: 'Markham Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'milton_new', description: 'Milton Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'mississauga_new', description: 'Mississauga Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'oakville_new', description: 'Oakville Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'pickering_new', description: 'Pickering Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'richmond_hill_new', description: 'Richmond Hill Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'toronto_new', description: 'Toronto Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'vaughan_new', description: 'Vaughan Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
        { name: 'whitby_new', description: 'Whitby Municipal Bylaw Scraper (New)', is_enhanced: true, supported: true },
      ]
      
      // Filter scrapers that match the query
      const matchingScrapers = availableScrapers.filter(scraper =>
        scraper.name.toLowerCase().includes(query.toLowerCase()) ||
        scraper.description.toLowerCase().includes(query.toLowerCase())
      ).slice(0, limit)
      
      results.scrapers = matchingScrapers
    }

    // Extract keywords from query
    if (types.includes('keywords')) {
      const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 3)
      const commonWords = ['bylaw', 'document', 'municipal', 'regulation', 'policy', 'city', 'town']
      const keywords = words.filter(word => !commonWords.includes(word))
      
      results.keywords = keywords.slice(0, limit).map(keyword => ({
        keyword,
        type: 'keyword',
        relevance: 1 // Could implement a relevance score based on frequency
      }))
    }

    await Promise.all(searchPromises)

    const response = {
      query,
      results,
      meta: {
        duration: Date.now() - startTime,
        types,
        total: results.documents.length + results.municipalities.length + results.keywords.length + results.scrapers.length
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Global search error:', error)
    return NextResponse.json(
      { error: 'Failed to perform global search' },
      { status: 500 }
    )
  }
}

// POST /api/search/global/save - Save a search
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Simple validation
    if (!body.name || !body.query) {
      return NextResponse.json(
        { error: 'Name and query are required' },
        { status: 400 }
      )
    }

    // In a real implementation, this would save to the database
    // For now, we'll just return success
    return NextResponse.json({
      success: true,
      savedSearch: {
        id: crypto.randomUUID(),
        name: body.name,
        query: body.query,
        filters: body.filters || {},
        createdAt: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Save search error:', error)
    return NextResponse.json(
      { error: 'Failed to save search' },
      { status: 500 }
    )
  }
}