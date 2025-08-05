/**
 * Database Integration Examples
 * 
 * This file demonstrates how to use the new database integration layer
 * with both the Python service and Next.js API routes.
 */

import { SupabaseServiceAdapter, supabaseAdapter } from './supabase-service-adapter';
import {
  municipalitiesServiceQuery,
  documentsServiceQuery,
  backgroundJobsServiceQuery,
  bulkJobsServiceQuery,
  scrapersServiceQuery,
  scrapeLogsServiceQuery,
} from './supabase-enhanced';
import type {
  MunicipalityId,
  DocumentId,
  JobId,
  BulkJobId,
  ScraperId,
  createMunicipalityId,
  createDocumentId,
  createJobId,
  createBulkJobId,
} from '../types/database';

// ============================================================================
// MUNICIPALITY OPERATIONS EXAMPLES
// ============================================================================

/**
 * Example: Find municipalities by assigned scrapers
 */
export async function findMunicipalitiesByScrapers(scraperNames: string[]) {
  // Using the service adapter
  const result = await supabaseAdapter.findMunicipalitiesByScrapers(scraperNames, {
    includeInactive: false,
  });

  if (result.success) {
    console.log(`Found ${result.data.length} municipalities with scrapers:`, scraperNames);
    result.data.forEach(municipality => {
      console.log(`- ${municipality.name}: Active scraper: ${municipality.active_scraper}`);
      console.log(`  Assigned scrapers: ${municipality.assigned_scrapers?.join(', ') || 'None'}`);
    });
  } else {
    console.error('Failed to find municipalities:', result.error);
  }

  return result;
}

/**
 * Example: Update scraper assignments for multiple municipalities
 */
export async function updateMunicipalityScraperAssignments() {
  const updates = [
    {
      municipalityId: createMunicipalityId(1),
      scraperNames: ['toronto_v2', 'toronto_enhanced'],
      activeScraperId: 'toronto_v2',
      validateAssignment: true,
    },
    {
      municipalityId: createMunicipalityId(2),
      scraperNames: ['mississauga_v2'],
      activeScraperId: 'mississauga_v2',
      validateAssignment: true,
    }
  ];

  const result = await supabaseAdapter.updateScraperAssignments(updates);

  if (result.success) {
    console.log(`Successfully updated ${result.data.length} municipalities`);
  } else {
    console.error('Failed to update assignments:', result.error);
  }

  return result;
}

// ============================================================================
// DOCUMENT PROCESSING EXAMPLES
// ============================================================================

/**
 * Example: Find documents ready for different processing stages
 */
export async function findDocumentsForProcessing() {
  const queries = municipalitiesServiceQuery();
  
  // Find documents ready for download
  const pendingDownloads = await documentsServiceQuery().findReadyForProcessing('download', 25);
  
  // Find documents ready for content extraction
  const pendingExtractions = await documentsServiceQuery().findReadyForProcessing('extract', 25);
  
  // Find documents ready for analysis
  const pendingAnalyses = await documentsServiceQuery().findReadyForProcessing('analyze', 25);

  console.log('Processing Queue Status:');
  console.log(`- Pending downloads: ${pendingDownloads.data?.length || 0}`);
  console.log(`- Pending extractions: ${pendingExtractions.data?.length || 0}`);
  console.log(`- Pending analyses: ${pendingAnalyses.data?.length || 0}`);

  return {
    downloads: pendingDownloads.data || [],
    extractions: pendingExtractions.data || [],
    analyses: pendingAnalyses.data || [],
  };
}

/**
 * Example: Execute batch document operations
 */
export async function executeBatchDocumentFavoriting(documentIds: DocumentId[]) {
  const batchOperation = {
    operation: 'favorite' as const,
    documentIds,
    options: {
      priority: 'normal' as const,
      skipExisting: false,
      validateResults: true,
    },
  };

  const config = {
    batchSize: 20,
    maxConcurrency: 3,
    continueOnError: true,
    progressCallback: (progress: any) => {
      console.log(`Progress: ${progress.progress}% - ${progress.stage}`);
    },
  };

  const result = await supabaseAdapter.executeBatchDocumentOperation(batchOperation, config);

  if (result.success) {
    const { processed, failed, errors } = result.data;
    console.log(`Batch operation completed: ${processed} processed, ${failed} failed`);
    if (errors.length > 0) {
      console.log('Errors:', errors.slice(0, 5)); // Show first 5 errors
    }
  } else {
    console.error('Batch operation failed:', result.error);
  }

  return result;
}

