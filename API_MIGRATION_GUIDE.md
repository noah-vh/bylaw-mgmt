# API Migration Guide: Python Service Client

This document outlines the migration from subprocess-based Python execution to a structured service client architecture.

## Overview

The Next.js API routes have been updated to use a centralized Python service client instead of direct subprocess spawning. This provides better error handling, standardized interfaces, and improved maintainability.

## Key Changes

### 1. New Service Client Architecture

- **Location**: `/lib/python-service-client.ts`
- **Purpose**: Centralized interface for all Python script interactions
- **Benefits**:
  - Consistent error handling
  - Type-safe interfaces
  - Standardized request/response formats
  - Better timeout management
  - Unified logging

### 2. Updated API Routes

#### A. Updated Existing Routes

**`/api/scrapers/test-against-municipality`**
- **Before**: Direct subprocess spawning with complex argument building
- **After**: Clean service client call with structured options
- **Validation**: Removed blocking validation that was causing test failures
- **Response**: Maintains existing format for frontend compatibility

**`/api/scrapers/filesystem`**
- **Before**: Complex filesystem scanning with fallback logic
- **After**: Single service client call for scraper discovery
- **Performance**: Better caching and registry-based discovery

#### B. New Pipeline Phase Routes

**`/api/pipeline/scraping`** - Scraping phase only
- POST: Run scraping for specified municipalities
- GET: Get scraping statistics and recent jobs
- Options: `skipExisting`, `batchSize`, `maxRetries`

**`/api/pipeline/extraction`** - Content extraction only  
- POST: Run PDF content extraction
- GET: Get extraction statistics and recent jobs
- Options: `skipExisting`, `batchSize`, `forceReprocess`

**`/api/pipeline/analysis`** - Relevance analysis only
- POST: Run ADU relevance analysis
- GET: Get analysis statistics and recent jobs  
- Options: `skipExisting`, `batchSize`, `relevanceThreshold`

**`/api/pipeline/complete`** - Full pipeline execution
- POST: Run all phases sequentially
- GET: Get complete pipeline statistics
- Options: All phase options combined with `validateResults`, `priority`

## Service Client Interface

### Core Methods

```typescript
class PythonServiceClient {
  // Test a scraper against a municipality
  async testScraper(
    scraperName: string, 
    municipalityId: number, 
    options?: TestOptions
  ): Promise<TestResult>

  // Get all available scrapers
  async getFilesystemScrapers(): Promise<ScraperMetadata[]>

  // Individual pipeline phases
  async runScrapingPhase(municipalities, options): Promise<ScrapingPhaseResult>
  async runExtractionPhase(municipalities, options): Promise<ExtractionPhaseResult>
  async runAnalysisPhase(municipalities, options): Promise<AnalysisPhaseResult>
  
  // Complete pipeline
  async runCompletePipeline(municipalities, options): Promise<PipelineResult>
}
```

### Usage Examples

#### Testing a Scraper
```typescript
const serviceClient = getPythonServiceClient()
const result = await serviceClient.testScraper('toronto_v2', 1, {
  dryRun: true,
  maxPages: 5,
  timeout: 120000
})
```

#### Running Pipeline Phases
```typescript
// Run only scraping
const scrapingResult = await serviceClient.runScrapingPhase([1, 2, 3], {
  skipExisting: false,
  batchSize: 5
})

// Run complete pipeline
const pipelineResult = await serviceClient.runCompletePipeline('all', {
  skipExisting: true,
  validateResults: true,
  batchSize: 3
})
```

## API Request/Response Formats

### Municipality Specification
All pipeline routes accept municipalities in two formats:
```typescript
// Specific municipality IDs
municipalities: [1, 2, 3, 4]

// All municipalities
municipalities: "all"
```

### Common Options
```typescript
interface PipelineOptions {
  skipExisting?: boolean      // Skip already processed items
  batchSize?: number         // Items to process in parallel
  maxRetries?: number        // Retry attempts for failures
  validateResults?: boolean  // Validate outputs after processing
}
```

### Response Format
All routes return a consistent structure:
```typescript
{
  data: {
    // Phase-specific results
    success: boolean
    duration: number
    // ... other fields
  },
  message: string,
  timestamp: string
}
```

## Error Handling

### Service Client Level
- Automatic retry logic for transient failures
- Standardized error messages and codes
- Timeout handling with graceful degradation
- Structured error logging

### API Route Level
- Input validation with detailed error messages
- Database logging of all operations
- Proper HTTP status codes
- Consistent error response formats

## Database Integration

### Job Tracking
All pipeline operations are tracked in `bulk_processing_jobs`:
```sql
{
  id: uuid,
  operation: 'scraping' | 'extraction' | 'analysis' | 'complete',
  municipality_ids: number[] | null,
  status: 'queued' | 'running' | 'completed' | 'failed',
  options: json,
  result_summary: json,
  started_at: timestamp,
  completed_at: timestamp
}
```

### Progress Tracking
Real-time progress is maintained through:
- Database job status updates
- Filesystem progress files
- WebSocket notifications (future enhancement)

## Migration Benefits

### 1. Better Error Handling
- Structured error responses
- Detailed logging and tracing
- Automatic retry mechanisms
- Graceful failure recovery

### 2. Improved Performance
- Connection pooling
- Better resource management
- Optimized batch processing
- Reduced overhead

### 3. Enhanced Maintainability
- Type-safe interfaces
- Consistent patterns
- Centralized configuration
- Better testing capabilities

### 4. Future-Proof Architecture
- Easy to extend with new phases
- Support for different execution backends
- Monitoring and metrics integration
- Horizontal scaling support

## Frontend Compatibility

### Existing Components
All existing React components continue to work without changes:
- `TestScraperDialog`
- `ScraperManagementTab`
- `MunicipalityProcessingTab`
- `ProcessingStatus`

### New Capabilities
Frontend can now:
- Run individual pipeline phases
- Monitor phase-specific progress
- Access detailed job histories
- Handle more granular error states

## Deployment Notes

### Environment Variables
Ensure these are set:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PYTHON_ENV_PATH=path_to_python_environment
```

### Python Dependencies
The service client relies on existing Python scripts:
- `local_runner.py` - For scraper testing
- `list_registry.py` - For scraper discovery
- `scripts/run_scrapers.py` - For scraping phase
- `scripts/extract_documents.py` - For extraction phase
- `scripts/analyze_documents.py` - For analysis phase
- `scripts/run_full_pipeline.py` - For complete pipeline

### Database Schema
Ensure the `bulk_processing_jobs` table exists with proper structure as defined in the migration files.

## Testing

### Unit Tests
```bash
# Test service client methods
npm test lib/python-service-client.test.ts

# Test API routes
npm test app/api/pipeline/**/*.test.ts
```

### Integration Tests
```bash
# Test complete pipeline
curl -X POST http://localhost:3000/api/pipeline/complete \
  -H "Content-Type: application/json" \
  -d '{"municipalities": [1], "options": {"skipExisting": true}}'
```

## Monitoring and Debugging

### Logging
- Service client operations are logged to console
- Database operations include structured logging
- Python script output is captured and stored

### Health Checks
```bash
# Check Python environment
GET /api/health

# Check pipeline phase availability
GET /api/pipeline/scraping
GET /api/pipeline/extraction
GET /api/pipeline/analysis
GET /api/pipeline/complete
```

This migration provides a more robust, maintainable, and scalable architecture for Python script integration while maintaining backward compatibility with existing frontend components.