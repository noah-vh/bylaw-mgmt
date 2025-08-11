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
    
    const { q: query, types, limit, offset, municipalityIds } = validation.data

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
    
    // Get municipality counts for accurate filtering
    const municipalityCountsPromise = (async () => {
      try {
        // Try the RPC function first
        const { data: counts, error } = await supabase.rpc('get_municipality_counts_for_search', {
          search_query: query
        })
        
        if (!error && counts) {
          results.municipalityCounts = counts
        } else {
          // Fallback: get counts manually (simplified)
          console.log('Municipality counts RPC not available, using simple counts')
          const { data: municipalities } = await supabase
            .from('municipalities')
            .select('id, name')
            .limit(50)
          
          if (municipalities) {
            results.municipalityCounts = municipalities.map(m => ({
              municipality_id: m.id,
              municipality_name: m.name,
              document_count: 0 // Will be updated by frontend
            }))
          }
        }
      } catch (error) {
        console.log('Municipality counts error:', error)
      }
    })()
    
    searchPromises.push(municipalityCountsPromise)

    // Search documents
    if (types && types.includes('documents')) {
      const searchPromise = (async () => {
        try {
          // Try optimized search first if available
          const { data: optimizedData, error: optimizedError } = await supabase.rpc('search_documents_optimized', {
            search_query: query,
            max_results: limit,
            result_offset: offset,
            filter_municipality_ids: municipalityIds && municipalityIds.length > 0 ? municipalityIds : null
          })
          
          if (!optimizedError && optimizedData) {
            console.log('Using optimized search, returned', optimizedData.length, 'documents')
          } else {
            console.log('Optimized search failed:', optimizedError?.message || 'No data returned')
          }
          
          if (!optimizedError && optimizedData) {
            // Process optimized results
            const hasMore = optimizedData.length > 0 && optimizedData[0].has_more
            
            // Get total count using faster count function
            const { data: totalCount } = await supabase.rpc('get_search_count_fast', {
              search_query: query,
              filter_municipality_ids: municipalityIds && municipalityIds.length > 0 ? municipalityIds : null
            })
            
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
            
            // Generate content snippets for optimized results by fetching content_text
            const docIds = optimizedData.map((doc: any) => doc.id)
            let contentSnippets: Record<number, string> = {}
            
            if (docIds.length > 0) {
              const { data: contentData } = await supabase
                .from('pdf_documents')
                .select('id, content_text')
                .in('id', docIds)
                .not('content_text', 'is', null)
              
              // Generate content snippets for documents with content
              if (contentData) {
                contentData.forEach(doc => {
                  if (doc.content_text) {
                    const searchTerms = query.toLowerCase().split(' ').filter(Boolean)
                    const content = doc.content_text.toLowerCase()
                    
                    // Find first match in content
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
                      // Extract a snippet around the found term
                      const start = Math.max(0, snippetStart - 100)
                      const end = Math.min(doc.content_text.length, snippetStart + 200)
                      let snippet = doc.content_text.substring(start, end).trim()
                      if (start > 0) snippet = '...' + snippet
                      if (end < doc.content_text.length) snippet = snippet + '...'
                      
                      // Apply highlighting to the snippet
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
            
            results.pagination.hasMore = hasMore
            results.pagination.documentsTotal = totalCount || -1
            return // Exit early if optimized search worked
          }
          
          // Fallback to simpler search if optimized not available
          console.log('Optimized search not available, using fallback')
          
          // Build the query - ONLY search title and filename to avoid timeout
          let searchQuery = supabase
            .from('pdf_documents')
            .select('*')
          
          // Search only in title and filename for now (content search times out)
          searchQuery = searchQuery.or(`title.ilike.%${query}%,filename.ilike.%${query}%`)
          
          // Add municipality filter if provided
          if (municipalityIds && municipalityIds.length > 0) {
            console.log('Filtering by municipalities:', municipalityIds)
            searchQuery = searchQuery.in('municipality_id', municipalityIds)
          } else {
            console.log('No municipality filter, searching all')
          }
          
          // Fetch one extra result to check if there are more pages
          const { data: fallbackData, error: searchError } = await searchQuery
            .range(offset, offset + limit) // This already limits to limit+1 items
            .order('date_found', { ascending: false }) // Order by newest first
          
          if (searchError) {
            console.error('Search error:', searchError)
          }
          
          console.log('Fallback query returned', fallbackData?.length || 0, 'documents')
            
          if (!searchError && fallbackData) {
              // Check if there are more results (we fetched limit+1)
              const hasMore = fallbackData.length > limit
              const documentsToProcess = hasMore ? fallbackData.slice(0, limit) : fallbackData
              
              // Get municipality names
              const municipalityIds = [...new Set(documentsToProcess.map(doc => doc.municipality_id).filter(Boolean))]
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

              results.documents = documentsToProcess.map(doc => {
                // Create better content snippet with context around matched text
                let contentSnippet = null
                if (doc.content_text) {
                  const content = doc.content_text.toLowerCase()
                  const queryLower = query.toLowerCase()
                  const matchIndex = content.indexOf(queryLower)
                  
                  if (matchIndex !== -1) {
                    // Show context around the match (100 chars before and after)
                    const start = Math.max(0, matchIndex - 100)
                    const end = Math.min(doc.content_text.length, matchIndex + queryLower.length + 100)
                    let snippet = doc.content_text.substring(start, end)
                    
                    // Add ellipsis if we're not at the start/end
                    if (start > 0) snippet = '...' + snippet
                    if (end < doc.content_text.length) snippet = snippet + '...'
                    
                    // Highlight the matched text (case-insensitive replacement)
                    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
                    snippet = snippet.replace(regex, '<mark>$1</mark>')
                    
                    contentSnippet = snippet
                  } else {
                    // Fallback to beginning of content if no match found in content
                    contentSnippet = doc.content_text.substring(0, 200) + '...'
                  }
                }
                
                // Check ADU relevance from categories
                const aduCategoryScore = doc.categories?.['ADU/ARU Regulations'] || 0
                
                return {
                  ...doc,
                  is_relevant: doc.is_relevant, // Map is_relevant to is_relevant for frontend
                  adu_category_score: aduCategoryScore,
                  municipality: municipalityMap[doc.municipality_id] ? {
                    id: doc.municipality_id,
                    name: municipalityMap[doc.municipality_id]
                  } : null,
                  highlighted: {
                    title: doc.title ? doc.title.replace(
                      new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), 
                      '<mark>$1</mark>'
                    ) : doc.title,
                    content: contentSnippet
                  }
                }
              })
              
              // Store pagination info - we don't know total, but we know if there's more
              results.pagination.hasMore = hasMore
              // Estimate total pages (we can't know exact count without timing out)
              results.pagination.documentsTotal = hasMore ? -1 : offset + documentsToProcess.length
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