// ============================================================================
// JOB PROGRESS TRACKING EXAMPLES
// ============================================================================

/**
 * Example: Track background job progress
 */
export async function trackJobProgress(jobId: JobId) {
  // Get job with progress details
  const jobQuery = backgroundJobsServiceQuery();
  const jobResult = await jobQuery.findWithProgress({
    statuses: ['pending', 'running'],
    limit: 1,
  });

  if (jobResult.data && jobResult.data.length > 0) {
    const job = jobResult.data[0];
    console.log(`Job ${job.id}: ${job.status} (${job.progress}%)`);
    console.log(`Message: ${job.progress_message || 'No message'}`);
    
    if (job.municipality) {
      console.log(`Municipality: ${job.municipality.name}`);
    }
    
    if (job.pdf_documents) {
      console.log(`Document: ${job.pdf_documents.title}`);
    }
  }

  // Update job progress
  const progressUpdate = {
    jobId: jobId,
    type: 'job' as const,
    progress: 75,
    stage: 'Processing documents',
    message: 'Analyzing document content...',
    timestamp: new Date().toISOString(),
  };

  const updateResult = await supabaseAdapter.updateJobProgress(progressUpdate);
  
  if (updateResult.success) {
    console.log('Job progress updated successfully');
  } else {
    console.error('Failed to update job progress:', updateResult.error);
  }

  return { jobResult, updateResult };
}

// ============================================================================
// BULK PROCESSING EXAMPLES
// ============================================================================

/**
 * Example: Monitor bulk processing job
 */
export async function monitorBulkProcessingJob(bulkJobId: BulkJobId) {
  const bulkQuery = bulkJobsServiceQuery();
  
  // Get bulk job details
  const jobResult = await bulkQuery.findWithMunicipalityDetails({
    statuses: ['running', 'pending'],
    limit: 1,
  });

  if (jobResult.data && jobResult.data.length > 0) {
    const job = jobResult.data[0];
    const progressPercentage = job.total_operations > 0 
      ? Math.round((job.completed_operations / job.total_operations) * 100)
      : 0;

    console.log(`Bulk Job ${job.id}:`);
    console.log(`- Operation: ${job.operation}`);
    console.log(`- Progress: ${progressPercentage}% (${job.completed_operations}/${job.total_operations})`);
    console.log(`- Failed: ${job.failed_operations}`);
    console.log(`- Status: ${job.status}`);

    if (job.municipality_ids && job.municipality_ids.length > 0) {
      console.log(`- Municipalities: ${job.municipality_ids.length} total`);
    }
  }

  // Update bulk job progress
  const updateResult = await bulkQuery.updateBulkProgress(
    bulkJobId,
    15, // completed operations
    2,  // failed operations
    'running',
    undefined // no error message
  );

  if (updateResult.data) {
    console.log('Bulk job progress updated');
  }

  return { jobResult, updateResult };
}

// ============================================================================
// SCRAPER MANAGEMENT EXAMPLES
// ============================================================================

/**
 * Example: Get scraper performance metrics
 */
export async function getScraperPerformanceReport(scraperId: ScraperId) {
  const scraperQuery = scrapersServiceQuery();
  
  // Get performance metrics for the last 30 days
  const metricsResult = await scraperQuery.getPerformanceMetrics(scraperId, 30);

  if (metricsResult.data) {
    const metrics = metricsResult.data;
    console.log(`Scraper Performance Report:`);
    console.log(`- Total runs: ${metrics.totalRuns}`);
    console.log(`- Success rate: ${metrics.successRate}%`);
    console.log(`- Documents found: ${metrics.totalDocuments}`);
    console.log(`- Average duration: ${metrics.avgDuration.toFixed(1)}s`);
    console.log(`- Documents per run: ${metrics.avgDocumentsPerRun}`);
  } else {
    console.error('Failed to get performance metrics:', metricsResult.error);
  }

  return metricsResult;
}

/**
 * Example: Update scraper validation status after testing
 */
export async function updateScraperValidation(
  scraperId: ScraperId,
  testResult: { success: boolean; documentsFound: number; errors: string[]; duration: number }
) {
  const scraperQuery = scrapersServiceQuery();
  
  const status = testResult.success ? 'validated' : 'failed';
  const successRate = testResult.success ? 100 : 0;
  const testNotes = testResult.success 
    ? `Test passed: ${testResult.documentsFound} documents found in ${testResult.duration}ms`
    : `Test failed: ${testResult.errors.join(', ')}`;

  const result = await scraperQuery.updateValidationStatus(
    scraperId,
    status,
    testNotes,
    successRate
  );

  if (result.data) {
    console.log(`Scraper validation updated: ${status}`);
  } else {
    console.error('Failed to update scraper validation:', result.error);
  }

  return result;
}

