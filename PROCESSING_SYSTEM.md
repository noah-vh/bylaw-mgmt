# PDF Extraction & Analysis Pipeline

A comprehensive, offline-first document processing system for extracting and analyzing PDF content with advanced keyword matching and relevance scoring.

## Overview

This system provides robust PDF text extraction and content analysis capabilities designed for municipal bylaw document processing. It features offline-first operation, advanced fuzzy keyword matching, and comprehensive batch processing with error handling.

## Architecture

```
PDF Documents → PDF Extractor → Content Analysis → Relevance Scoring → Results
     ↓              ↓               ↓                ↓               ↓
  Download/     Python Script   Fuzzy Keyword   Weighted Scoring   Database
  File I/O      (PyPDF2,       Matching with   with Categories    Storage
               pdfplumber)    Levenshtein      & Confidence
```

## Components

### 1. PDF Extraction (`scrapers/pdf_extractor.py`)

Standalone Python script for robust PDF text extraction:

- **Multiple extraction methods**: PyPDF2, pdfplumber with automatic fallback
- **Input flexibility**: URLs and local file paths
- **Error handling**: Comprehensive retry logic with exponential backoff
- **Output format**: Structured JSON with metadata
- **Timeout management**: Configurable processing timeouts
- **Content hashing**: SHA-256 hashing for change detection

```bash
# Usage examples
python scrapers/pdf_extractor.py --url "https://example.com/document.pdf"
python scrapers/pdf_extractor.py --file "/path/to/document.pdf" --timeout 120
```

### 2. TypeScript PDF Extractor (`lib/pdf-extractor.ts`)

Node.js interface for PDF extraction with subprocess management:

- **Subprocess orchestration**: Manages Python script execution
- **Batch processing**: Concurrent processing with configurable limits
- **Progress tracking**: Real-time progress updates and status management
- **Caching**: Content hash-based caching to avoid reprocessing
- **Health monitoring**: System health checks and diagnostics

### 3. Enhanced Keyword Analyzer (`lib/keyword-analyzer.ts`)

Advanced keyword matching with fuzzy logic:

- **Fuzzy matching**: Levenshtein distance-based similarity matching
- **Keyword variations**: Automatic generation of plural/singular forms
- **Context extraction**: Captures surrounding text for matched keywords
- **Category weighting**: Different weights for primary/secondary/context terms
- **Batch analysis**: Concurrent processing of multiple documents
- **Municipality-specific**: Configurable keywords per municipality

### 4. Relevance Scorer (`lib/relevance-scorer.ts`)

Comprehensive offline relevance scoring system:

- **Weighted scoring**: Include/exclude/priority keyword categories
- **Fuzzy support**: Integration with fuzzy matching algorithms
- **Confidence scoring**: Reliability metrics for scoring results
- **Context analysis**: Position and frequency-based scoring
- **Batch processing**: Efficient processing of document collections
- **Validation**: Configuration validation and error checking

### 5. Document Processor (`lib/document-processor.ts`)

Integrated processing pipeline:

- **End-to-end processing**: Combines extraction and analysis
- **Batch operations**: Concurrent processing with progress tracking
- **Error recovery**: Comprehensive error handling and retry logic
- **Performance monitoring**: Processing statistics and throughput metrics
- **Health checks**: System status monitoring and diagnostics

## Installation

### Prerequisites

- Node.js 18+ with TypeScript support
- Python 3.8+
- Git

### Setup

1. **Install Python dependencies**:
```bash
pip install -r requirements.txt
```

2. **Verify Python script**:
```bash
python scrapers/pdf_extractor.py --help
```

3. **Test system health**:
```bash
npx ts-node scripts/test-system.ts
```

## Usage

### Single Document Processing

```typescript
import { documentProcessor } from './lib/document-processor'

const document = {
  id: 'doc-1',
  url: 'https://example.com/bylaw.pdf',
  municipalityId: 'toronto',
  title: 'ADU Regulations'
}

const result = await documentProcessor.processDocument(document, {
  useAdvancedScoring: true,
  timeout: 120000
})

console.log(`Success: ${result.success}`)
console.log(`Relevance Score: ${result.analysisResult?.score}`)
```

### Batch Processing

```typescript
import { documentProcessor } from './lib/document-processor'

const documents = [
  { id: '1', url: 'https://example.com/doc1.pdf', municipalityId: 'toronto' },
  { id: '2', url: 'https://example.com/doc2.pdf', municipalityId: 'toronto' }
]

const batchResult = await documentProcessor.batchProcessDocuments(documents, {
  concurrency: 3,
  forceReextract: false,
  useAdvancedScoring: true,
  progressCallback: async (progress) => {
    console.log(`Progress: ${progress.extractedDocuments}/${progress.totalDocuments}`)
  }
})

console.log(`Processed: ${batchResult.summary.successful}/${batchResult.summary.totalDocuments}`)
```

### Advanced Relevance Scoring

```typescript
import { calculateRelevance, createDefaultADUConfig } from './lib/relevance-scorer'

const config = createDefaultADUConfig()
const result = calculateRelevance(documentText, config)

console.log(`Score: ${result.score}/100`)
console.log(`Relevant: ${result.isRelevant}`)
console.log(`Confidence: ${result.confidence}`)
console.log(`Matched Keywords: ${result.matchedKeywords.map(k => k.keyword).join(', ')}`)
```

