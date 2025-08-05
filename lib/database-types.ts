/**
 * Database-specific types and utilities for the service architecture
 * 
 * This file provides specialized types and utilities that complement the main
 * database types, focusing on service operations and database adapter needs.
 */

import type {
  Database,
  Municipality,
  PdfDocument,
  BackgroundJob,
  BulkProcessingJob,
  Scraper,
  MunicipalityId,
  DocumentId,
  JobId,
  BulkJobId,
  ScraperId,
  MunicipalityStatus,
  JobStatus,
  ScrapeStatus,
  DownloadStatus,
  ExtractionStatus,
  AnalysisStatus,
  BulkProcessingOperation,
  ProcessingOperation,
  ScraperValidationStatus,
  MunicipalityRow,
  MunicipalityInsert,
  MunicipalityUpdate,
  PdfDocumentRow,
  PdfDocumentInsert,
  PdfDocumentUpdate,
  ScrapeLogRow,
  ScrapeLogInsert,
  ScrapeLogUpdate,
  BackgroundJobRow,
  BackgroundJobInsert,
  BackgroundJobUpdate,
  BulkProcessingJobRow,
  BulkProcessingJobInsert,
  BulkProcessingJobUpdate,
  ScraperRow,
  ScraperInsert,
  ScraperUpdate,
} from '../types/database';

// ============================================================================
// ENHANCED MUNICIPALITY TYPES
// ============================================================================

/** Municipality with detailed scraper information */
export interface MunicipalityWithScrapers extends Municipality {
  readonly scrapers?: readonly Scraper[];
  readonly activeScraperInfo?: Pick<Scraper, 'id' | 'name' | 'status' | 'success_rate'> | null;
  readonly availableScrapers?: readonly string[];
  readonly scraperAssignments?: readonly {
    scraperName: string;
    isActive: boolean;
    priority: number;
    lastTested?: string | null;
  }[];
}

/** Municipality search and filter parameters */
export interface MunicipalityQueryParams {
  readonly ids?: readonly MunicipalityId[];
  readonly statuses?: readonly MunicipalityStatus[];
  readonly scraperNames?: readonly string[];
  readonly hasAssignedScrapers?: boolean;
  readonly hasActiveScrapers?: boolean;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: 'name' | 'status' | 'last_run' | 'created_at';
  readonly orderDirection?: 'asc' | 'desc';
}

/** Municipality assignment operations */
export interface ScraperAssignmentUpdate {
  readonly municipalityId: MunicipalityId;
  readonly scraperNames: readonly string[];
  readonly activeScraperId?: string | null;
  readonly validateAssignment?: boolean;
}

// ============================================================================
// ENHANCED DOCUMENT TYPES
// ============================================================================

/** Document with processing status details */
export interface DocumentWithProcessingStatus extends PdfDocument {
  readonly processingStage: 'found' | 'downloading' | 'downloaded' | 'extracting' | 'extracted' | 'analyzing' | 'analyzed' | 'error';
  readonly canProcess: boolean;
  readonly nextAction?: 'download' | 'extract' | 'analyze' | 'complete';
  readonly processingProgress?: number;
  readonly estimatedCompletionTime?: string;
}

/** Batch document operations */
export interface DocumentBatchOperation {
  readonly operation: 'download' | 'extract' | 'analyze' | 'delete' | 'favorite' | 'unfavorite';
  readonly documentIds: readonly DocumentId[];
  readonly options?: {
    readonly priority?: 'low' | 'normal' | 'high';
    readonly skipExisting?: boolean;
    readonly validateResults?: boolean;
  };
}