// ============================================================================
// CONSISTENCY CHECK EXAMPLES
// ============================================================================

/**
 * Example: Perform comprehensive data consistency checks
 */
export async function performDataConsistencyCheck() {
  const checkParams = {
    checkTypes: [
      'municipality_scrapers',
      'document_statuses',
      'job_dependencies',
      'scraper_assignments',
      'progress_integrity',
    ] as const,
    fixIssues: false, // Set to true to auto-fix issues
    reportOnly: true,
    scope: {
      municipalityIds: [createMunicipalityId(1), createMunicipalityId(2)],
    },
  };

  const result = await supabaseAdapter.performConsistencyCheck(checkParams);

  if (result.success) {
    console.log('Data Consistency Check Results:');
    result.data.forEach(checkResult => {
      console.log(`\\n${checkResult.checkType}: ${checkResult.passed ? 'PASSED' : 'FAILED'}`);
      
      if (checkResult.issues.length > 0) {
        console.log('Issues found:');
        checkResult.issues.forEach(issue => {
          console.log(`  - ${issue.severity.toUpperCase()}: ${issue.description}`);
          if (issue.suggestedFix) {
            console.log(`    Fix: ${issue.suggestedFix}`);
          }
        });
      }
    });
  } else {
    console.error('Consistency check failed:', result.error);
  }

  return result;
}

// ============================================================================
// ANALYTICS AND REPORTING EXAMPLES
// ============================================================================

/**
 * Example: Generate scrape log analytics report
 */
export async function generateScrapeAnalyticsReport() {
  const logsQuery = scrapeLogsServiceQuery();
  
  // Get logs from the last 7 days
  const since = new Date();
  since.setDate(since.getDate() - 7);
  
  // Get aggregated stats by municipality
  const municipalityStats = await logsQuery.getAggregatedStats({
    since: since.toISOString(),
    groupBy: 'municipality',
  });

  // Get aggregated stats by status
  const statusStats = await logsQuery.getAggregatedStats({
    since: since.toISOString(),
    groupBy: 'status',
  });

  // Get daily stats
  const dailyStats = await logsQuery.getAggregatedStats({
    since: since.toISOString(),
    groupBy: 'date',
  });

  console.log('\\n=== Scrape Analytics Report (Last 7 Days) ===');
  
  if (municipalityStats.data) {
    console.log('\\nBy Municipality:');
    municipalityStats.data.forEach(stat => {
      console.log(`- ${stat.key}: ${stat.successRate}% success rate, ${stat.newDocuments} new docs`);
    });
  }

  if (statusStats.data) {
    console.log('\\nBy Status:');
    statusStats.data.forEach(stat => {
      console.log(`- ${stat.key}: ${stat.totalRuns} runs`);
    });
  }

  if (dailyStats.data) {
    console.log('\\nDaily Activity:');
    dailyStats.data.slice(-5).forEach(stat => {
      console.log(`- ${stat.key}: ${stat.totalRuns} runs, ${stat.newDocuments} new docs`);
    });
  }

  return { municipalityStats, statusStats, dailyStats };
}

// ============================================================================
// TRANSACTION EXAMPLES
// ============================================================================

/**
 * Example: Execute multi-table transaction for complete document processing
 */
