/**
 * Enhanced Keyword-Based Content Analyzer with Fuzzy Logic
 * 
 * Analyzes document content using municipality-level keywords with enhanced
 * fuzzy matching, context extraction, and offline-first design.
 * 
 * Features:
 * - Fuzzy keyword matching with similarity scoring
 * - Municipality-specific keyword configuration
 * - Context extraction around matched keywords
 * - Batch processing capabilities
 * - Offline-first operation (no external AI dependencies)
 * - Enhanced logging and progress tracking
 */

import type { DocumentId, MunicipalityId } from '../types/database'

// Default ADU-related keywords with categories and weights
const DEFAULT_ADU_KEYWORDS = [
  // Primary ADU terms (high weight)
  { keyword: 'accessory dwelling unit', weight: 10, category: 'primary' },
  { keyword: 'adu', weight: 9, category: 'primary' },
  { keyword: 'secondary suite', weight: 8, category: 'primary' },
  { keyword: 'secondary unit', weight: 8, category: 'primary' },
  
  // Secondary terms (medium weight)
  { keyword: 'garden suite', weight: 6, category: 'secondary' },
  { keyword: 'granny flat', weight: 6, category: 'secondary' },
  { keyword: 'in-law suite', weight: 6, category: 'secondary' },
  { keyword: 'basement apartment', weight: 7, category: 'secondary' },
  { keyword: 'basement suite', weight: 7, category: 'secondary' },
  { keyword: 'carriage house', weight: 6, category: 'secondary' },
  { keyword: 'laneway house', weight: 6, category: 'secondary' },
  { keyword: 'coach house', weight: 6, category: 'secondary' },
  
  // Supporting terms (lower weight)
  { keyword: 'ancillary dwelling', weight: 5, category: 'supporting' },
  { keyword: 'additional residential unit', weight: 7, category: 'supporting' },
  { keyword: 'detached accessory dwelling', weight: 6, category: 'supporting' },
  { keyword: 'attached accessory dwelling', weight: 6, category: 'supporting' },
  
  // Context terms (very low weight but help with relevance)
  { keyword: 'rental unit', weight: 2, category: 'context' },
  { keyword: 'housing unit', weight: 2, category: 'context' },
  { keyword: 'dwelling unit', weight: 3, category: 'context' },
  { keyword: 'residential unit', weight: 3, category: 'context' }
]

interface KeywordConfig {
  keyword: string
  weight: number
  category: 'primary' | 'secondary' | 'supporting' | 'context'
  variations?: string[]
  isActive?: boolean
}

interface MatchResult {
  keyword: string
  matchType: 'exact' | 'fuzzy' | 'variation'
  similarity: number
  weight: number
  category: string
  count: number
  contexts: string[]
}

export interface FuzzyAnalysisResult {
  documentId: DocumentId
  isRelevant: boolean
  relevanceScore: number
  confidenceScore: number
  matchedKeywords: MatchResult[]
  totalMatches: number
  keywordDensity: number
  contextSnippets: string[]
  error?: string
  metadata: {
    analysisMethod: 'fuzzy_keyword'
    processingTime: number
    wordCount: number
    uniqueKeywords: number
  }
}

export interface BatchAnalysisProgress {
  current: number
  total: number
  currentDocument?: string
  successful: number
  failed: number
  estimatedTimeRemaining?: number
}

/**
 * Enhanced Keyword Analyzer with fuzzy matching capabilities
 */
export class EnhancedKeywordAnalyzer {
  private static instance: EnhancedKeywordAnalyzer

  private constructor() {}

  static getInstance(): EnhancedKeywordAnalyzer {
    if (!EnhancedKeywordAnalyzer.instance) {
      EnhancedKeywordAnalyzer.instance = new EnhancedKeywordAnalyzer()
    }
    return EnhancedKeywordAnalyzer.instance
  }

