/**
 * Enhanced Offline-First Relevance Scoring System
 * 
 * Provides comprehensive relevance scoring for documents based on:
 * - Weighted keyword matching with fuzzy logic
 * - Include/exclude/priority keyword categories
 * - Context-aware scoring with position and frequency analysis
 * - Batch processing capabilities
 * - Complete offline operation with confidence scoring
 * - Graceful fallback when external services are unavailable
 */

interface KeywordItem {
  keyword: string
  category: 'include' | 'exclude' | 'priority' | 'context'
  weight: number
  isActive: boolean
  fuzzyThreshold?: number // Minimum similarity for fuzzy matches (0-1)
  contextWeight?: number // Weight for contextual relevance
}

interface KeywordConfig {
  keywords: KeywordItem[]
  minRelevanceScore: number
  fuzzyMatchingEnabled: boolean
  contextAnalysisEnabled: boolean
}

interface MatchDetails {
  keyword: string
  category: string
  weight: number
  count: number
  positions: number[]
  contexts: string[]
  similarity: number
  matchType: 'exact' | 'fuzzy' | 'variation'
}

interface ScoringResult {
  score: number // 0-100
  isRelevant: boolean
  confidence: number // 0-1 confidence in the result
  matchedKeywords: MatchDetails[]
  details: {
    includeScore: number
    excludePenalty: number
    priorityBonus: number
    contextBonus: number
    fuzzyBonus: number
    totalMatches: number
    keywordDensity: number
    categoryDistribution: Record<string, number>
  }
  metadata: {
    method: 'offline_keyword_scoring'
    processingTime: number
    textLength: number
    wordCount: number
    analysisFeatures: string[]
  }
}

interface BatchScoringOptions {
  concurrency?: number
  progressCallback?: (processed: number, total: number, current?: string) => void
  includeDetails?: boolean
}

interface BatchScoringResult {
  results: Map<string | number, ScoringResult>
  summary: {
    totalDocuments: number
    relevantDocuments: number
    averageScore: number
    averageConfidence: number
    processingTime: number
    topKeywords: { keyword: string; frequency: number }[]
  }
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
function calculateLevenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null))

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // insertion
        matrix[j - 1][i] + 1, // deletion
        matrix[j - 1][i - 1] + substitutionCost // substitution
      )
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate similarity score (0-1) between two strings
 */
function calculateSimilarity(a: string, b: string): number {
  const distance = calculateLevenshteinDistance(a.toLowerCase(), b.toLowerCase())
  const maxLength = Math.max(a.length, b.length)
  return maxLength === 0 ? 1 : 1 - (distance / maxLength)
}

/**
 * Normalize text for consistent processing
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'") // Normalize apostrophes
    .replace(/[""]/g, '"') // Normalize quotes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s'".,!?;:()\-]/g, ' ') // Remove special chars but keep basic punctuation
    .trim()
}

/**
 * Extract context around keyword matches
 */
function extractContext(text: string, position: number, keywordLength: number, contextLength: number = 80): string {
  const start = Math.max(0, position - contextLength)
  const end = Math.min(text.length, position + keywordLength + contextLength)
  
  let context = text.slice(start, end)
  
  // Add ellipsis for truncated content
  if (start > 0) context = '...' + context
  if (end < text.length) context = context + '...'
  
  return context.trim()
}

/**
 * Generate keyword variations for fuzzy matching
 */
function generateKeywordVariations(keyword: string): string[] {
  const variations = new Set<string>()
  const base = keyword.toLowerCase().trim()
  
  variations.add(base)
  
  // Plural/singular variations
  if (base.endsWith('s') && base.length > 3) {
    variations.add(base.slice(0, -1))
  } else if (!base.endsWith('s')) {
    variations.add(base + 's')
  }
  
  // Common verb forms
  if (base.length > 4) {
    variations.add(base + 'ing')
    variations.add(base + 'ed')
    if (base.endsWith('e')) {
      variations.add(base.slice(0, -1) + 'ing')
    }
    if (base.endsWith('y')) {
      variations.add(base.slice(0, -1) + 'ies')
    }
  }
  
  // Common suffix variations
  variations.add(base + 'ly')
  variations.add(base + 'er')
  variations.add(base + 'est')
  
  // Remove duplicates and filter out very short variations
  return Array.from(variations).filter(v => v.length > 2 && v !== base)
}