export async function processDocumentWithTransaction(documentId: DocumentId) {
  const transactionBatch = {
    operations: [
      // Update document status to processing
      {
        type: 'update' as const,
        table: 'pdf_documents' as const,
        data: {
          download_status: 'downloading',
          updated_at: new Date().toISOString(),
        },
        condition: { id: documentId },
        validateBefore: async (data: any) => {
          // Ensure document exists and is in correct state
          return true; // Simplified validation
        },
      },
      // Create background job
      {
        type: 'insert' as const,
        table: 'background_jobs' as const,
        data: {
          id: createJobId(`job_${Date.now()}`),
          type: 'download',
          status: 'pending',
          document_id: documentId,
          progress: 0,
          created_at: new Date().toISOString(),
        },
        validateAfter: async (result: any) => {
          // Ensure job was created successfully
          return result && result.length > 0;
        },
      },
      // Log the operation
      {
        type: 'insert' as const,
        table: 'scrape_logs' as const,
        data: {
          municipality_id: createMunicipalityId(1), // Would be dynamic in real use
          scrape_date: new Date().toISOString(),
          status: 'success',
          documents_found: 1,
          documents_new: 0,
        },
      },
    ],
    options: {
      rollbackOnError: true,
      validateAll: true,
      maxRetries: 3,
    },
    metadata: {
      description: `Process document ${documentId} for download`,
      correlationId: `doc_process_${documentId}`,
      initiatedBy: 'system',
    },
  };

  const result = await supabaseAdapter.executeTransaction(transactionBatch);

  if (result.success) {
    const { results, rollbacks } = result.data;
    console.log(`Transaction completed: ${results.length} operations, ${rollbacks} rollbacks`);
  } else {
    console.error('Transaction failed:', result.error);
  }

  return result;
}

// ============================================================================
// HEALTH CHECK AND MONITORING EXAMPLES
// ============================================================================

/**
 * Example: Monitor database adapter health and performance
 */
export async function monitorDatabaseHealth() {
  // Check adapter health
  const healthResult = await supabaseAdapter.healthCheck();
  
  console.log('\\n=== Database Adapter Health Check ===');
  console.log(`Status: ${healthResult.status.toUpperCase()}`);
  
  healthResult.checks.forEach(check => {
    const status = check.status === 'pass' ? '✓' : '✗';
    console.log(`${status} ${check.name}: ${check.message || 'OK'}`);
  });

  // Get performance metrics
  const metrics = supabaseAdapter.getMetrics();
  console.log('\\n=== Performance Metrics ===');
  
  for (const [operation, operationMetrics] of metrics) {
    if (operationMetrics.length > 0) {
      const avgDuration = operationMetrics.reduce((sum, m) => sum + m.duration, 0) / operationMetrics.length;
      const totalRecords = operationMetrics.reduce((sum, m) => sum + m.recordsAffected, 0);
      
      console.log(`${operation}:`);
      console.log(`  - Average duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`  - Total records: ${totalRecords}`);
      console.log(`  - Executions: ${operationMetrics.length}`);
    }
  }

  // Get optimization suggestions
  const optimizations = supabaseAdapter.getQueryOptimizations();
  if (optimizations.length > 0) {
    console.log('\\n=== Query Optimization Suggestions ===');
    optimizations.forEach(opt => {
      console.log(`${opt.query} on ${opt.table}:`);
      console.log(`  - Current avg duration: ${opt.currentPerformance.avgDuration.toFixed(2)}ms`);
      opt.suggestions.forEach(suggestion => {
        console.log(`  - ${suggestion.type}: ${suggestion.description}`);
      });
    });
  }

  return { healthResult, metrics: Array.from(metrics.entries()), optimizations };
}

// ============================================================================
// EXPORT ALL EXAMPLES
// ============================================================================

export const databaseIntegrationExamples = {
  // Municipality operations
  findMunicipalitiesByScrapers,
  updateMunicipalityScraperAssignments,
  
  // Document processing
  findDocumentsForProcessing,
  executeBatchDocumentFavoriting,
  
  // Job tracking
  trackJobProgress,
  monitorBulkProcessingJob,
  
  // Scraper management
  getScraperPerformanceReport,
  updateScraperValidation,
  
  // Data integrity
  performDataConsistencyCheck,
  
  // Analytics
  generateScrapeAnalyticsReport,
  
  // Transactions
  processDocumentWithTransaction,
  
  // Monitoring
  monitorDatabaseHealth,
};

// Example usage in an API route or service:
/*
// In an API route (e.g., app/api/scrapers/assign/route.ts)
export async function POST(request: Request) {
  const { municipalityIds, scraperNames } = await request.json();
  
  const result = await updateMunicipalityScraperAssignments();
  
  return Response.json(result);
}

// In a service worker or background process
export async function processDocumentQueue() {
  const documents = await findDocumentsForProcessing();
  
  // Process each type of operation
  for (const doc of documents.downloads) {
    await processDocumentWithTransaction(doc.id);
  }
  
  return documents;
}

// In a monitoring dashboard
export async function getDashboardData() {
  const health = await monitorDatabaseHealth();
  const analytics = await generateScrapeAnalyticsReport();
  const consistency = await performDataConsistencyCheck();
  
  return { health, analytics, consistency };
}
*/