  /**
   * Calculate Levenshtein distance for fuzzy matching
   */
  private calculateLevenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null))

    for (let i = 0; i <= a.length; i++) {
      matrix[0][i] = i
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[j][0] = j
    }

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + substitutionCost
        )
      }
    }

    return matrix[b.length][a.length]
  }

  /**
   * Calculate similarity score (0-1) between two strings
   */
  private calculateSimilarity(a: string, b: string): number {
    const distance = this.calculateLevenshteinDistance(a.toLowerCase(), b.toLowerCase())
    const maxLength = Math.max(a.length, b.length)
    return maxLength === 0 ? 1 : 1 - (distance / maxLength)
  }

  /**
   * Generate keyword variations for fuzzy matching
   */
  private generateKeywordVariations(keyword: string): string[] {
    const variations = new Set<string>()
    const base = keyword.toLowerCase()
    
    // Add the original
    variations.add(base)
    
    // Common plural/singular variations
    if (base.endsWith('s') && base.length > 3) {
      variations.add(base.slice(0, -1))
    } else {
      variations.add(base + 's')
    }
    
    // Common verb forms
    if (base.length > 4) {
      variations.add(base + 'ing')
      variations.add(base + 'ed')
      if (base.endsWith('e')) {
        variations.add(base.slice(0, -1) + 'ing')
      }
    }
    
    // Common adjective forms
    variations.add(base + 'ly')
    variations.add(base + 'er')
    variations.add(base + 'est')
    
    // Remove duplicates and short variations
    return Array.from(variations).filter(v => v.length > 2)
  }

  /**
   * Extract context around keyword matches
   */
  private extractContext(text: string, matchIndex: number, keyword: string, contextLength: number = 100): string {
    const start = Math.max(0, matchIndex - contextLength)
    const end = Math.min(text.length, matchIndex + keyword.length + contextLength)
    
    let context = text.slice(start, end)
    
    // Add ellipsis for truncated content
    if (start > 0) context = '...' + context
    if (end < text.length) context = context + '...'
    
    return context.trim()
  }

  /**
   * Perform fuzzy keyword analysis on text
   */
  private performFuzzyAnalysis(text: string, keywords: KeywordConfig[]): {
    matches: MatchResult[]
    totalMatches: number
    contextSnippets: string[]
  } {
    const normalizedText = text.toLowerCase()
    const words = normalizedText.split(/\s+/)
    const matches: MatchResult[] = []
    const contextSnippets: string[] = []
    let totalMatches = 0

    for (const keywordConfig of keywords) {
      if (keywordConfig.isActive === false) continue

      const keyword = keywordConfig.keyword.toLowerCase()
      const variations = keywordConfig.variations || this.generateKeywordVariations(keyword)
      
      let keywordMatches = 0
      const contexts: string[] = []

      // 1. Exact phrase matching (highest priority)
      const exactRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
      let match
      while ((match = exactRegex.exec(normalizedText)) !== null) {
        keywordMatches++
        contexts.push(this.extractContext(text, match.index, keyword))
      }

      // 2. Variation matching
      let variationMatches = 0
      for (const variation of variations) {
        if (variation === keyword) continue // Skip original
        
        const variationRegex = new RegExp(`\\b${variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
        let varMatch
        while ((varMatch = variationRegex.exec(normalizedText)) !== null) {
          variationMatches++
          contexts.push(this.extractContext(text, varMatch.index, variation))
        }
      }

      // 3. Fuzzy matching for close matches
      let fuzzyMatches = 0
      const fuzzyThreshold = 0.8 // Minimum similarity for fuzzy matches
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i]
        if (word.length < 3) continue // Skip very short words
        
        const similarity = this.calculateSimilarity(word, keyword)
        if (similarity >= fuzzyThreshold && similarity < 1) { // Fuzzy match (not exact)
          fuzzyMatches++
          // Find the position in original text to extract context
          const wordIndex = text.toLowerCase().indexOf(word)
          if (wordIndex !== -1) {
            contexts.push(this.extractContext(text, wordIndex, word))
          }
        }
      }

      // Record matches if any found
      if (keywordMatches > 0 || variationMatches > 0 || fuzzyMatches > 0) {
        const totalKeywordMatches = keywordMatches + variationMatches + fuzzyMatches
        
        // Determine match type and similarity
        let matchType: 'exact' | 'fuzzy' | 'variation' = 'exact'
        let similarity = 1.0
        
        if (fuzzyMatches > 0 && keywordMatches === 0) {
          matchType = 'fuzzy'
          similarity = fuzzyThreshold // Use threshold as representative similarity
        } else if (variationMatches > 0 && keywordMatches === 0) {
          matchType = 'variation'
          similarity = 0.9 // Variations get high but not perfect similarity
        }

        matches.push({
          keyword: keywordConfig.keyword,
          matchType,
          similarity,
          weight: keywordConfig.weight,
          category: keywordConfig.category,
          count: totalKeywordMatches,
          contexts: contexts.slice(0, 3) // Limit to first 3 contexts per keyword
        })

        totalMatches += totalKeywordMatches
        contextSnippets.push(...contexts.slice(0, 2)) // Add up to 2 contexts to main list
      }
    }

    return {
      matches: matches.sort((a, b) => (b.weight * b.count) - (a.weight * a.count)),
      totalMatches,
      contextSnippets: contextSnippets.slice(0, 5) // Limit to 5 total context snippets
    }
  }

  /**
   * Calculate relevance score from matches
   */
  private calculateRelevanceScore(matches: MatchResult[], wordCount: number): { relevance: number, confidence: number } {
    if (matches.length === 0) {
      return { relevance: 0, confidence: 1.0 }
    }

    let weightedScore = 0
    let totalWeight = 0
    let categoryBonus = 0

    // Weight categories differently
    const categoryMultipliers = {
      primary: 1.0,
      secondary: 0.8,
      supporting: 0.6,
      context: 0.3
    }

    for (const match of matches) {
      const categoryMultiplier = categoryMultipliers[match.category] || 0.5
      const matchScore = match.weight * match.count * match.similarity * categoryMultiplier
      weightedScore += matchScore
      totalWeight += match.weight * categoryMultiplier

      // Bonus for finding primary keywords
      if (match.category === 'primary') {
        categoryBonus += match.count * 0.1
      }
    }

    // Calculate keyword density (matches per 1000 words)
    const density = wordCount > 0 ? (matches.reduce((sum, m) => sum + m.count, 0) / wordCount) * 1000 : 0

    // Base relevance score
    let relevanceScore = Math.min(weightedScore / 50, 1) // Normalize to 0-1

    // Apply bonuses
    relevanceScore += Math.min(categoryBonus, 0.2) // Max 0.2 bonus for primary keywords
    relevanceScore += Math.min(density / 20, 0.1) // Small bonus for high density

    // Calculate confidence based on match quality and diversity
    const uniqueCategories = new Set(matches.map(m => m.category)).size
    const avgSimilarity = matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length
    
    let confidence = 0.5 // Base confidence
    confidence += Math.min(uniqueCategories / 4, 0.3) // Bonus for diverse matches
    confidence += Math.min(avgSimilarity - 0.5, 0.2) // Bonus for high similarity matches

    return {
      relevance: Math.min(Math.max(relevanceScore, 0), 1),
      confidence: Math.min(Math.max(confidence, 0), 1)
    }
  }

  /**
   * Get municipality keywords with fallback to defaults
   */
  async getMunicipalityKeywords(municipalityId: MunicipalityId): Promise<KeywordConfig[]> {
    try {
      // In a real implementation, this would fetch from database
      // For now, return enhanced default keywords
      console.log(`Using default ADU keywords for municipality ${municipalityId}`)
      
      return DEFAULT_ADU_KEYWORDS.map(kw => ({
        ...kw,
        isActive: true,
        variations: this.generateKeywordVariations(kw.keyword)
      }))

    } catch (error) {
      console.error(`Error getting keywords for municipality ${municipalityId}:`, error)
      return DEFAULT_ADU_KEYWORDS.map(kw => ({
        ...kw,
        isActive: true,
        variations: this.generateKeywordVariations(kw.keyword)
      }))
    }
  }

  /**
   * Analyze a single document with enhanced fuzzy matching
   */
  async analyzeDocument(
    documentId: DocumentId,
    contentText: string,
    municipalityId: MunicipalityId,
    keywords?: KeywordConfig[]
  ): Promise<FuzzyAnalysisResult> {
    const startTime = Date.now()

    try {
      if (!contentText || !contentText.trim()) {
        return {
          documentId,
          isRelevant: false,
          relevanceScore: 0,
          confidenceScore: 0,
          matchedKeywords: [],
          totalMatches: 0,
          keywordDensity: 0,
          contextSnippets: [],
          error: 'No content text available for analysis',
          metadata: {
            analysisMethod: 'fuzzy_keyword',
            processingTime: Date.now() - startTime,
            wordCount: 0,
            uniqueKeywords: 0
          }
        }
      }

      // Get keywords if not provided
      if (!keywords) {
        keywords = await this.getMunicipalityKeywords(municipalityId)
      }

      // Perform fuzzy analysis
      const analysis = this.performFuzzyAnalysis(contentText, keywords)
      
      // Calculate scores
      const wordCount = contentText.split(/\s+/).length
      const { relevance, confidence } = this.calculateRelevanceScore(analysis.matches, wordCount)
      const keywordDensity = wordCount > 0 ? (analysis.totalMatches / wordCount) * 1000 : 0

      // Determine relevance (threshold can be adjusted)
      const isRelevant = relevance > 0.15 && analysis.matches.length > 0

      const processingTime = Date.now() - startTime

      return {
        documentId,
        isRelevant,
        relevanceScore: Math.round(relevance * 100) / 100,
        confidenceScore: Math.round(confidence * 100) / 100,
        matchedKeywords: analysis.matches,
        totalMatches: analysis.totalMatches,
        keywordDensity: Math.round(keywordDensity * 100) / 100,
        contextSnippets: analysis.contextSnippets,
        metadata: {
          analysisMethod: 'fuzzy_keyword',
          processingTime,
          wordCount,
          uniqueKeywords: analysis.matches.length
        }
      }

    } catch (error) {
      console.error(`Error analyzing document ${documentId}:`, error)
      return {
        documentId,
        isRelevant: false,
        relevanceScore: 0,
        confidenceScore: 0,
        matchedKeywords: [],
        totalMatches: 0,
        keywordDensity: 0,
        contextSnippets: [],
        error: error instanceof Error ? error.message : 'Analysis failed',
        metadata: {
          analysisMethod: 'fuzzy_keyword',
          processingTime: Date.now() - startTime,
          wordCount: 0,
          uniqueKeywords: 0
        }
      }
    }
  }

  /**
   * Batch analyze multiple documents with progress tracking
   */
  async batchAnalyze(
    documents: Array<{ id: DocumentId; content: string; municipalityId: MunicipalityId; title?: string }>,
    options: {
      concurrency?: number
      progressCallback?: (progress: BatchAnalysisProgress) => Promise<void>
      keywords?: KeywordConfig[]
    } = {}
  ): Promise<{
    results: FuzzyAnalysisResult[]
    successful: number
    failed: number
    totalProcessingTime: number
  }> {
    const startTime = Date.now()
    const { concurrency = 3, progressCallback } = options
    
    const results: FuzzyAnalysisResult[] = []
    let successful = 0
    let failed = 0
    
    const queue = [...documents]
    const inProgress = new Set<Promise<void>>()

    console.log(`🔍 [FUZZY ANALYSIS] Starting batch analysis of ${documents.length} documents`)

    while (queue.length > 0 || inProgress.size > 0) {
      // Start new analyses up to concurrency limit
      while (queue.length > 0 && inProgress.size < concurrency) {
        const doc = queue.shift()!
        
        const analysis = this.analyzeDocument(
          doc.id,
          doc.content,
          doc.municipalityId,
          options.keywords
        ).then(result => {
          inProgress.delete(analysis)
          results.push(result)
          
          if (result.error) {
            failed++
            console.error(`❌ [FUZZY ANALYSIS] Failed: ${doc.title || doc.id} - ${result.error}`)
          } else {
            successful++
            const status = result.isRelevant ? '✅ RELEVANT' : '⚪ NOT RELEVANT'
            console.log(`${status} [FUZZY ANALYSIS] ${doc.title || doc.id} - Score: ${result.relevanceScore}, Confidence: ${result.confidenceScore}`)
          }
          
          // Report progress
          if (progressCallback) {
            const current = successful + failed
            const estimatedTimeRemaining = current > 0 ? 
              ((Date.now() - startTime) / current) * (documents.length - current) : undefined

            progressCallback({
              current,
              total: documents.length,
              currentDocument: doc.title,
              successful,
              failed,
              estimatedTimeRemaining
            })
          }
        }).catch(error => {
          inProgress.delete(analysis)
          failed++
          console.error(`❌ [FUZZY ANALYSIS] Exception for ${doc.title || doc.id}:`, error)
          
          results.push({
            documentId: doc.id,
            isRelevant: false,
            relevanceScore: 0,
            confidenceScore: 0,
            matchedKeywords: [],
            totalMatches: 0,
            keywordDensity: 0,
            contextSnippets: [],
            error: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
              analysisMethod: 'fuzzy_keyword',
              processingTime: 0,
              wordCount: 0,
              uniqueKeywords: 0
            }
          })
        })

        inProgress.add(analysis)
      }

      // Wait for at least one analysis to complete
      if (inProgress.size > 0) {
        await Promise.race(inProgress)
      }
    }

    const totalProcessingTime = Date.now() - startTime
    
    console.log(`🎯 [FUZZY ANALYSIS] Batch complete: ${successful} successful, ${failed} failed, ${totalProcessingTime}ms total`)

    return {
      results: results.sort((a, b) => b.relevanceScore - a.relevanceScore),
      successful,
      failed,
      totalProcessingTime
    }
  }
}

// Export singleton instance
export const enhancedKeywordAnalyzer = EnhancedKeywordAnalyzer.getInstance()