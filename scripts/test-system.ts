#!/usr/bin/env ts-node

/**
 * Test Script for PDF Extraction & Analysis Pipeline
 * 
 * This script tests the integrated PDF processing and content analysis system
 * to ensure all components work together properly.
 */

import { documentProcessor, type DocumentItem } from '../lib/document-processor'
import { createDefaultADUConfig, calculateRelevance } from '../lib/relevance-scorer'
import { enhancedKeywordAnalyzer } from '../lib/keyword-analyzer'

// Test document data (mock)
const testDocuments: DocumentItem[] = [
  {
    id: 'test-1',
    url: 'https://example.com/adu-bylaw.pdf', // This would be a real URL in practice
    municipalityId: 'toronto',
    title: 'Accessory Dwelling Unit Regulations'
  },
  {
    id: 'test-2', 
    url: 'https://example.com/zoning-bylaw.pdf',
    municipalityId: 'toronto',
    title: 'General Zoning Bylaws',
    // Simulate existing content for testing analysis
    contentText: `
      This bylaw regulates accessory dwelling units (ADUs) within the city.
      Secondary suites are permitted in single-family homes subject to the following conditions:
      - Maximum size of 1,000 square feet
      - Separate entrance required
      - One parking space must be provided
      - Basement apartments are allowed with proper egress
      The purpose is to provide additional residential units while maintaining neighborhood character.
      Garden suites and granny flats are also considered under this regulation.
    `,
    contentHash: 'mock-hash-123'
  }
]

async function testHealthCheck() {
  console.log('🏥 Testing system health check...')
  
  try {
    const health = await documentProcessor.healthCheck()
    console.log('✅ Health check results:', JSON.stringify(health, null, 2))
    
    if (health.status === 'unhealthy') {
      console.error('❌ System is unhealthy:', health.errors)
      return false
    }
    
    return true
  } catch (error) {
    console.error('❌ Health check failed:', error)
    return false
  }
}

async function testRelevanceScoring() {
  console.log('\n📊 Testing offline relevance scoring...')
  
  const testText = `
    This document discusses accessory dwelling units and secondary suites.
    The city allows ADUs in residential zones with proper permits.
    Basement apartments require separate entrances and egress windows.
    Garden suites are permitted in backyards with minimum setbacks.
    Laneway houses are a new form of housing being considered.
  `
  
  try {
    const config = createDefaultADUConfig()
    const result = calculateRelevance(testText, config)
    
    console.log('✅ Relevance scoring completed:')
    console.log(`   Score: ${result.score}/100`)
    console.log(`   Relevant: ${result.isRelevant}`)
    console.log(`   Confidence: ${result.confidence}`)
    console.log(`   Matched keywords: ${result.matchedKeywords.length}`)
    console.log(`   Top matches: ${result.matchedKeywords.slice(0, 3).map(m => m.keyword).join(', ')}`)
    
    return result.score > 0
  } catch (error) {
    console.error('❌ Relevance scoring failed:', error)
    return false
  }
}

async function testFuzzyAnalysis() {
  console.log('\n🔍 Testing fuzzy keyword analysis...')
  
  const testText = `
    New regulations for accessory dwelling units (ADUs) have been implemented.
    Secondary residential units are now permitted in all R1 zones.
    Homeowners can convert basements into rental suites with proper permits.
    Garden sheds cannot be converted to dwelling units without major renovations.
  `
  
  try {
    const result = await enhancedKeywordAnalyzer.analyzeDocument(
      'test-analysis',
      testText,
      'toronto'
    )
    
    console.log('✅ Fuzzy analysis completed:')
    console.log(`   Relevance score: ${result.relevanceScore}`)
    console.log(`   Confidence: ${result.confidenceScore}`)
    console.log(`   Is relevant: ${result.isRelevant}`)
    console.log(`   Total matches: ${result.totalMatches}`)
    console.log(`   Matched keywords: ${result.matchedKeywords.length}`)
    
    if (result.matchedKeywords.length > 0) {
      console.log('   Top matches:')
      result.matchedKeywords.slice(0, 3).forEach(match => {
        console.log(`     - "${match.keyword}" (${match.matchType}, ${match.count} matches)`)
      })
    }
    
    return result.isRelevant
  } catch (error) {
    console.error('❌ Fuzzy analysis failed:', error)
    return false
  }
}

