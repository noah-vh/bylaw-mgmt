# Database Integration Layer

This document describes the new database integration layer that provides comprehensive support for the service architecture while maintaining compatibility with the existing Supabase schema.

## Overview

The database integration layer consists of three main components:

1. **Database Types** (`lib/database-types.ts`) - Enhanced TypeScript types
2. **Service Adapter** (`lib/supabase-service-adapter.ts`) - Comprehensive database operations
3. **Enhanced Queries** (`lib/supabase-enhanced.ts`) - Service-specific query builders

## Key Features

### ✅ Assigned Scrapers Array Support
- Proper handling of PostgreSQL arrays in `assigned_scrapers` field
- Validation of scraper assignments
- Support for multiple scrapers per municipality

### ✅ Batch Operations
- Efficient batch processing of documents
- Configurable batch sizes and concurrency
- Progress tracking with callbacks
- Error handling with continue-on-error options

### ✅ Transaction Support
- Multi-table transaction operations
- Pre and post-validation hooks
- Rollback support for failed operations
- Comprehensive error handling

### ✅ Data Consistency Checks
- Municipality-scraper relationship validation
- Document status progression checks
- Job dependency validation
- Progress integrity verification

### ✅ Performance Monitoring
- Query performance metrics collection
- Optimization suggestions
- Health check capabilities
- Resource usage tracking

## Architecture

```
┌─────────────────────────────────────┐
│           Application Layer         │
│  (Next.js API Routes, Components)   │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│        Service Adapter Layer       │
│    (SupabaseServiceAdapter)        │
│  • Batch Operations                 │
│  • Transaction Handling             │
│  • Consistency Checks              │
│  • Progress Tracking               │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│       Enhanced Queries Layer       │
│   (Service-specific builders)      │
│  • Municipality Queries            │
│  • Document Processing             │
│  • Job Management                  │
│  • Analytics                       │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│         Supabase Client             │
│     (Type-safe database)            │
└─────────────────────────────────────┘
```

## Usage Examples

### 1. Municipality Scraper Management

```typescript
import { supabaseAdapter } from './lib/supabase-service-adapter';
import { createMunicipalityId } from './types/database';

// Find municipalities by assigned scrapers
const result = await supabaseAdapter.findMunicipalitiesByScrapers(
  ['toronto_v2', 'mississauga_v2'],
  { includeInactive: false }
);

// Update scraper assignments
const updates = [
  {
    municipalityId: createMunicipalityId(1),
    scraperNames: ['toronto_v2', 'toronto_enhanced'],
    activeScraperId: 'toronto_v2',
    validateAssignment: true,
  }
];

await supabaseAdapter.updateScraperAssignments(updates);
```

### 2. Batch Document Processing

```typescript
import { documentsServiceQuery } from './lib/supabase-enhanced';

// Find documents ready for processing
const pendingDownloads = await documentsServiceQuery()
  .findReadyForProcessing('download', 50);

// Execute batch operations
const batchOperation = {
  operation: 'favorite',
  documentIds: [1, 2, 3, 4, 5],
  options: { priority: 'normal' }
};

const result = await supabaseAdapter.executeBatchDocumentOperation(
  batchOperation,
  {
    batchSize: 20,
    maxConcurrency: 3,
    progressCallback: (progress) => {
      console.log(`Progress: ${progress.progress}%`);
    }
  }
);
```

### 3. Job Progress Tracking

```typescript
import { backgroundJobsServiceQuery } from './lib/supabase-enhanced';

// Update job progress
const jobQuery = backgroundJobsServiceQuery();
await jobQuery.updateProgress(
  jobId,
  75, // progress percentage
  'Processing documents...',
  'running'
);

// Track bulk job progress
const progressUpdate = {
  jobId: bulkJobId,
  type: 'bulk_job',
  progress: 60,
  stage: 'Processing municipalities',
  timestamp: new Date().toISOString()
};

await supabaseAdapter.updateJobProgress(progressUpdate);
```

### 4. Data Consistency Checks

```typescript
// Perform comprehensive consistency checks
const checkParams = {
  checkTypes: [
    'municipality_scrapers',
    'document_statuses',
    'scraper_assignments'
  ],
  fixIssues: false, // Set to true to auto-fix
  reportOnly: true
};

const result = await supabaseAdapter.performConsistencyCheck(checkParams);

result.data.forEach(check => {
  console.log(`${check.checkType}: ${check.passed ? 'PASSED' : 'FAILED'}`);
  check.issues.forEach(issue => {
    console.log(`- ${issue.severity}: ${issue.description}`);
  });
});
```

### 5. Transaction Operations

```typescript
// Execute multi-table transaction
const transactionBatch = {
  operations: [
    {
      type: 'update',
      table: 'pdf_documents',
      data: { download_status: 'downloading' },
      condition: { id: documentId }
    },
    {
      type: 'insert',
      table: 'background_jobs',
      data: {
        type: 'download',
        document_id: documentId,
        status: 'pending'
      }
    }
  ],
  options: {
    rollbackOnError: true,
    validateAll: true
  }
};

const result = await supabaseAdapter.executeTransaction(transactionBatch);
```

## Configuration

### Service Adapter Configuration

```typescript
const config = {
  connectionPoolSize: 10,
  queryTimeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  enableQueryLogging: true,
  enablePerformanceMonitoring: true,
  cacheConfig: {
    enabled: true,
    ttl: 300,
    maxSize: 1000
  }
};

const adapter = new SupabaseServiceAdapter(supabase, config);
```

### Batch Operation Configuration

```typescript
const batchConfig = {
  batchSize: 50,
  maxConcurrency: 5,
  delayBetweenBatches: 100,
  continueOnError: true,
  validateEachOperation: false,
  progressCallback: (progress) => {
    // Handle progress updates
  }
};
```