/**
 * Find all matches for a keyword in text with fuzzy support
 */
function findKeywordMatches(
  text: string,
  keyword: KeywordItem,
  fuzzyEnabled: boolean = true
): MatchDetails {
  const normalizedText = normalizeText(text)
  const normalizedKeyword = normalizeText(keyword.keyword)
  const positions: number[] = []
  const contexts: string[] = []
  const variations = generateKeywordVariations(normalizedKeyword)
  
  let totalMatches = 0
  let bestSimilarity = 0
  let matchType: 'exact' | 'fuzzy' | 'variation' = 'exact'

  // 1. Exact matches (highest priority)
  const exactPattern = new RegExp(`\\b${normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
  let exactMatch
  while ((exactMatch = exactPattern.exec(normalizedText)) !== null) {
    positions.push(exactMatch.index)
    contexts.push(extractContext(text, exactMatch.index, normalizedKeyword.length))
    totalMatches++
    bestSimilarity = 1.0
  }

  // 2. Variation matches
  for (const variation of variations) {
    const variationPattern = new RegExp(`\\b${variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
    let variationMatch
    while ((variationMatch = variationPattern.exec(normalizedText)) !== null) {
      positions.push(variationMatch.index)
      contexts.push(extractContext(text, variationMatch.index, variation.length))
      totalMatches++
      if (bestSimilarity < 0.9) {
        bestSimilarity = 0.9
        matchType = 'variation'
      }
    }
  }

  // 3. Fuzzy matches (if enabled and no exact matches found)
  if (fuzzyEnabled && totalMatches === 0) {
    const words = normalizedText.split(/\s+/)
    const fuzzyThreshold = keyword.fuzzyThreshold || 0.8
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^\w]/g, '') // Remove punctuation
      if (word.length < 3) continue
      
      const similarity = calculateSimilarity(word, normalizedKeyword)
      if (similarity >= fuzzyThreshold) {
        // Find position in original text
        const wordIndex = normalizedText.indexOf(word, i > 0 ? normalizedText.indexOf(words[i-1]) + words[i-1].length : 0)
        if (wordIndex !== -1) {
          positions.push(wordIndex)
          contexts.push(extractContext(text, wordIndex, word.length))
          totalMatches++
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity
            matchType = 'fuzzy'
          }
        }
      }
    }
  }

  return {
    keyword: keyword.keyword,
    category: keyword.category,
    weight: keyword.weight,
    count: totalMatches,
    positions,
    contexts: contexts.slice(0, 3), // Limit to first 3 contexts
    similarity: bestSimilarity,
    matchType
  }
}

/**
 * Calculate relevance score for a document
 */
