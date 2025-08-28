import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'
import { z } from 'zod'
import { expandQuery, getSynonyms } from '../../../../lib/search-synonyms'

// Validation schema for global search
const globalSearchSchema = z.object({
  q: z.string().min(2).max(255),
  types: z.array(z.enum(['documents', 'municipalities', 'keywords'])).optional(),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 100), // Default to 100
  offset: z.string().optional().transform(val => val ? parseInt(val, 10) : 0), // For pagination
  municipalityIds: z.array(z.string().transform(Number)).optional(), // For filtering by municipality
  categories: z.array(z.string()).optional(), // For filtering by categories
  aduType: z.string().optional(), // For filtering by ADU type
})

// GET /api/search/global - Global search across documents, municipalities, and keywords
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const searchParams = request.nextUrl.searchParams
    const typesParam = searchParams.getAll('types[]')
    const municipalityIdsParam = searchParams.getAll('municipalityIds[]')
    const categoriesParam = searchParams.getAll('categories[]')
    const queryParams = {
      q: searchParams.get('q') || '',
      types: typesParam.length > 0 ? typesParam : ['documents', 'municipalities', 'keywords'],
      limit: searchParams.get('limit') || '100', // Default to 100
      offset: searchParams.get('offset') || '0', // For pagination
      municipalityIds: municipalityIdsParam.length > 0 ? municipalityIdsParam : undefined,
      categories: categoriesParam.length > 0 ? categoriesParam : undefined,
      aduType: searchParams.get('aduType') || undefined,
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
    
    const { q: originalQuery, types, limit, offset, municipalityIds: rawMunicipalityIds, categories, aduType } = validation.data
    
    // Expand the query with synonyms for better search results
    const expandedQuery = expandQuery(originalQuery)
    console.log('Original query:', originalQuery)
    console.log('Expanded query:', expandedQuery)
    
    // Use expanded query for search operations
    const query = expandedQuery
    
    // When no municipalities are selected (empty array), pass null to search all municipalities
    const municipalityIds = rawMunicipalityIds && rawMunicipalityIds.length > 0 ? rawMunicipalityIds : null

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
    
    // Get municipality counts - using fast version with timeout protection
    const municipalityCountsPromise = (async () => {
      try {
        let counts: any[] = [];
        
        // If using synonym expansion, calculate counts from actual search results
        if (query !== originalQuery && query.includes('OR')) {
          console.log('Using synonym approach for municipality counts...')
          
          // Get counts by running the same synonym search approach
          const synonymTerms = query.replace(/[()]/g, '').split(' OR ').map(term => term.trim())
          const municipalityCounts = new Map()
          
          for (const term of synonymTerms) {
            try {
              const { data: termCounts } = await supabase.rpc('get_search_municipality_counts_fast', {
                search_query: term,
                filter_municipality_ids: null
              });
              
              if (termCounts) {
                termCounts.forEach((count: any) => {
                  const existing = municipalityCounts.get(count.municipality_id) || 0
                  // Add counts but don't double-count the same documents
                  municipalityCounts.set(count.municipality_id, Math.max(existing, count.document_count))
                })
              }
            } catch (error) {
              console.error(`Error getting counts for term "${term}":`, error)
            }
          }
          
          // Convert Map back to array
          counts = Array.from(municipalityCounts.entries()).map(([municipality_id, document_count]) => ({
            municipality_id,
            document_count
          }))
          
        } else {
          // Standard approach for non-synonym queries
          const { data, error } = await supabase.rpc('get_search_municipality_counts_fast', {
            search_query: query,
            filter_municipality_ids: null  // Always pass null to get all municipality counts
          });
          
          if (error) {
            console.error('Municipality counts error:', error);
          } else {
            counts = data || [];
          }
        }
        
        results.municipalityCounts = counts;
      } catch (error) {
        console.error('Municipality counts error:', error);
        results.municipalityCounts = [];
      }
    })()
    
    // Still push it to maintain the promise structure
    searchPromises.push(municipalityCountsPromise)

    // Search documents
    if (types && types.includes('documents')) {
      const searchPromise = (async () => {
        try {
          // Try optimized search first if available
          console.log('Calling search_documents_optimized with:', {
            search_query: query,
            max_results: limit,
            result_offset: offset,
            filter_municipality_ids: municipalityIds,
            municipalityIds_length: municipalityIds ? municipalityIds.length : 'null (all municipalities)',
            municipalityIds_is_null: municipalityIds === null,
            municipalityIds_type: typeof municipalityIds
          })
          
          // If the query contains synonyms (expanded), try a different approach
          let optimizedData: any[] = []
          let optimizedError: any = null
          
          if (query !== originalQuery && query.includes('OR')) {
            // For synonym queries, search each term individually and combine results
            console.log('Using synonym search approach...')
            const synonymTerms = query.replace(/[()]/g, '').split(' OR ').map(term => term.trim())
            const allResults = new Map() // Use Map to deduplicate by document ID
            
            for (const term of synonymTerms) {
              try {
                const { data: termData } = await supabase.rpc('search_documents_optimized', {
                  search_query: term,
                  max_results: Math.ceil(limit / synonymTerms.length * 2), // Get more per term
                  result_offset: 0,
                  filter_municipality_ids: municipalityIds
                })
                
                if (termData) {
                  termData.forEach((doc: any) => {
                    allResults.set(doc.id, doc) // Deduplicate by ID
                  })
                }
              } catch (error) {
                console.error(`Error searching for term "${term}":`, error)
              }
            }
            
            optimizedData = Array.from(allResults.values())
              .sort((a, b) => {
                // Sort by relevance, then by date
                if (a.is_relevant && !b.is_relevant) return -1
                if (!a.is_relevant && b.is_relevant) return 1
                return new Date(b.date_found).getTime() - new Date(a.date_found).getTime()
              })
              .slice(offset, offset + limit) // Apply pagination
              
          } else {
            // Standard search for non-synonym queries
            console.log('Making standard RPC call to search_documents_optimized...')
            const { data, error } = await supabase.rpc('search_documents_optimized', {
              search_query: query,
              max_results: limit,
              result_offset: offset,
              filter_municipality_ids: municipalityIds
            })
            optimizedData = data
            optimizedError = error
            console.log('RPC call completed:', {
              dataLength: data ? data.length : 0,
              error: error,
              hasData: !!data
            })
          }
          
          if (optimizedError) {
            console.error('Search error:', optimizedError)
            
            // If optimized search fails (likely timeout), try municipality-by-municipality search
            if (optimizedError.code === '57014' && !municipalityIds) {
              console.log('Timeout detected for all-municipality search, trying per-municipality search...')
              
              // Get all municipalities first
              const { data: allMunicipalities } = await supabase
                .from('municipalities')
                .select('id, name')
                .order('name')
              
              if (allMunicipalities && allMunicipalities.length > 0) {
                console.log(`Searching ${allMunicipalities.length} municipalities individually...`)
                
                const allResults: any[] = []
                const resultsPerMunicipality = Math.max(2, Math.floor(limit / allMunicipalities.length)) // Distribute results across ALL municipalities
                
                // Search ALL municipalities individually
                const municipalitiesToSearch = allMunicipalities
                
                for (const municipality of municipalitiesToSearch) {
                  try {
                    const { data: municipalityResults } = await supabase.rpc('search_documents_optimized', {
                      search_query: query,
                      max_results: resultsPerMunicipality,
                      result_offset: 0,
                      filter_municipality_ids: [municipality.id]
                    })
                    
                    if (municipalityResults && municipalityResults.length > 0) {
                      // Add municipality name to each result
                      const resultsWithMunicipality = municipalityResults.map((doc: any) => ({
                        ...doc,
                        municipality: { id: municipality.id, name: municipality.name }
                      }))
                      allResults.push(...resultsWithMunicipality)
                    }
                  } catch (municipalityError) {
                    console.error(`Error searching municipality ${municipality.name}:`, municipalityError)
                    // Continue with other municipalities
                  }
                  
                  // Stop if we have enough results
                  if (allResults.length >= limit) {
                    break
                  }
                }
                
                // Sort all results by relevance and date
                allResults.sort((a, b) => {
                  // First by relevance
                  if (a.is_relevant && !b.is_relevant) return -1
                  if (!a.is_relevant && b.is_relevant) return 1
                  // Then by date
                  return new Date(b.date_found).getTime() - new Date(a.date_found).getTime()
                })
                
                // Take only the requested number of results
                const finalResults = allResults.slice(0, limit)
                
                results.documents = finalResults.map(doc => ({
                  ...doc,
                  is_relevant: doc.is_relevant,
                  adu_category_score: doc.categories?.['ADU/ARU Regulations'] || 0,
                  content_snippet: null, // Skip snippets for performance
                  has_more: false
                }))
                
                results.pagination.hasMore = allResults.length > limit
                results.pagination.documentsTotal = -1 // Unknown total
                
                console.log(`Per-municipality search successful: ${finalResults.length} documents from ${allMunicipalities.length} municipalities`)
              }
            }
          } else if (!optimizedError && optimizedData) {
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
                      // Get all terms to highlight: original terms + their synonyms
                      const originalTerms = originalQuery.toLowerCase().split(' ').filter(Boolean)
                      const allTermsToHighlight = new Set(originalTerms)
                      
                      // Add synonyms for each original term
                      originalTerms.forEach(term => {
                        const cleanTerm = term.replace(/[^\w\s'-]/g, '')
                        if (cleanTerm) {
                          const synonyms = getSynonyms(cleanTerm)
                          synonyms.forEach(synonym => {
                            // Only add single-word synonyms to avoid complex highlighting
                            if (!synonym.includes(' ') && synonym.length > 2) {
                              allTermsToHighlight.add(synonym.toLowerCase())
                            }
                          })
                        }
                      })
                      
                      const content = doc.content_text.toLowerCase()
                      const termsArray = Array.from(allTermsToHighlight)
                      
                      // Find the best snippet location based on any matching term
                      let snippetStart = -1
                      let foundTerm = ''
                      
                      for (const term of termsArray) {
                        if (term.length > 0) {
                          const index = content.indexOf(term)
                          if (index !== -1) {
                            if (snippetStart === -1 || index < snippetStart) {
                              snippetStart = index
                              foundTerm = term
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
                        
                        // Highlight all matching terms in the snippet
                        termsArray.forEach(term => {
                          if (term.length > 0) {
                            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                            snippet = snippet.replace(
                              new RegExp(`(${escapedTerm})`, 'gi'),
                              '<mark class="bg-yellow-100 dark:bg-yellow-100/20 text-yellow-800 dark:text-yellow-200 font-medium px-1 py-0.5 rounded">$1</mark>'
                            )
                          }
                        })
                        
                        contentSnippets[doc.id] = snippet
                      }
                    }
                  })
                }
              }

              // Filter results by categories and ADU type
              let filteredData = optimizedData
              
              // Filter by categories
              if (categories && categories.length > 0) {
                filteredData = filteredData.filter((doc: any) => {
                  if (!doc.categories) return false
                  return categories.some(category => {
                    const score = doc.categories[category]
                    return typeof score === 'number' && score >= 1
                  })
                })
              }
              
              // Filter by ADU type (search in content and title)
              if (aduType) {
                const aduTypeKeywords: Record<string, string[]> = {
                  'accessory-dwelling-unit': ['accessory dwelling unit', 'adu', 'accessory unit'],
                  'laneway-home': ['laneway home', 'laneway house', 'lane way home', 'lane way house'],
                  'garden-suite': ['garden suite', 'backyard suite', 'garden unit'],
                  'tiny-home': ['tiny home', 'tiny house', 'micro home'],
                  'coach-house': ['coach house', 'carriage house', 'coach home'],
                  'granny-flat': ['granny flat', 'in-law suite', 'mother-in-law suite', 'in law suite'],
                  'secondary-suite': ['secondary suite', 'second suite', 'basement suite'],
                  'additional-residential-unit': ['additional residential unit', 'aru', 'additional unit']
                }
                
                const keywords = aduTypeKeywords[aduType] || []
                if (keywords.length > 0) {
                  filteredData = filteredData.filter((doc: any) => {
                    const titleAndFilename = `${doc.title} ${doc.filename || ''}`.toLowerCase()
                    const contentText = doc.content_text ? doc.content_text.toLowerCase().substring(0, 2000) : ''
                    const searchText = `${titleAndFilename} ${contentText}`
                    return keywords.some(keyword => searchText.includes(keyword.toLowerCase()))
                  })
                }
              }

              results.documents = filteredData.map((doc: any) => ({
                ...doc,
                is_relevant: doc.is_relevant,
                adu_category_score: doc.categories?.['ADU/ARU Regulations'] || 0,
                content_snippet: contentSnippets[doc.id] || null,
                municipality: municipalityMap[doc.municipality_id] ? {
                  id: doc.municipality_id,
                  name: municipalityMap[doc.municipality_id]
                } : null
              }))
              
              console.log('Mapped documents to results.documents:', results.documents.length)
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
            .ilike('name', `%${originalQuery}%`)  // Use original query for municipality names
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

    // Municipality counts are now properly calculated by the RPC function
    // No need for fallback logic anymore

    const response = {
      query: originalQuery, // Return original query to frontend
      expandedQuery, // Also include expanded query for debugging
      results,
      meta: {
        duration: Date.now() - startTime,
        types,
        total: results.documents.length + results.municipalities.length + results.keywords.length,
        pagination: results.pagination
      }
    }

    console.log('Final API response summary:', {
      originalQuery,
      expandedQuery,
      documentsReturned: results.documents.length,
      municipalitiesReturned: results.municipalities.length,
      totalResults: response.meta.total,
      duration: response.meta.duration
    })

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