### Fuzzy Keyword Analysis

```typescript
import { enhancedKeywordAnalyzer } from './lib/keyword-analyzer'

const result = await enhancedKeywordAnalyzer.analyzeDocument(
  'doc-id',
  documentText,
  'toronto'
)

console.log(`Relevance: ${result.relevanceScore}`)
console.log(`Fuzzy matches: ${result.matchedKeywords.filter(m => m.matchType === 'fuzzy').length}`)
```

## Configuration

### Keyword Configuration

Keywords are organized into categories with different weights and behaviors:

```typescript
const keywords = [
  // High-priority terms
  { keyword: 'accessory dwelling unit', category: 'priority', weight: 10, isActive: true },
  { keyword: 'adu', category: 'priority', weight: 9, isActive: true },
  
  // Include terms (positive scoring)
  { keyword: 'secondary suite', category: 'include', weight: 8, isActive: true },
  { keyword: 'basement apartment', category: 'include', weight: 7, isActive: true },
  
  // Context terms (lower weight)
  { keyword: 'rental unit', category: 'context', weight: 3, isActive: true },
  
  // Exclude terms (negative scoring)
  { keyword: 'commercial use', category: 'exclude', weight: 5, isActive: true }
]
```

### Processing Options

```typescript
const options = {
  forceReextract: false,        // Skip cache, always extract
  forceReanalyze: false,        // Skip cache, always analyze  
  concurrency: 3,               // Parallel processing limit
  timeout: 120000,              // Processing timeout (ms)
  skipAnalysis: false,          // Extract only, no analysis
  useAdvancedScoring: true,     // Use relevance scorer vs fuzzy analyzer
  progressCallback: (progress) => { /* handle progress */ }
}
```

## Error Handling

The system provides comprehensive error handling at multiple levels:

### Extraction Errors
- Network timeouts and connection issues
- PDF parsing failures with automatic fallback
- File system access problems
- Python subprocess execution errors

### Analysis Errors
- Content processing failures
- Keyword configuration errors
- Memory/performance issues

### Recovery Mechanisms
- Automatic retry with exponential backoff
- Graceful degradation when components fail
- Detailed error reporting and logging
- Progress preservation across failures

## Performance

### Benchmarks

Typical performance on standard hardware:

- **PDF Extraction**: 2-5 seconds per document
- **Content Analysis**: 100-500ms per document  
- **Batch Throughput**: 10-30 documents/minute (depends on document size and network)
- **Memory Usage**: 50-200MB per concurrent process

### Optimization Tips

1. **Batch Processing**: Use batch operations for better throughput
2. **Caching**: Enable content caching to avoid reprocessing
3. **Concurrency**: Adjust concurrency based on system resources
4. **Timeouts**: Set appropriate timeouts for your network conditions

## Testing

Run the comprehensive test suite:

```bash
npx ts-node scripts/test-system.ts
```

Tests cover:
- System health and dependencies
- PDF extraction functionality
- Keyword analysis accuracy
- Relevance scoring precision
- Batch processing performance
- Error handling robustness

## Monitoring

### Health Checks

```typescript
const health = await documentProcessor.healthCheck()
console.log(`Status: ${health.status}`) // 'healthy' | 'degraded' | 'unhealthy'
console.log(`Components:`, health.components)
```

### Processing Statistics

```typescript
const stats = documentProcessor.getStats()
console.log(`Total processed: ${stats.totalProcessed}`)
console.log(`Error rate: ${(stats.totalErrors / stats.totalProcessed * 100).toFixed(1)}%`)
console.log(`Average time: ${stats.averageProcessingTime}ms`)
```

## Troubleshooting

### Common Issues

1. **Python script not found**
   - Ensure `scrapers/pdf_extractor.py` exists and is executable
   - Check Python dependencies: `pip install -r requirements.txt`

2. **PDF extraction fails**
   - Verify network connectivity for URL-based extraction
   - Check file permissions for local files
   - Increase timeout for large documents

3. **Low relevance scores**
   - Review keyword configuration for your domain
   - Adjust fuzzy matching thresholds
   - Check document content quality

4. **Performance issues**
   - Reduce concurrency for resource-constrained systems
   - Enable caching to avoid reprocessing
   - Monitor memory usage during batch operations

### Debug Mode

Enable verbose logging:

```bash
DEBUG=pdf-extraction,analysis npx ts-node your-script.ts
```

## Extending the System

### Adding New Extraction Methods

1. Extend the Python script with new extraction libraries
2. Update fallback chain in `extract_with_fallbacks()`
3. Add method detection and reporting

### Custom Keyword Categories

1. Define new categories in keyword configuration
2. Update scoring logic in relevance scorer
3. Add validation rules for new categories

### Integration with Databases

1. Implement database adapters in document processor
2. Add caching layers for extracted content
3. Create update/sync mechanisms for processed documents

## License

This system is designed for municipal bylaw document processing and analysis. See the main project license for usage terms.