/** Document query parameters with advanced filtering */
export interface DocumentQueryParams {
  readonly municipalityIds?: readonly MunicipalityId[];
  readonly statuses?: {
    download?: readonly DownloadStatus[];
    extraction?: readonly ExtractionStatus[];
    analysis?: readonly AnalysisStatus[];
  };
  readonly contentFilters?: {
    hasContent?: boolean;
    minConfidence?: number;
    maxConfidence?: number;
    isRelevant?: boolean;
    isFavorited?: boolean;
  };
  readonly dateFilters?: {
    foundAfter?: string;
    foundBefore?: string;
    analyzedAfter?: string;
    analyzedBefore?: string;
  };
  readonly search?: {
    query: string;
    searchIn: readonly ('title' | 'filename' | 'content')[];
    matchType: 'exact' | 'contains' | 'fuzzy';
  };
  readonly pagination?: {
    limit?: number;
    offset?: number;
    orderBy?: 'date_found' | 'title' | 'relevance_confidence' | 'analysis_date';
    orderDirection?: 'asc' | 'desc';
  };
}

// ============================================================================
// SCRAPE LOG TYPES
// ============================================================================

/** Enhanced scrape log with operation context */
export interface ScrapeLogWithContext extends ScrapeLogRow {
  readonly municipality?: Pick<Municipality, 'id' | 'name'>;
  readonly scraper?: Pick<Scraper, 'id' | 'name' | 'version'>;
  readonly relatedJob?: Pick<BackgroundJob, 'id' | 'type' | 'status'>;
  readonly performanceMetrics?: {
    docsPerSecond: number;
    successRate: number;
    avgProcessingTime: number;
  };
}

/** Scrape log aggregation parameters */
export interface ScrapeLogQueryParams {
  readonly municipalityIds?: readonly MunicipalityId[];
  readonly statuses?: readonly ScrapeStatus[];
  readonly jobIds?: readonly JobId[];
  readonly dateRange?: {
    start: string;
    end: string;
  };
  readonly aggregation?: {
    groupBy: 'municipality' | 'status' | 'date' | 'scraper';
    metrics: readonly ('count' | 'success_rate' | 'avg_duration' | 'total_documents')[];
  };
  readonly limit?: number;
  readonly offset?: number;
}

// ============================================================================
// BACKGROUND JOB TYPES
// ============================================================================

/** Job with detailed progress tracking */
export interface JobWithProgress extends BackgroundJob {
  readonly progressDetails?: {
    readonly currentStep: string;
    readonly totalSteps: number;
    readonly completedSteps: number;
    readonly estimatedTimeRemaining?: number;
    readonly lastProgressUpdate: string;
  };
  readonly dependencies?: readonly {
    jobId: JobId;
    status: JobStatus;
    required: boolean;
  }[];
  readonly resourceUsage?: {
    memoryUsed: number;
    cpuUsage: number;
    diskSpaceUsed: number;
  };
}

/** Job queue management parameters */
export interface JobQueueParams {
  readonly statuses?: readonly JobStatus[];
  readonly types?: readonly ('scraper' | 'analysis' | 'download' | 'extraction' | 'processing')[];
  readonly municipalityIds?: readonly MunicipalityId[];
  readonly documentIds?: readonly DocumentId[];
  readonly createdAfter?: string;
  readonly createdBefore?: string;
  readonly priority?: 'low' | 'normal' | 'high' | 'urgent';
  readonly limit?: number;
  readonly offset?: number;
}

// ============================================================================
// BULK PROCESSING TYPES
// ============================================================================

/** Bulk job with detailed municipality tracking */
export interface BulkJobWithDetails extends BulkProcessingJob {
  readonly municipalityDetails?: readonly {
    municipalityId: MunicipalityId;
    municipalityName: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    documentsProcessed: number;
    documentsFound: number;
    error?: string;
    startTime?: string;
    endTime?: string;
  }[];
  readonly performanceMetrics?: {
    avgProcessingTimePerMunicipality: number;
    successRate: number;
    totalDocumentsProcessed: number;
    errorRate: number;
  };
}

