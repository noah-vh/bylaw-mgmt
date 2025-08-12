import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'
import { z } from 'zod'

// Validation schema for global search
const globalSearchSchema = z.object({
  q: z.string().min(2).max(255),
  types: z.array(z.enum(['documents', 'municipalities', 'keywords'])).optional(),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 100), // Default to 100
  offset: z.string().optional().transform(val => val ? parseInt(val, 10) : 0), // For pagination
  municipalityIds: z.array(z.string().transform(Number)).optional(), // For filtering by municipality
})

// GET /api/search/global - Global search across documents, municipalities, and keywords
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const searchParams = request.nextUrl.searchParams
    const typesParam = searchParams.getAll('types[]')
    const municipalityIdsParam = searchParams.getAll('municipalityIds[]')
    const queryParams = {
      q: searchParams.get('q') || '',
      types: typesParam.length > 0 ? typesParam : ['documents', 'municipalities', 'keywords'],
      limit: searchParams.get('limit') || '100', // Default to 100
      offset: searchParams.get('offset') || '0', // For pagination
      municipalityIds: municipalityIdsParam.length > 0 ? municipalityIdsParam : undefined,
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
    
    const { q: query, types, limit, offset, municipalityIds: rawMunicipalityIds } = validation.data
    
    // Treat empty array as no filter (show all municipalities)
    const municipalityIds = rawMunicipalityIds && rawMunicipalityIds.length > 0 ? rawMunicipalityIds : undefined

    const results = {
      documents: [] as any[],
      municipalities: [] as any[],
      keywords: [] as any[],
      municipalityCounts: [] as any[],
      pagination: {
        documentsTotal: 0,
        hasMore: false,
        offset,
        limit
      }
    }

    // Parallel search across different types
    const searchPromises = []
    
    // Get municipality counts - disabled for now
    const municipalityCountsPromise = (async () => {
      try {
        // Just return empty counts for now - counts feature is disabled
        results.municipalityCounts = []
      } catch (error) {
        console.log('Municipality counts error:', error)
      }
    })()
    
    // Still push it to maintain the promise structure
    searchPromises.push(municipalityCountsPromise)

    // Search documents
    if (types && types.includes('documents')) {
      const searchPromise = (async () => {
        try {
          // Try optimized search first if available
          // Important: Pass null (not empty array) when no municipality filter is applied
          // The DB function expects null to mean "all municipalities"
          const { data: optimizedData, error: optimizedError } = await supabase.rpc('search_documents_optimized', {
            search_query: query,
            max_results: limit,
            result_offset: offset,
            filter_municipality_ids: municipalityIds && municipalityIds.length > 0 ? municipalityIds : null
          })
          
          if (!optimizedError && optimizedData) {
            console.log('Using optimized search, returned', optimizedData.length, 'documents')
            console.log('Search query:', query)
            console.log('Limit:', limit)
            console.log('Offset:', offset)
            console.log('Municipality filters:', municipalityIds)
            if (optimizedData.length > 0) {
              console.log('First result:', optimizedData[0].title)
            }
            
            // Process optimized results
            const hasMore = optimizedData.length > 0 && optimizedData[0].has_more
            
            // Get total count
            const totalCount = hasMore ? -1 : optimizedData.length
            
            if (optimizedData.length > 0) {
              // Get municipality names
              const uniqueMunicipalityIds = [...new Set(optimizedData.map((doc: any) => doc.municipality_id).filter(Boolean))]
              let municipalityMap: Record<number, string> = {}
              
              if (uniqueMunicipalityIds.length > 0) {
                const { data: municipalities } = await supabase
                  .from('municipalities')
                  .select('id, name')
                  .in('id', uniqueMunicipalityIds)
                
                municipalityMap = (municipalities || []).reduce((acc, muni) => {
                  acc[muni.id] = muni.name
                  return acc
                }, {} as Record<number, string>)
              }
              
              // Generate content snippets
              const docIds = optimizedData.map((doc: any) => doc.id)
              let contentSnippets: Record<number, string> = {}
              
              if (docIds.length > 0) {
                const { data: contentData } = await supabase
                  .from('pdf_documents')
                  .select('id, content_text')
                  .in('id', docIds)
                  .not('content_text', 'is', null)
                
                if (contentData) {
                  contentData.forEach(doc => {
                    if (doc.content_text) {
                      const searchTerms = query.toLowerCase().split(' ').filter(Boolean)
                      const content = doc.content_text.toLowerCase()
                      
                      let snippetStart = -1
                      for (const term of searchTerms) {
                        if (term.length > 0) {
                          const index = content.indexOf(term)
                          if (index !== -1) {
                            if (snippetStart === -1 || index < snippetStart) {
                              snippetStart = index
                            }
                          }
                        }
                      }
                      
                      if (snippetStart !== -1) {
                        const start = Math.max(0, snippetStart - 100)
                        const end = Math.min(doc.content_text.length, snippetStart + 200)
                        let snippet = doc.content_text.substring(start, end).trim()
                        if (start > 0) snippet = '...' + snippet
                        if (end < doc.content_text.length) snippet = snippet + '...'
                        
                        searchTerms.forEach(term => {
                          if (term.length > 0) {
                            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                            snippet = snippet.replace(
                              new RegExp(`(${escapedTerm})`, 'gi'),
                              '<mark class="bg-yellow-200 dark:bg-yellow-300 text-black dark:text-black font-medium px-1 py-0.5 rounded shadow-sm">$1</mark>'
                            )
                          }
                        })
                        
                        contentSnippets[doc.id] = snippet
                      }
                    }
                  })
                }
              }

              results.documents = optimizedData.map((doc: any) => ({
                ...doc,
                is_relevant: doc.is_relevant,
                adu_category_score: doc.categories?.['ADU/ARU Regulations'] || 0,
                content_snippet: contentSnippets[doc.id] || null,
                municipality: municipalityMap[doc.municipality_id] ? {
                  id: doc.municipality_id,
                  name: municipalityMap[doc.municipality_id]
                } : null
              }))
            }
            
            results.pagination.hasMore = hasMore
            results.pagination.documentsTotal = totalCount
            console.log('Optimized search successful, processed', results.documents.length, 'documents')
          }
        } catch (error) {
          console.error('Document search error:', error)
        }
      })()
      
      searchPromises.push(searchPromise)
    }

    // Search municipalities
    if (types && types.includes('municipalities')) {
      const municipalityPromise = (async () => {
        try {
          const { data, error } = await supabase
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
          
          if (!error && data) {
            results.municipalities = data.map(muni => ({
              ...muni,
              document_count: muni.pdf_documents?.[0]?.count || 0,
              pdf_documents: undefined // Remove the array from response
            }))
          }
        } catch (error) {
          console.error('Municipality search error:', error)
        }
      })()
      
      searchPromises.push(municipalityPromise)
    }


    // Extract keywords from query
    if (types && types.includes('keywords')) {
      const keywordPromise = (async () => {
        const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 3)
        const commonWords = ['bylaw', 'document', 'municipal', 'regulation', 'policy', 'city', 'town']
        const keywords = words.filter(word => !commonWords.includes(word))
        
        results.keywords = keywords.slice(0, limit).map(keyword => ({
          keyword,
          type: 'keyword',
          relevance: 1 // Could implement a relevance score based on frequency
        }))
      })()
      
      searchPromises.push(keywordPromise)
    }

    // Wait for all searches to complete
    await Promise.all(searchPromises)

    // Post-process: If municipality counts are all 0, calculate from actual document results
    if (results.municipalityCounts && results.municipalityCounts.length > 0) {
      const hasAnyCounts = results.municipalityCounts.some((mc: any) => mc.document_count > 0)
      
      if (!hasAnyCounts && results.documents.length > 0) {
        console.log('All municipality counts are 0, calculating from actual results...')
        
        // Count documents per municipality from actual results
        const countsMap = new Map<number, number>()
        results.documents.forEach((doc: any) => {
          if (doc.municipality_id) {
            countsMap.set(doc.municipality_id, (countsMap.get(doc.municipality_id) || 0) + 1)
          }
        })
        
        // Update the counts
        results.municipalityCounts = results.municipalityCounts.map((mc: any) => ({
          ...mc,
          document_count: countsMap.get(mc.municipality_id) || 0
        }))
        
        // Note: This only accounts for documents in the current page,
        // but it's better than showing 0 for municipalities that clearly have results
        console.log('Updated municipality counts from results:', countsMap.size, 'municipalities with documents')
      }
    }

    const response = {
      query,
      results,
      meta: {
        duration: Date.now() - startTime,
        types,
        total: results.documents.length + results.municipalities.length + results.keywords.length,
        pagination: results.pagination
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