export function calculateRelevance(
  text: string,
  config: KeywordConfig
): ScoringResult {
  const startTime = Date.now()
  
  if (!text || !config.keywords.length) {
    return {
      score: 0,
      isRelevant: false,
      confidence: 1.0,
      matchedKeywords: [],
      details: {
        includeScore: 0,
        excludePenalty: 0,
        priorityBonus: 0,
        contextBonus: 0,
        fuzzyBonus: 0,
        totalMatches: 0,
        keywordDensity: 0,
        categoryDistribution: {}
      },
      metadata: {
        method: 'offline_keyword_scoring',
        processingTime: Date.now() - startTime,
        textLength: text.length,
        wordCount: 0,
        analysisFeatures: []
      }
    }
  }

  const normalizedText = normalizeText(text)
  const wordCount = normalizedText.split(/\s+/).length
  const activeKeywords = config.keywords.filter(k => k.isActive)
  
  let includeScore = 0
  let excludePenalty = 0
  let priorityBonus = 0
  let contextBonus = 0
  let fuzzyBonus = 0
  let totalMatches = 0

  const matchedKeywords: MatchDetails[] = []
  const categoryDistribution: Record<string, number> = {}
  const analysisFeatures: string[] = []

  // Process each keyword
  for (const keyword of activeKeywords) {
    const matches = findKeywordMatches(text, keyword, config.fuzzyMatchingEnabled)
    
    if (matches.count > 0) {
      matchedKeywords.push(matches)
      totalMatches += matches.count
      
      // Track category distribution
      categoryDistribution[matches.category] = (categoryDistribution[matches.category] || 0) + matches.count

      // Calculate weighted score based on category
      const baseScore = matches.count * matches.weight * matches.similarity
      
      switch (matches.category) {
        case 'include':
          includeScore += baseScore
          break
        case 'exclude':
          excludePenalty += baseScore * 1.5 // Penalty is stronger than positive score
          break
        case 'priority':
          includeScore += baseScore
          priorityBonus += baseScore * 0.8 // 80% bonus for priority keywords
          break
        case 'context':
          const contextWeight = keyword.contextWeight || 0.5
          contextBonus += baseScore * contextWeight
          break
      }

      // Fuzzy bonus for non-exact matches
      if (matches.matchType === 'fuzzy') {
        fuzzyBonus += baseScore * 0.2 // 20% bonus for successful fuzzy matches
      } else if (matches.matchType === 'variation') {
        fuzzyBonus += baseScore * 0.1 // 10% bonus for variation matches
      }
    }
  }

  // Calculate keyword density
  const keywordDensity = wordCount > 0 ? (totalMatches / wordCount) * 1000 : 0

  // Calculate raw score
  const rawScore = includeScore + priorityBonus + contextBonus + fuzzyBonus - excludePenalty

  // Apply density bonus for documents with good keyword distribution
  let densityBonus = 0
  if (keywordDensity > 2 && keywordDensity < 20) { // Sweet spot for keyword density
    densityBonus = Math.min(keywordDensity / 50, 5) // Max 5 point bonus
  }

  // Calculate final score (0-100)
  const maxExpectedScore = 100 // Adjust based on typical scoring patterns
  let normalizedScore = Math.min(100, ((rawScore + densityBonus) / maxExpectedScore) * 100)
  normalizedScore = Math.max(0, normalizedScore)

  // Calculate confidence based on match quality and diversity
  let confidence = 0.5 // Base confidence
  
  if (matchedKeywords.length > 0) {
    // Confidence factors
    const avgSimilarity = matchedKeywords.reduce((sum, m) => sum + m.similarity, 0) / matchedKeywords.length
    const categoryDiversity = Object.keys(categoryDistribution).length
    const hasExcludeMatches = categoryDistribution['exclude'] > 0
    
    confidence += Math.min((avgSimilarity - 0.5) * 0.6, 0.3) // Up to +0.3 for high similarity
    confidence += Math.min(categoryDiversity / 4 * 0.2, 0.2) // Up to +0.2 for category diversity
    confidence -= hasExcludeMatches ? 0.1 : 0 // -0.1 if exclude keywords found
    
    // Bonus for having priority keywords
    if (categoryDistribution['priority']) {
      confidence += 0.1
    }
  }

  confidence = Math.max(0, Math.min(1, confidence))

  // Determine analysis features used
  if (config.fuzzyMatchingEnabled) analysisFeatures.push('fuzzy_matching')
  if (config.contextAnalysisEnabled) analysisFeatures.push('context_analysis')
  if (matchedKeywords.some(m => m.matchType === 'variation')) analysisFeatures.push('variation_matching')
  
  // Final relevance determination
  const threshold = config.minRelevanceScore * 100
  const isRelevant = normalizedScore >= threshold && totalMatches > 0

  const processingTime = Date.now() - startTime

  return {
    score: Math.round(normalizedScore * 100) / 100,
    isRelevant,
    confidence: Math.round(confidence * 100) / 100,
    matchedKeywords: matchedKeywords.sort((a, b) => (b.weight * b.count * b.similarity) - (a.weight * a.count * a.similarity)),
    details: {
      includeScore: Math.round(includeScore * 100) / 100,
      excludePenalty: Math.round(excludePenalty * 100) / 100,
      priorityBonus: Math.round(priorityBonus * 100) / 100,
      contextBonus: Math.round(contextBonus * 100) / 100,
      fuzzyBonus: Math.round(fuzzyBonus * 100) / 100,
      totalMatches,
      keywordDensity: Math.round(keywordDensity * 100) / 100,
      categoryDistribution
    },
    metadata: {
      method: 'offline_keyword_scoring',
      processingTime,
      textLength: text.length,
      wordCount,
      analysisFeatures
    }
  }
}

