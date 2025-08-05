/**
 * Document Processing Pipeline Integration
 * 
 * Integrates PDF extraction and content analysis systems with comprehensive
 * batch processing, error handling, and offline-first operation.
 * 
 * Features:
 * - End-to-end document processing pipeline
 * - Batch processing with concurrency control
 * - Progress tracking and status management
 * - Error recovery and retry logic
 * - Offline-first analysis with graceful fallbacks
 * - Content caching and deduplication
 * - Performance monitoring and logging
 */

import type { DocumentId, MunicipalityId } from '../types/database'
import { extractBatchContent, extractDocumentContent, calculateContentHash } from './pdf-extractor'
import { enhancedKeywordAnalyzer, type FuzzyAnalysisResult } from './keyword-analyzer'
import { calculateRelevance, createDefaultADUConfig, type ScoringResult } from './relevance-scorer'

// Types
export interface DocumentItem {
  id: DocumentId
  url: string
  municipalityId: MunicipalityId
  title?: string
  contentText?: string
  contentHash?: string
  lastProcessed?: Date
}

export interface ProcessingOptions {
  forceReextract?: boolean
  forceReanalyze?: boolean
  concurrency?: number
  timeout?: number
  skipAnalysis?: boolean
  useAdvancedScoring?: boolean
  progressCallback?: (progress: ProcessingProgress) => Promise<void>
}

export interface ProcessingProgress {
  phase: 'extraction' | 'analysis' | 'completed' | 'error'
  totalDocuments: number
  extractedDocuments: number
  analyzedDocuments: number
  failedDocuments: number
  currentDocument?: string
  estimatedTimeRemaining?: number
  startTime: number
  errors: ProcessingError[]
}

export interface ProcessingError {
  documentId: DocumentId
  phase: 'extraction' | 'analysis'
  error: string
  retryable: boolean
  timestamp: Date
}

export interface ProcessingResult {
  documentId: DocumentId
  success: boolean
  contentExtracted: boolean
  contentAnalyzed: boolean
  extractionResult?: {
    contentText: string
    contentHash: string
    metadata: any
  }
  analysisResult?: FuzzyAnalysisResult | ScoringResult
  error?: string
  processingTime: number
}

export interface BatchProcessingResult {
  results: ProcessingResult[]
  summary: {
    totalDocuments: number
    successful: number
    failed: number
    extracted: number
    analyzed: number
    totalProcessingTime: number
    averageProcessingTime: number
    throughput: number // documents per minute
  }
  errors: ProcessingError[]
  progress: ProcessingProgress
}

/**
 * Document Processor class for end-to-end processing
 */
export class DocumentProcessor {
  private static instance: DocumentProcessor
  private processingStats = {
    totalProcessed: 0,
    totalErrors: 0,
    averageProcessingTime: 0,
    lastProcessed: new Date()
  }

  private constructor() {}

  static getInstance(): DocumentProcessor {
    if (!DocumentProcessor.instance) {
      DocumentProcessor.instance = new DocumentProcessor()
    }
    return DocumentProcessor.instance
  }

  /**
   * Process a single document through the complete pipeline
   */
  async processDocument(
    document: DocumentItem,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now()
    let contentExtracted = false
    let contentAnalyzed = false

    try {
      console.log(`🔄 [PROCESSOR] Starting processing for document: ${document.title || document.id}`)

      // Phase 1: PDF Extraction
      let contentText = document.contentText
      let contentHash = document.contentHash
      let extractionMetadata: any = {}

      if (!contentText || options.forceReextract) {
        console.log(`📄 [PROCESSOR] Extracting content from: ${document.url}`)
        
        const extractionResult = await extractDocumentContent(
          document.id,
          document.url,
          undefined, // No session ID for single document
          options.forceReextract,
          true, // Skip auto-analysis, we'll do it manually
          options.timeout
        )

        if (!extractionResult.success) {
          throw new Error(`Content extraction failed: ${extractionResult.error}`)
        }

        contentText = extractionResult.contentText!
        contentHash = extractionResult.contentHash!
        extractionMetadata = extractionResult.metadata || {}
        contentExtracted = true

        console.log(`✅ [PROCESSOR] Content extracted: ${contentText.length} characters`)
      } else {
        console.log(`🔄 [PROCESSOR] Using existing content (${contentText.length} characters)`)
      }

      // Phase 2: Content Analysis (if not skipped)
      let analysisResult: FuzzyAnalysisResult | ScoringResult | undefined

      if (!options.skipAnalysis) {
        console.log(`🔍 [PROCESSOR] Analyzing content for relevance...`)
        
        try {
          if (options.useAdvancedScoring) {
            // Use advanced relevance scorer
            const config = createDefaultADUConfig()
            analysisResult = calculateRelevance(contentText!, config)
            contentAnalyzed = true
            console.log(`📊 [PROCESSOR] Advanced scoring complete - Score: ${analysisResult.score}, Relevant: ${analysisResult.isRelevant}`)
          } else {
            // Use fuzzy keyword analyzer
            analysisResult = await enhancedKeywordAnalyzer.analyzeDocument(
              document.id,
              contentText!,
              document.municipalityId
            )
            contentAnalyzed = true
            console.log(`🎯 [PROCESSOR] Fuzzy analysis complete - Score: ${analysisResult.relevanceScore}, Relevant: ${analysisResult.isRelevant}`)
          }
        } catch (analysisError) {
          console.error(`❌ [PROCESSOR] Analysis failed:`, analysisError)
          // Don't fail the entire process if only analysis fails
          analysisResult = undefined
        }
      }

      const processingTime = Date.now() - startTime
      this.updateStats(processingTime, false)

      const result: ProcessingResult = {
        documentId: document.id,
        success: true,
        contentExtracted,
        contentAnalyzed,
        extractionResult: contentText ? {
          contentText,
          contentHash: contentHash!,
          metadata: extractionMetadata
        } : undefined,
        analysisResult,
        processingTime
      }

      console.log(`✅ [PROCESSOR] Successfully processed document: ${document.title || document.id} (${processingTime}ms)`)
      return result

    } catch (error) {
      const processingTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      console.error(`❌ [PROCESSOR] Failed to process document ${document.title || document.id}:`, errorMessage)
      this.updateStats(processingTime, true)

      return {
        documentId: document.id,
        success: false,
        contentExtracted,
        contentAnalyzed,
        error: errorMessage,
        processingTime
      }
    }
  }