/** Bulk operation creation parameters */
export interface BulkOperationParams {
  readonly operation: BulkProcessingOperation;
  readonly municipalityIds: readonly MunicipalityId[] | 'all';
  readonly options?: {
    readonly priority?: 'low' | 'normal' | 'high' | 'urgent';
    readonly batchSize?: number;
    readonly maxConcurrentOperations?: number;
    readonly skipExisting?: boolean;
    readonly retryFailedOperations?: boolean;
    readonly validateResults?: boolean;
    readonly notifyOnCompletion?: boolean;
  };
  readonly metadata?: {
    readonly createdBy?: string;
    readonly description?: string;
    readonly tags?: readonly string[];
  };
}

// ============================================================================
// SCRAPER TYPES
// ============================================================================

/** Scraper with municipality and performance data */
export interface ScraperWithDetails extends Scraper {
  readonly municipality?: Pick<Municipality, 'id' | 'name' | 'website_url'>;
  readonly recentJobs?: readonly Pick<BackgroundJob, 'id' | 'status' | 'created_at' | 'completed_at'>[];
  readonly performanceHistory?: readonly {
    date: string;
    documentsFound: number;
    successRate: number;
    duration: number;
  }[];
  readonly validationDetails?: {
    lastValidationDate: string;
    validationErrors: readonly string[];
    validationWarnings: readonly string[];
    estimatedDocuments: number;
    actualDocuments?: number;
  };
}