/**
 * Batch calculate relevance for multiple documents
 */
export function batchCalculateRelevance(
  documents: { id: string | number; text: string; title?: string }[],
  config: KeywordConfig,
  options: BatchScoringOptions = {}
): Promise<BatchScoringResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const { concurrency = 3, progressCallback, includeDetails = true } = options
    const results = new Map<string | number, ScoringResult>()
    
    let processed = 0
    let totalScore = 0
    let totalConfidence = 0
    let relevantCount = 0
    const keywordFrequency = new Map<string, number>()

    const processDocument = (doc: { id: string | number; text: string; title?: string }) => {
      const result = calculateRelevance(doc.text, config)
      results.set(doc.id, result)
      
      processed++
      totalScore += result.score
      totalConfidence += result.confidence
      if (result.isRelevant) relevantCount++

      // Track keyword frequency
      result.matchedKeywords.forEach(match => {
        const current = keywordFrequency.get(match.keyword) || 0
        keywordFrequency.set(match.keyword, current + match.count)
      })

      if (progressCallback) {
        progressCallback(processed, documents.length, doc.title)
      }
    }

    // Process documents with limited concurrency (simulate async behavior)
    const queue = [...documents]
    const processNext = () => {
      if (queue.length === 0) {
        // All done - compile results
        const topKeywords = Array.from(keywordFrequency.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([keyword, frequency]) => ({ keyword, frequency }))

        resolve({
          results,
          summary: {
            totalDocuments: documents.length,
            relevantDocuments: relevantCount,
            averageScore: totalScore / documents.length,
            averageConfidence: totalConfidence / documents.length,
            processingTime: Date.now() - startTime,
            topKeywords
          }
        })
        return
      }

      const doc = queue.shift()!
      processDocument(doc)
      
      // Simulate async processing
      setTimeout(processNext, 0)
    }

    // Start processing
    processNext()
  })
}

/**
 * Create default ADU keyword configuration
 */