  /**
   * Process multiple documents in batch with concurrency control
   */
  async batchProcessDocuments(
    documents: DocumentItem[],
    options: ProcessingOptions = {}
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now()
    const { concurrency = 3, progressCallback } = options
    
    const results: ProcessingResult[] = []
    const errors: ProcessingError[] = []
    let extractedCount = 0
    let analyzedCount = 0
    let failedCount = 0

    console.log(`🚀 [PROCESSOR] Starting batch processing of ${documents.length} documents`)
    console.log(`⚙️ [PROCESSOR] Options: concurrency=${concurrency}, forceReextract=${options.forceReextract}, useAdvancedScoring=${options.useAdvancedScoring}`)

    // Initialize progress
    const progress: ProcessingProgress = {
      phase: 'extraction',
      totalDocuments: documents.length,
      extractedDocuments: 0,
      analyzedDocuments: 0,
      failedDocuments: 0,
      startTime,
      errors: []
    }

    // Process documents with controlled concurrency
    const queue = [...documents]
    const inProgress = new Set<Promise<void>>()

    while (queue.length > 0 || inProgress.size > 0) {
      // Start new processing up to concurrency limit
      while (queue.length > 0 && inProgress.size < concurrency) {
        const document = queue.shift()!
        
        const processing = this.processDocument(document, {
          ...options,
          progressCallback: undefined // Don't pass down to avoid double callbacks
        }).then(result => {
          inProgress.delete(processing)
          results.push(result)

          // Update counters
          if (result.success) {
            if (result.contentExtracted) extractedCount++
            if (result.contentAnalyzed) analyzedCount++
          } else {
            failedCount++
            errors.push({
              documentId: result.documentId,
              phase: result.contentExtracted ? 'analysis' : 'extraction',
              error: result.error || 'Unknown error',
              retryable: true,
              timestamp: new Date()
            })
          }

          // Update progress
          progress.extractedDocuments = extractedCount
          progress.analyzedDocuments = analyzedCount
          progress.failedDocuments = failedCount
          progress.currentDocument = document.title || document.id.toString()
          progress.errors = errors

          // Calculate ETA
          const processed = extractedCount + analyzedCount + failedCount
          if (processed > 0) {
            const elapsed = Date.now() - startTime
            const avgTime = elapsed / processed
            progress.estimatedTimeRemaining = avgTime * (documents.length - processed)
          }

          // Determine current phase
          if (extractedCount + failedCount === documents.length) {
            progress.phase = analyzedCount + failedCount === documents.length ? 'completed' : 'analysis'
          }

          // Report progress
          if (progressCallback) {
            progressCallback(progress)
          }

        }).catch(error => {
          inProgress.delete(processing)
          console.error(`❌ [PROCESSOR] Unexpected error processing ${document.title || document.id}:`, error)
          
          failedCount++
          errors.push({
            documentId: document.id,
            phase: 'extraction',
            error: error instanceof Error ? error.message : 'Unexpected error',
            retryable: false,
            timestamp: new Date()
          })
        })

        inProgress.add(processing)
      }

      // Wait for at least one processing to complete
      if (inProgress.size > 0) {
        await Promise.race(inProgress)
      }
    }

    const totalProcessingTime = Date.now() - startTime
    const successful = results.filter(r => r.success).length
    const failed = results.length - successful
    const throughput = documents.length > 0 ? (documents.length / (totalProcessingTime / 60000)) : 0

    progress.phase = 'completed'
    
    const summary = {
      totalDocuments: documents.length,
      successful,
      failed,
      extracted: extractedCount,
      analyzed: analyzedCount,
      totalProcessingTime,
      averageProcessingTime: totalProcessingTime / documents.length,
      throughput
    }

    console.log(`🎯 [PROCESSOR] Batch processing complete:`)
    console.log(`   📊 Total: ${documents.length}, Success: ${successful}, Failed: ${failed}`)
    console.log(`   📄 Extracted: ${extractedCount}, Analyzed: ${analyzedCount}`)
    console.log(`   ⏱️  Total time: ${totalProcessingTime}ms, Avg: ${summary.averageProcessingTime.toFixed(1)}ms`)
    console.log(`   🚀 Throughput: ${throughput.toFixed(2)} docs/min`)

    return {
      results,
      summary,
      errors,
      progress
    }
  }