async function testSingleDocumentProcessing() {
  console.log('\n📄 Testing single document processing...')
  
  const testDoc = testDocuments[1] // Use the one with existing content
  
  try {
    const result = await documentProcessor.processDocument(testDoc, {
      skipAnalysis: false,
      useAdvancedScoring: true
    })
    
    console.log('✅ Document processing completed:')
    console.log(`   Success: ${result.success}`)
    console.log(`   Content extracted: ${result.contentExtracted}`)
    console.log(`   Content analyzed: ${result.contentAnalyzed}`)
    console.log(`   Processing time: ${result.processingTime}ms`)
    
    if (result.analysisResult) {
      const analysis = result.analysisResult as any
      console.log(`   Analysis score: ${analysis.score || analysis.relevanceScore}`)
      console.log(`   Is relevant: ${analysis.isRelevant}`)
    }
    
    return result.success
  } catch (error) {
    console.error('❌ Single document processing failed:', error)
    return false
  }
}

async function testBatchProcessing() {
  console.log('\n📚 Testing batch document processing...')
  
  try {
    const result = await documentProcessor.batchProcessDocuments(testDocuments, {
      concurrency: 2,
      skipAnalysis: false,
      useAdvancedScoring: false, // Use fuzzy analysis
      progressCallback: async (progress) => {
        console.log(`   Progress: ${progress.extractedDocuments + progress.analyzedDocuments}/${progress.totalDocuments} (${progress.phase})`)
      }
    })
    
    console.log('✅ Batch processing completed:')
    console.log(`   Total documents: ${result.summary.totalDocuments}`)
    console.log(`   Successful: ${result.summary.successful}`)
    console.log(`   Failed: ${result.summary.failed}`)
    console.log(`   Extracted: ${result.summary.extracted}`)
    console.log(`   Analyzed: ${result.summary.analyzed}`)
    console.log(`   Total time: ${result.summary.totalProcessingTime}ms`)
    console.log(`   Throughput: ${result.summary.throughput.toFixed(2)} docs/min`)
    
    if (result.errors.length > 0) {
      console.log('   Errors encountered:')
      result.errors.forEach(error => {
        console.log(`     - ${error.documentId}: ${error.error}`)
      })
    }
    
    return result.summary.successful > 0
  } catch (error) {
    console.error('❌ Batch processing failed:', error)
    return false
  }
}

async function runAllTests() {
  console.log('🚀 Starting PDF Extraction & Analysis Pipeline Tests\n')
  
  const tests = [
    { name: 'Health Check', test: testHealthCheck },
    { name: 'Relevance Scoring', test: testRelevanceScoring },
    { name: 'Fuzzy Analysis', test: testFuzzyAnalysis },
    { name: 'Single Document Processing', test: testSingleDocumentProcessing },
    { name: 'Batch Processing', test: testBatchProcessing }
  ]
  
  const results = []
  
  for (const { name, test } of tests) {
    try {
      const success = await test()
      results.push({ name, success })
      console.log(`${success ? '✅' : '❌'} ${name}: ${success ? 'PASSED' : 'FAILED'}`)
    } catch (error) {
      results.push({ name, success: false })
      console.log(`❌ ${name}: FAILED (${error})`)
    }
  }
  
  console.log('\n📊 Test Summary:')
  const passed = results.filter(r => r.success).length
  const total = results.length
  console.log(`   Passed: ${passed}/${total}`)
  console.log(`   Success rate: ${((passed / total) * 100).toFixed(1)}%`)
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! The system is ready for use.')
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above and ensure:')
    console.log('   - Python dependencies are installed (pip install -r requirements.txt)')
    console.log('   - PDF extraction script is executable')
    console.log('   - Network connectivity for URL-based tests')
  }
  
  return passed === total
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1)
  }).catch(error => {
    console.error('Fatal error running tests:', error)
    process.exit(1)
  })
}

export { runAllTests }