export function createDefaultADUConfig(): KeywordConfig {
  const keywords: KeywordItem[] = [
    // Primary ADU terms
    { keyword: 'accessory dwelling unit', category: 'priority', weight: 10, isActive: true, fuzzyThreshold: 0.85 },
    { keyword: 'adu', category: 'priority', weight: 9, isActive: true, fuzzyThreshold: 0.9 },
    { keyword: 'secondary suite', category: 'include', weight: 8, isActive: true, fuzzyThreshold: 0.8 },
    { keyword: 'secondary unit', category: 'include', weight: 8, isActive: true, fuzzyThreshold: 0.8 },
    
    // Secondary terms
    { keyword: 'garden suite', category: 'include', weight: 6, isActive: true, fuzzyThreshold: 0.8 },
    { keyword: 'granny flat', category: 'include', weight: 6, isActive: true, fuzzyThreshold: 0.8 },
    { keyword: 'in-law suite', category: 'include', weight: 6, isActive: true, fuzzyThreshold: 0.8 },
    { keyword: 'basement apartment', category: 'include', weight: 7, isActive: true, fuzzyThreshold: 0.8 },
    { keyword: 'basement suite', category: 'include', weight: 7, isActive: true, fuzzyThreshold: 0.8 },
    { keyword: 'carriage house', category: 'include', weight: 6, isActive: true, fuzzyThreshold: 0.8 },
    { keyword: 'laneway house', category: 'include', weight: 6, isActive: true, fuzzyThreshold: 0.8 },
    { keyword: 'coach house', category: 'include', weight: 6, isActive: true, fuzzyThreshold: 0.8 },
    
    // Supporting terms
    { keyword: 'ancillary dwelling', category: 'include', weight: 5, isActive: true, fuzzyThreshold: 0.8 },
    { keyword: 'additional residential unit', category: 'include', weight: 7, isActive: true, fuzzyThreshold: 0.8 },
    { keyword: 'detached accessory dwelling', category: 'include', weight: 6, isActive: true, fuzzyThreshold: 0.8 },
    { keyword: 'attached accessory dwelling', category: 'include', weight: 6, isActive: true, fuzzyThreshold: 0.8 },
    
    // Context terms
    { keyword: 'rental unit', category: 'context', weight: 3, isActive: true, contextWeight: 0.4 },
    { keyword: 'housing unit', category: 'context', weight: 3, isActive: true, contextWeight: 0.4 },
    { keyword: 'dwelling unit', category: 'context', weight: 4, isActive: true, contextWeight: 0.5 },
    { keyword: 'residential unit', category: 'context', weight: 4, isActive: true, contextWeight: 0.5 }
  ]

  return {
    keywords,
    minRelevanceScore: 0.15, // 15% threshold for relevance
    fuzzyMatchingEnabled: true,
    contextAnalysisEnabled: true
  }
}

/**
 * Validate keyword configuration
 */
export function validateKeywordConfig(config: KeywordConfig): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (!config.keywords.length) {
    errors.push('At least one keyword is required')
  }

  const activeKeywords = config.keywords.filter(k => k.isActive)
  if (!activeKeywords.length) {
    errors.push('At least one active keyword is required')
  }

  // Check for duplicate keywords
  const keywordMap = new Map<string, number>()
  for (const keyword of config.keywords) {
    const normalized = normalizeText(keyword.keyword)
    const count = keywordMap.get(normalized) || 0
    keywordMap.set(normalized, count + 1)
  }

  for (const [keyword, count] of keywordMap) {
    if (count > 1) {
      errors.push(`Duplicate keyword: "${keyword}"`)
    }
  }

  // Validate weights and thresholds
  for (const keyword of config.keywords) {
    if (keyword.weight < 1 || keyword.weight > 10) {
      errors.push(`Invalid weight for "${keyword.keyword}": must be between 1 and 10`)
    }
    
    if (keyword.fuzzyThreshold && (keyword.fuzzyThreshold < 0.5 || keyword.fuzzyThreshold > 1)) {
      warnings.push(`Fuzzy threshold for "${keyword.keyword}" should be between 0.5 and 1`)
    }
    
    if (keyword.contextWeight && (keyword.contextWeight < 0 || keyword.contextWeight > 1)) {
      warnings.push(`Context weight for "${keyword.keyword}" should be between 0 and 1`)
    }
  }

  // Check threshold
  if (config.minRelevanceScore < 0 || config.minRelevanceScore > 1) {
    errors.push('Minimum relevance score must be between 0 and 1')
  }

  // Warnings for balance
  const categoryCount = config.keywords.reduce((acc, k) => {
    acc[k.category] = (acc[k.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  if (!categoryCount.include && !categoryCount.priority) {
    warnings.push('No include or priority keywords defined - consider adding some for better scoring')
  }

  if (categoryCount.exclude && categoryCount.exclude > (categoryCount.include || 0) + (categoryCount.priority || 0)) {
    warnings.push('More exclude keywords than include/priority keywords may lead to overly negative scoring')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}