  /**
   * Process documents for a specific municipality
   */
  async processMunicipalityDocuments(
    municipalityId: MunicipalityId,
    documents: DocumentItem[],
    options: ProcessingOptions = {}
  ): Promise<BatchProcessingResult> {
    console.log(`🏛️ [PROCESSOR] Processing ${documents.length} documents for municipality ${municipalityId}`)
    
    // Filter documents for this municipality
    const municipalityDocs = documents.filter(doc => doc.municipalityId === municipalityId)
    
    if (municipalityDocs.length === 0) {
      console.log(`⚠️ [PROCESSOR] No documents found for municipality ${municipalityId}`)
      return {
        results: [],
        summary: {
          totalDocuments: 0,
          successful: 0,
          failed: 0,
          extracted: 0,
          analyzed: 0,
          totalProcessingTime: 0,
          averageProcessingTime: 0,
          throughput: 0
        },
        errors: [],
        progress: {
          phase: 'completed',
          totalDocuments: 0,
          extractedDocuments: 0,
          analyzedDocuments: 0,
          failedDocuments: 0,
          startTime: Date.now(),
          errors: []
        }
      }
    }

    return this.batchProcessDocuments(municipalityDocs, options)
  }

  /**
   * Health check for the processing system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    components: {
      pdfExtractor: boolean
      keywordAnalyzer: boolean
      relevanceScorer: boolean
    }
    stats: typeof this.processingStats
    errors?: string[]
  }> {
    const errors: string[] = []

    try {
      // Test PDF extractor
      const { healthCheck } = await import('./pdf-extractor')
      const pdfHealth = await healthCheck()
      
      if (!pdfHealth.pythonScriptAvailable) {
        errors.push('PDF extraction script not available')
      }

      // Test other components (they're pure TypeScript, so just check they load)
      const keywordAnalyzer = enhancedKeywordAnalyzer
      const { validateKeywordConfig } = await import('./relevance-scorer')
      
      const components = {
        pdfExtractor: pdfHealth.pythonScriptAvailable,
        keywordAnalyzer: !!keywordAnalyzer,
        relevanceScorer: typeof validateKeywordConfig === 'function'
      }

      const allHealthy = Object.values(components).every(Boolean)
      const status = allHealthy ? 'healthy' : errors.length > 0 ? 'unhealthy' : 'degraded'

      return {
        status,
        components,
        stats: this.processingStats,
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        components: {
          pdfExtractor: false,
          keywordAnalyzer: false,
          relevanceScorer: false
        },
        stats: this.processingStats,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): typeof this.processingStats {
    return { ...this.processingStats }
  }

  /**
   * Reset processing statistics
   */
  resetStats(): void {
    this.processingStats = {
      totalProcessed: 0,
      totalErrors: 0,
      averageProcessingTime: 0,
      lastProcessed: new Date()
    }
  }

  /**
   * Update processing statistics
   */
  private updateStats(processingTime: number, isError: boolean): void {
    this.processingStats.totalProcessed++
    this.processingStats.lastProcessed = new Date()
    
    if (isError) {
      this.processingStats.totalErrors++
    }
    
    // Update rolling average
    const totalTime = this.processingStats.averageProcessingTime * (this.processingStats.totalProcessed - 1) + processingTime
    this.processingStats.averageProcessingTime = totalTime / this.processingStats.totalProcessed
  }
}

// Export singleton instance
export const documentProcessor = DocumentProcessor.getInstance()

// Export utility functions
export { calculateContentHash } from './pdf-extractor'
export { createDefaultADUConfig, validateKeywordConfig } from './relevance-scorer'