## Database Schema Support

### Municipalities Table
- ✅ `assigned_scrapers` array field support
- ✅ `active_scraper` validation
- ✅ Status progression tracking
- ✅ Scraper assignment validation

### PDF Documents Table
- ✅ Processing status workflow support
- ✅ Batch status updates
- ✅ Content extraction tracking
- ✅ Analysis progress monitoring

### Background Jobs Table
- ✅ Progress tracking with messages
- ✅ Job dependency management
- ✅ Queue priority handling
- ✅ Resource usage monitoring

### Scrapers Table
- ✅ Municipality assignment tracking
- ✅ Performance metrics calculation
- ✅ Validation status management
- ✅ Success rate monitoring

## Performance Optimizations

### Query Optimization
- Indexed queries for assigned_scrapers array operations
- Efficient batch processing with chunking
- Connection pooling for high-throughput operations
- Query performance monitoring and suggestions

### Caching Strategy
- Configurable TTL-based caching
- Query result caching for frequent operations
- Performance metrics caching
- Smart cache invalidation

### Error Handling
- Comprehensive error categorization
- Retry logic with exponential backoff
- Detailed error context and suggestions
- Graceful degradation strategies

## Integration with Python Services

The database adapter is designed to work seamlessly with both Next.js API routes and Python services:

### Next.js API Routes
```typescript
// app/api/municipalities/scrapers/route.ts
export async function POST(request: Request) {
  const { scraperNames } = await request.json();
  
  const result = await supabaseAdapter.findMunicipalitiesByScrapers(
    scraperNames
  );
  
  return Response.json(result);
}
```

### Python Service Integration
```python
# Python services use the same database schema
# The adapter ensures consistency across both platforms

from supabase import create_client
import os

supabase = create_client(
    os.environ.get('SUPABASE_URL'),
    os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
)

# Python services can update the same fields
# that the TypeScript adapter manages
```

## Monitoring and Health Checks

### Health Check Example
```typescript
const health = await supabaseAdapter.healthCheck();
console.log(`Database Status: ${health.status}`);

health.checks.forEach(check => {
  console.log(`${check.name}: ${check.status}`);
});
```

### Performance Monitoring
```typescript
// Get performance metrics
const metrics = supabaseAdapter.getMetrics();

// Get optimization suggestions
const optimizations = supabaseAdapter.getQueryOptimizations();

optimizations.forEach(opt => {
  console.log(`Slow query: ${opt.query} on ${opt.table}`);
  opt.suggestions.forEach(suggestion => {
    console.log(`- ${suggestion.type}: ${suggestion.description}`);
  });
});
```

## Best Practices

### 1. Use Type-Safe Operations
```typescript
import { createMunicipalityId, createDocumentId } from './types/database';

// Use branded types for type safety
const municipalityId = createMunicipalityId(1);
const documentId = createDocumentId(123);
```

### 2. Handle Errors Gracefully
```typescript
const result = await supabaseAdapter.queryMunicipalities(params);

if (result.success) {
  // Handle success case
  processData(result.data);
} else {
  // Handle error with context
  console.error('Query failed:', result.error.message);
  // Optionally retry or fallback
}
```

### 3. Use Batch Operations for Bulk Updates
```typescript
// Instead of individual updates
for (const docId of documentIds) {
  await updateDocument(docId); // DON'T DO THIS
}

// Use batch operations
await supabaseAdapter.executeBatchDocumentOperation({
  operation: 'favorite',
  documentIds,
  options: { priority: 'normal' }
});
```

### 4. Monitor Performance
```typescript
// Enable monitoring in production
const adapter = new SupabaseServiceAdapter(supabase, {
  enablePerformanceMonitoring: true,
  enableQueryLogging: false // Disable in production
});

// Regular health checks
setInterval(async () => {
  const health = await adapter.healthCheck();
  if (health.status !== 'healthy') {
    // Alert or take corrective action
  }
}, 60000);
```

## Migration from Legacy Code

### Step 1: Replace Direct Queries
```typescript
// Before
const { data } = await supabase
  .from('municipalities')
  .select('*')
  .overlaps('assigned_scrapers', scraperNames);

// After
const result = await supabaseAdapter.findMunicipalitiesByScrapers(
  scraperNames
);
```

### Step 2: Use Enhanced Types
```typescript
// Before
interface Municipality {
  id: number;
  assigned_scrapers: string[] | null;
}

// After
import type { MunicipalityWithScrapers } from './lib/database-types';
// Now includes enriched data and type safety
```

### Step 3: Add Error Handling
```typescript
// Before
const { data, error } = await supabase.from('municipalities').select('*');
if (error) throw error;

// After
const result = await supabaseAdapter.queryMunicipalities(params);
if (!result.success) {
  // Structured error handling with context
  handleError(result.error);
  return;
}
```

## Testing

The database integration layer includes comprehensive testing utilities:

```typescript
import { databaseIntegrationExamples } from './lib/database-integration-examples';

// Test consistency checks
await databaseIntegrationExamples.performDataConsistencyCheck();

// Test batch operations
await databaseIntegrationExamples.executeBatchDocumentFavoriting([1, 2, 3]);

// Monitor performance
await databaseIntegrationExamples.monitorDatabaseHealth();
```

## Conclusion

This database integration layer provides:

1. **Type Safety** - Comprehensive TypeScript types with branded IDs
2. **Performance** - Optimized queries with monitoring and caching
3. **Reliability** - Transaction support and consistency checks
4. **Scalability** - Batch operations and efficient processing
5. **Maintainability** - Clear abstractions and error handling
6. **Compatibility** - Works with both Next.js and Python services

The layer maintains full compatibility with the existing Supabase schema while providing the enhanced functionality needed for the new service architecture.