/** Scraper query parameters */
export interface ScraperQueryParams {
  readonly municipalityIds?: readonly MunicipalityId[];
  readonly statuses?: readonly ScraperValidationStatus[];
  readonly isActive?: boolean;
  readonly minSuccessRate?: number;
  readonly maxSuccessRate?: number;
  readonly lastTestedAfter?: string;
  readonly lastTestedBefore?: string;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

/** Multi-table transaction operation */
export interface TransactionOperation {
  readonly type: 'insert' | 'update' | 'delete';
  readonly table: keyof Database['public']['Tables'];
  readonly data: Record<string, any>;
  readonly condition?: Record<string, any>;
  readonly validateBefore?: (data: any) => Promise<boolean>;
  readonly validateAfter?: (result: any) => Promise<boolean>;
}

/** Transaction batch execution parameters */
export interface TransactionBatch {
  readonly operations: readonly TransactionOperation[];
  readonly options?: {
    readonly rollbackOnError?: boolean;
    readonly validateAll?: boolean;
    readonly maxRetries?: number;
    readonly retryDelay?: number;
  };
  readonly metadata?: {
    readonly description: string;
    readonly correlationId?: string;
    readonly initiatedBy?: string;
  };
}

// ============================================================================
// PROGRESS TRACKING TYPES
// ============================================================================

/** Real-time progress update */
export interface ProgressUpdate {
  readonly jobId: JobId | BulkJobId;
  readonly type: 'job' | 'bulk_job';
  readonly progress: number; // 0-100
  readonly stage: string;
  readonly message?: string;
  readonly details?: Record<string, any>;
  readonly timestamp: string;
  readonly estimatedTimeRemaining?: number;
}

/** Progress checkpoint for complex operations */
export interface ProgressCheckpoint {
  readonly jobId: JobId | BulkJobId;
  readonly checkpointId: string;
  readonly stage: string;
  readonly progress: number;
  readonly data: Record<string, any>;
  readonly canResumeFrom: boolean;
  readonly timestamp: string;
}

// ============================================================================
// CONSISTENCY CHECK TYPES
// ============================================================================

/** Data consistency validation parameters */
export interface ConsistencyCheckParams {
  readonly checkTypes: readonly (
    | 'municipality_scrapers'
    | 'document_statuses'
    | 'job_dependencies'
    | 'scraper_assignments'
    | 'progress_integrity'
  )[];
  readonly fixIssues?: boolean;
  readonly reportOnly?: boolean;
  readonly scope?: {
    municipalityIds?: readonly MunicipalityId[];
    documentIds?: readonly DocumentId[];
    jobIds?: readonly (JobId | BulkJobId)[];
  };
}

/** Consistency check result */
export interface ConsistencyCheckResult {
  readonly checkType: string;
  readonly passed: boolean;
  readonly issues: readonly {
    severity: 'error' | 'warning' | 'info';
    description: string;
    affectedRecords: readonly string[];
    suggestedFix?: string;
    autoFixable: boolean;
  }[];
  readonly fixesApplied?: readonly {
    description: string;
    recordsAffected: number;
    success: boolean;
    error?: string;
  }[];
}

// ============================================================================
// PERFORMANCE MONITORING TYPES
// ============================================================================

/** Database operation performance metrics */
export interface DatabaseMetrics {
  readonly operation: string;
  readonly table: string;
  readonly duration: number;
  readonly recordsAffected: number;
  readonly cacheHit?: boolean;
  readonly queryPlan?: string;
  readonly timestamp: string;
}

/** Query optimization suggestions */
export interface QueryOptimization {
  readonly query: string;
  readonly table: string;
  readonly currentPerformance: {
    avgDuration: number;
    executionCount: number;
    lastExecuted: string;
  };
  readonly suggestions: readonly {
    type: 'index' | 'query_rewrite' | 'partition' | 'cache';
    description: string;
    expectedImprovement: string;
    implementationEffort: 'low' | 'medium' | 'high';
    sqlScript?: string;
  }[];
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/** Generic database operation result */
export interface DatabaseOperationResult<T = any> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: {
    message: string;
    code?: string;
    details?: Record<string, any>;
  };
  readonly metadata?: {
    recordsAffected: number;
    duration: number;
    cacheUsed: boolean;
  };
}

/** Database adapter configuration */
export interface DatabaseAdapterConfig {
  readonly connectionPoolSize?: number;
  readonly queryTimeout?: number;
  readonly retryAttempts?: number;
  readonly retryDelay?: number;
  readonly enableQueryLogging?: boolean;
  readonly enablePerformanceMonitoring?: boolean;
  readonly cacheConfig?: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
}

/** Batch operation configuration */
export interface BatchOperationConfig {
  readonly batchSize: number;
  readonly maxConcurrency: number;
  readonly delayBetweenBatches?: number;
  readonly continueOnError?: boolean;
  readonly validateEachOperation?: boolean;
  readonly progressCallback?: (progress: ProgressUpdate) => void;
}

// Type guards and utility functions
export const isValidMunicipalityId = (id: any): id is MunicipalityId => {
  return typeof id === 'number' && id > 0;
};

export const isValidDocumentId = (id: any): id is DocumentId => {
  return typeof id === 'number' && id > 0;
};

export const isValidJobId = (id: any): id is JobId => {
  return typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
};

export const isValidBulkJobId = (id: any): id is BulkJobId => {
  return typeof id === 'string' && /^bulk_[a-f0-9-]{36}$/.test(id);
};

// Export all types from the main database types file for convenience
export type {
  Database,
  Municipality,
  PdfDocument,
  BackgroundJob,
  BulkProcessingJob,
  Scraper,
  MunicipalityId,
  DocumentId,
  JobId,
  BulkJobId,
  ScraperId,
  MunicipalityStatus,
  JobStatus,
  ScrapeStatus,
  DownloadStatus,
  ExtractionStatus,
  AnalysisStatus,
  BulkProcessingOperation,
  ProcessingOperation,
  ScraperValidationStatus,
  MunicipalityRow,
  MunicipalityInsert,
  MunicipalityUpdate,
  PdfDocumentRow,
  PdfDocumentInsert,
  PdfDocumentUpdate,
  ScrapeLogRow,
  ScrapeLogInsert,
  ScrapeLogUpdate,
  BackgroundJobRow,
  BackgroundJobInsert,
  BackgroundJobUpdate,
  BulkProcessingJobRow,
  BulkProcessingJobInsert,
  BulkProcessingJobUpdate,
  ScraperRow,
  ScraperInsert,
  ScraperUpdate,
} from '../types/database';
