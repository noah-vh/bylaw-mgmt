/**
 * Database Types - Generated from Supabase with enhanced type definitions
 * 
 * This file contains all database entity types, including discriminated unions
 * for status types and comprehensive type definitions for all database operations.
 */

// ============================================================================
// DISCRIMINATED UNION TYPES
// ============================================================================

/** Municipality status with discriminated union for type safety */
export type MunicipalityStatus = 
  | 'pending'
  | 'testing'
  | 'confirmed'
  | 'active'
  | 'error'
  | 'running';

/** Schedule frequency options */
export type ScheduleFrequency = 
  | 'weekly'
  | 'monthly'
  | 'quarterly';

/** Document download status */
export type DownloadStatus = 
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'error';

/** Document extraction status */
export type ExtractionStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

/** Document analysis status */
export type AnalysisStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

/** Scrape log status */
export type ScrapeStatus = 
  | 'success'
  | 'error'
  | 'partial';

/** Background job type */
export type JobType = 
  | 'scraper'
  | 'analysis'
  | 'download'
  | 'extraction'
  | 'processing';

/** Background job status */
export type JobStatus = 
  | 'queued'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Processing operation types */
export type ProcessingOperation = 
  | 'scrape'
  | 'extract'
  | 'analyze'
  | 'full_pipeline';

/** Scraper availability status */
export type ScraperStatus = 
  | 'available'
  | 'busy'
  | 'offline'
  | 'error';

/** Scraper validation status */
export type ScraperValidationStatus = 
  | 'pending'
  | 'testing'
  | 'validated'
  | 'failed';

/** Bulk processing operation types */
export type BulkProcessingOperation = 
  | 'scrape_all'
  | 'analyze_all'
  | 'extract_all'
  | 'full_pipeline_all'
  | 'municipality_batch';

/** Processing job priority */
export type JobPriority = 
  | 'low'
  | 'normal'
  | 'high'
  | 'urgent';

// ============================================================================
// BRANDED TYPES FOR DOMAIN MODELING
// ============================================================================

/** Branded type for Municipality ID */
export type MunicipalityId = number & { readonly __brand: 'MunicipalityId' };

/** Branded type for Document ID */
export type DocumentId = number & { readonly __brand: 'DocumentId' };

/** Branded type for Job ID */
export type JobId = string & { readonly __brand: 'JobId' };

/** Branded type for Keyword ID */
export type KeywordId = number & { readonly __brand: 'KeywordId' };

/** Branded type for Scraper ID */
export type ScraperId = number & { readonly __brand: 'ScraperId' };

/** Branded type for Bulk Processing Job ID */
export type BulkJobId = string & { readonly __brand: 'BulkJobId' };

// Utility functions for branded types
export const createMunicipalityId = (id: number): MunicipalityId => id as MunicipalityId;
export const createDocumentId = (id: number): DocumentId => id as DocumentId;
export const createJobId = (id: string): JobId => id as JobId;
export const createKeywordId = (id: number): KeywordId => id as KeywordId;
export const createScraperId = (id: number): ScraperId => id as ScraperId;
export const createBulkJobId = (id: string): BulkJobId => id as BulkJobId;

// ============================================================================
// DATABASE SCHEMA
// ============================================================================

export interface Database {
  public: {
    Tables: {
      municipalities: {
        Row: {
          id: MunicipalityId
          name: string
          website_url: string
          scraper_name: string | null
          assigned_scrapers: string[] | null
          active_scraper: string | null
          status: MunicipalityStatus
          created_at: string
          updated_at: string
          schedule_frequency: ScheduleFrequency | null
          last_run: string | null
          next_run: string | null
          schedule_active: boolean
          filter_keywords: string | null
          min_relevance_score: number | null
          enable_smart_filtering: boolean | null
          auto_analyze: boolean | null
        }
        Insert: {
          id?: MunicipalityId
          name: string
          website_url: string
          scraper_name?: string | null
          assigned_scrapers?: string[] | null
          active_scraper?: string | null
          status?: MunicipalityStatus
          created_at?: string
          updated_at?: string
          schedule_frequency?: ScheduleFrequency | null
          last_run?: string | null
          next_run?: string | null
          schedule_active?: boolean
          filter_keywords?: string | null
          min_relevance_score?: number | null
          enable_smart_filtering?: boolean | null
          auto_analyze?: boolean | null
        }
        Update: {
          id?: MunicipalityId
          name?: string
          website_url?: string
          scraper_name?: string | null
          assigned_scrapers?: string[] | null
          active_scraper?: string | null
          status?: MunicipalityStatus
          created_at?: string
          updated_at?: string
          schedule_frequency?: ScheduleFrequency | null
          last_run?: string | null
          next_run?: string | null
          schedule_active?: boolean
          filter_keywords?: string | null
          min_relevance_score?: number | null
          enable_smart_filtering?: boolean | null
          auto_analyze?: boolean | null
        }
      }
      pdf_documents: {
        Row: {
          id: DocumentId
          municipality_id: MunicipalityId
          title: string
          url: string
          filename: string
          file_size: number | null
          is_relevant: boolean | null
          date_found: string
          date_published: string | null
          last_checked: string
          content_text: string | null
          relevance_score: number | null
          analysis_date: string | null
          analysis_error: string | null
          storage_path: string | null
          content_hash: string | null
          is_favorited: boolean
          search_vector: unknown | null
          categories: unknown | null
          categorized_at: string | null
          has_aru_provisions: boolean | null
        }
        Insert: {
          id?: DocumentId
          municipality_id: MunicipalityId
          title: string
          url: string
          filename: string
          file_size?: number | null
          is_relevant?: boolean | null
          date_found?: string
          date_published?: string | null
          last_checked?: string
          content_text?: string | null
          relevance_score?: number | null
          analysis_date?: string | null
          analysis_error?: string | null
          storage_path?: string | null
          content_hash?: string | null
          is_favorited?: boolean
          search_vector?: unknown | null
          categories?: unknown | null
          categorized_at?: string | null
          has_aru_provisions?: boolean | null
        }
        Update: {
          id?: DocumentId
          municipality_id?: MunicipalityId
          title?: string
          url?: string
          filename?: string
          file_size?: number | null
          is_relevant?: boolean | null
          date_found?: string
          date_published?: string | null
          last_checked?: string
          content_text?: string | null
          relevance_score?: number | null
          analysis_date?: string | null
          analysis_error?: string | null
          storage_path?: string | null
          content_hash?: string | null
          is_favorited?: boolean
          search_vector?: unknown | null
          categories?: unknown | null
          categorized_at?: string | null
          has_aru_provisions?: boolean | null
        }
      }
      filter_keywords: {
        Row: {
          id: KeywordId
          municipality_id: MunicipalityId
          keyword: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: KeywordId
          municipality_id: MunicipalityId
          keyword: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: KeywordId
          municipality_id?: MunicipalityId
          keyword?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      scrape_logs: {
        Row: {
          id: number
          municipality_id: MunicipalityId
          scrape_date: string
          status: ScrapeStatus
          documents_found: number
          documents_new: number
          error_message: string | null
          job_id: JobId | null
          duration_seconds: number | null
        }
        Insert: {
          id?: number
          municipality_id: MunicipalityId
          scrape_date?: string
          status: ScrapeStatus
          documents_found?: number
          documents_new?: number
          error_message?: string | null
          job_id?: JobId | null
          duration_seconds?: number | null
        }
        Update: {
          id?: number
          municipality_id?: MunicipalityId
          scrape_date?: string
          status?: ScrapeStatus
          documents_found?: number
          documents_new?: number
          error_message?: string | null
          job_id?: JobId | null
          duration_seconds?: number | null
        }
      }
      background_jobs: {
        Row: {
          id: JobId
          type: JobType
          status: JobStatus
          municipality_id: MunicipalityId | null
          document_id: DocumentId | null
          created_at: string
          started_at: string | null
          completed_at: string | null
          progress: number
          progress_message: string | null
          error_message: string | null
          result_data: unknown | null
        }
        Insert: {
          id?: JobId
          type: JobType
          status?: JobStatus
          municipality_id?: MunicipalityId | null
          document_id?: DocumentId | null
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
          progress?: number
          progress_message?: string | null
          error_message?: string | null
          result_data?: unknown | null
        }
        Update: {
          id?: JobId
          type?: JobType
          status?: JobStatus
          municipality_id?: MunicipalityId | null
          document_id?: DocumentId | null
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
          progress?: number
          progress_message?: string | null
          error_message?: string | null
          result_data?: unknown | null
        }
      }
      scrapers: {
        Row: {
          id: ScraperId
          name: string
          version: string
          status: ScraperValidationStatus
          municipality_id: MunicipalityId
          module_name: string
          class_name: string
          created_at: string
          updated_at: string
          last_tested: string | null
          success_rate: number | null
          test_notes: string | null
          is_active: boolean
          estimated_pages: number | null
          estimated_pdfs: number | null
          priority: number
        }
        Insert: {
          id?: ScraperId
          name: string
          version: string
          status?: ScraperValidationStatus
          municipality_id: MunicipalityId
          module_name: string
          class_name: string
          created_at?: string
          updated_at?: string
          last_tested?: string | null
          success_rate?: number | null
          test_notes?: string | null
          is_active?: boolean
          estimated_pages?: number | null
          estimated_pdfs?: number | null
          priority?: number
        }
        Update: {
          id?: ScraperId
          name?: string
          version?: string
          status?: ScraperValidationStatus
          municipality_id?: MunicipalityId
          module_name?: string
          class_name?: string
          created_at?: string
          updated_at?: string
          last_tested?: string | null
          success_rate?: number | null
          test_notes?: string | null
          is_active?: boolean
          estimated_pages?: number | null
          estimated_pdfs?: number | null
          priority?: number
        }
      }
      bulk_processing_jobs: {
        Row: {
          id: BulkJobId
          operation: BulkProcessingOperation
          status: JobStatus
          municipality_ids: MunicipalityId[] | null
          total_operations: number
          completed_operations: number
          failed_operations: number
          progress_file_path: string | null
          created_at: string
          started_at: string | null
          completed_at: string | null
          error_message: string | null
          result_summary: unknown | null
          created_by: string | null
        }
        Insert: {
          id?: BulkJobId
          operation: BulkProcessingOperation
          status?: JobStatus
          municipality_ids?: MunicipalityId[] | null
          total_operations?: number
          completed_operations?: number
          failed_operations?: number
          progress_file_path?: string | null
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
          error_message?: string | null
          result_summary?: unknown | null
          created_by?: string | null
        }
        Update: {
          id?: BulkJobId
          operation?: BulkProcessingOperation
          status?: JobStatus
          municipality_ids?: MunicipalityId[] | null
          total_operations?: number
          completed_operations?: number
          failed_operations?: number
          progress_file_path?: string | null
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
          error_message?: string | null
          result_summary?: unknown | null
          created_by?: string | null
        }
      }
    }
    Views: {
      municipality_stats: {
        Row: {
          municipality_id: MunicipalityId
          municipality_name: string
          total_documents: number
          analyzed_documents: number
          relevant_documents: number
          last_scrape_date: string | null
          last_scrape_status: ScrapeStatus | null
          avg_relevance_score: number | null
        }
      }
    }
  }
}

// ============================================================================
// ENHANCED ENTITY TYPES
// ============================================================================

/** Enhanced Municipality type with computed fields */
export type Municipality = Database['public']['Tables']['municipalities']['Row'] & {
  readonly totalDocuments?: number;
  readonly lastScrape?: {
    readonly date: string;
    readonly status: ScrapeStatus;
    readonly documentsFound: number;
  } | null;
}

/** Enhanced PDF Document type with computed fields */
export type PdfDocument = Database['public']['Tables']['pdf_documents']['Row'] & {
  readonly municipality?: Pick<Municipality, 'id' | 'name'>;
  readonly municipality_name?: string;
  readonly fileSizeFormatted?: string;
  readonly confidenceLevel?: 'low' | 'medium' | 'high';
  readonly rank?: number;
  readonly highlighted?: {
    title: string;
    content: string | null;
  };
}

/** Enhanced Background Job type with computed fields */
export type BackgroundJob = Database['public']['Tables']['background_jobs']['Row'] & {
  readonly duration?: number;
  readonly isRunning: boolean;
  readonly isCompleted: boolean;
  readonly isFailed: boolean;
}

/** Enhanced Scraper type with computed fields */
export type Scraper = Database['public']['Tables']['scrapers']['Row'] & {
  readonly municipality?: Pick<Municipality, 'id' | 'name'>;
  readonly municipality_name?: string;
  readonly isValidated: boolean;
  readonly isActiveAndValidated: boolean;
  readonly statusIcon: string;
  readonly lastTestDuration?: number;
}

/** Enhanced Bulk Processing Job type with computed fields */
export type BulkProcessingJob = Database['public']['Tables']['bulk_processing_jobs']['Row'] & {
  readonly duration?: number;
  readonly isRunning: boolean;
  readonly isCompleted: boolean;
  readonly isFailed: boolean;
  readonly progressPercentage: number;
  readonly estimatedTimeRemaining?: number;
  readonly municipalityNames?: readonly string[];
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/** Generic API response wrapper */
export interface ApiResponse<TData = unknown> {
  readonly data?: TData;
  readonly error?: string;
  readonly message?: string;
  readonly timestamp?: string;
}

/** Success response */
export interface SuccessResponse<TData = unknown> extends Required<Pick<ApiResponse<TData>, 'data'>> {
  readonly error?: never;
  readonly message?: string;
  readonly timestamp: string;
}

/** Error response */
export interface ErrorResponse extends Required<Pick<ApiResponse<never>, 'error'>> {
  readonly data?: never;
  readonly message?: string;
  readonly timestamp: string;
  readonly code?: string;
  readonly details?: Record<string, unknown>;
}

/** Pagination parameters */
export interface PaginationParams {
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: string;
  readonly order?: 'asc' | 'desc';
}

/** Pagination metadata */
export interface PaginationMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPrevPage: boolean;
}

/** Paginated response */
export interface PaginatedResponse<TData> extends SuccessResponse<readonly TData[]> {
  readonly pagination: PaginationMeta;
}

// ============================================================================
// JOB PROGRESS TYPES
// ============================================================================

/** Job progress update */
export interface JobProgress {
  readonly jobId: JobId;
  readonly type: JobType;
  readonly status: JobStatus;
  readonly progress: number;
  readonly message?: string;
  readonly municipalityId?: MunicipalityId;
  readonly documentId?: DocumentId;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly error?: string;
  readonly result?: unknown;
}

/** Job result types based on job type */
export interface ScraperJobResult {
  readonly documentsFound: number;
  readonly documentsNew: number;
  readonly documentsUpdated: number;
  readonly errors: readonly string[];
}

export interface AnalysisJobResult {
  readonly documentsAnalyzed: number;
  readonly relevantDocuments: number;
  readonly averageConfidence: number;
}

export interface DownloadJobResult {
  readonly documentsDownloaded: number;
  readonly totalSize: number;
  readonly failures: readonly string[];
}

export interface ExtractionJobResult {
  readonly documentsProcessed: number;
  readonly successfulExtractions: number;
  readonly failedExtractions: number;
  readonly averageProcessingTime: number;
}

export interface ProcessingJobResult {
  readonly totalOperations: number;
  readonly completedOperations: number;
  readonly failedOperations: number;
  readonly duration: number;
  readonly details: Record<string, unknown>;
}

export interface BulkProcessingJobResult {
  readonly operation: BulkProcessingOperation;
  readonly totalMunicipalities: number;
  readonly successfulMunicipalities: number;
  readonly failedMunicipalities: number;
  readonly totalDocuments: number;
  readonly newDocuments: number;
  readonly duration: number;
  readonly municipalityResults: readonly {
    municipalityId: MunicipalityId;
    municipalityName: string;
    status: 'success' | 'failed';
    documentsFound: number;
    documentsNew: number;
    error?: string;
  }[];
}

/** Progress file structure for file-based tracking */
export interface ProgressFileData {
  readonly jobId: BulkJobId;
  readonly operation: BulkProcessingOperation;
  readonly status: JobStatus;
  readonly startTime: string;
  readonly lastUpdate: string;
  readonly totalOperations: number;
  readonly completedOperations: number;
  readonly failedOperations: number;
  readonly currentMunicipality?: {
    readonly id: MunicipalityId;
    readonly name: string;
    readonly status: 'processing' | 'completed' | 'failed';
  };
  readonly errors: readonly string[];
  readonly summary?: BulkProcessingJobResult;
}

// ============================================================================
// SEARCH AND FILTER TYPES
// ============================================================================

/** Document search parameters */
export interface DocumentSearchParams extends PaginationParams {
  readonly municipalityId?: MunicipalityId;
  readonly search?: string;
  readonly searchType?: 'basic' | 'fulltext';
  readonly isAduRelevant?: boolean; // Frontend parameter name
  readonly isAnalyzed?: boolean;
  readonly isFavorited?: boolean;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly minConfidence?: number;
  readonly maxConfidence?: number;
  readonly downloadStatus?: DownloadStatus;
  readonly extractionStatus?: ExtractionStatus;
  readonly analysisStatus?: AnalysisStatus;
  readonly category?: string;
}

/** Municipality search parameters */
export interface MunicipalitySearchParams extends PaginationParams {
  readonly status?: MunicipalityStatus;
  readonly hasDocuments?: boolean;
  readonly scheduledOnly?: boolean;
  readonly search?: string;
  readonly scraperName?: string;
}

/** Filter options for documents */
export interface DocumentFilters {
  readonly municipalities: readonly Pick<Municipality, 'id' | 'name'>[];
  readonly statuses: readonly DownloadStatus[];
  readonly confidenceRanges: readonly {
    readonly label: string;
    readonly min: number;
    readonly max: number;
  }[];
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/** Make all properties optional recursively */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Make all properties required recursively */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/** Extract keys that have values of a specific type */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/** Create a type with only specified keys */
export type PickByType<T, U> = Pick<T, KeysOfType<T, U>>;

/** Type guard for checking if value is not null or undefined */
export const isNotNull = <T>(value: T | null | undefined): value is T => {
  return value !== null && value !== undefined;
};

/** Type guard for API success response */
export const isSuccessResponse = <T>(
  response: ApiResponse<T>
): response is SuccessResponse<T> => {
  return 'data' in response && response.error === undefined;
};

/** Type guard for API error response */
export const isErrorResponse = (
  response: ApiResponse<unknown>
): response is ErrorResponse => {
  return 'error' in response && response.data === undefined;
};

// ============================================================================
// TABLE TYPE ALIASES
// ============================================================================

export type MunicipalityRow = Database['public']['Tables']['municipalities']['Row'];
export type MunicipalityInsert = Database['public']['Tables']['municipalities']['Insert'];
export type MunicipalityUpdate = Database['public']['Tables']['municipalities']['Update'];

export type PdfDocumentRow = Database['public']['Tables']['pdf_documents']['Row'];
export type PdfDocumentInsert = Database['public']['Tables']['pdf_documents']['Insert'];
export type PdfDocumentUpdate = Database['public']['Tables']['pdf_documents']['Update'];

export type FilterKeywordRow = Database['public']['Tables']['filter_keywords']['Row'];
export type FilterKeywordInsert = Database['public']['Tables']['filter_keywords']['Insert'];
export type FilterKeywordUpdate = Database['public']['Tables']['filter_keywords']['Update'];

export type ScrapeLogRow = Database['public']['Tables']['scrape_logs']['Row'];
export type ScrapeLogInsert = Database['public']['Tables']['scrape_logs']['Insert'];
export type ScrapeLogUpdate = Database['public']['Tables']['scrape_logs']['Update'];

export type BackgroundJobRow = Database['public']['Tables']['background_jobs']['Row'];
export type BackgroundJobInsert = Database['public']['Tables']['background_jobs']['Insert'];
export type BackgroundJobUpdate = Database['public']['Tables']['background_jobs']['Update'];

export type ScraperRow = Database['public']['Tables']['scrapers']['Row'];
export type ScraperInsert = Database['public']['Tables']['scrapers']['Insert'];
export type ScraperUpdate = Database['public']['Tables']['scrapers']['Update'];

export type BulkProcessingJobRow = Database['public']['Tables']['bulk_processing_jobs']['Row'];
export type BulkProcessingJobInsert = Database['public']['Tables']['bulk_processing_jobs']['Insert'];
export type BulkProcessingJobUpdate = Database['public']['Tables']['bulk_processing_jobs']['Update'];

export type MunicipalityStatsRow = Database['public']['Views']['municipality_stats']['Row'];

// ============================================================================
// SCRAPER AND PROCESSING TYPES
// ============================================================================

/** Scraper information */
export interface ScraperInfo {
  readonly name: string;
  readonly displayName: string;
  readonly status: ScraperStatus;
  readonly municipalityId: MunicipalityId | null;
  readonly lastRun: string | null;
  readonly nextRun: string | null;
  readonly isActive: boolean;
  readonly description?: string;
  readonly capabilities: readonly string[];
  readonly version?: string;
  readonly successRate?: number;
  readonly lastTestDate?: string | null;
  readonly estimatedPages?: number;
  readonly estimatedDocuments?: number;
}

/** Processing job creation request */
export interface ProcessingJobRequest {
  readonly operation: ProcessingOperation;
  readonly municipalityIds?: readonly MunicipalityId[];
  readonly documentIds?: readonly DocumentId[];
  readonly options?: {
    readonly priority?: JobPriority;
    readonly skipExisting?: boolean;
    readonly retryFailedJobs?: boolean;
    readonly validateResults?: boolean;
    readonly batchSize?: number;
  };
}

/** Scraping job creation request */
export interface ScrapingJobRequest {
  readonly municipalityIds: readonly MunicipalityId[] | 'all';
  readonly options?: {
    readonly priority?: JobPriority;
    readonly forceUpdate?: boolean;
    readonly skipRecentlyRun?: boolean;
    readonly scheduleNext?: boolean;
  };
}

/** Job status response with detailed progress */
export interface DetailedJobStatus extends BackgroundJob {
  readonly municipality?: Pick<Municipality, 'id' | 'name'>;
  readonly document?: Pick<PdfDocument, 'id' | 'title'>;
  readonly elapsedTime?: number;
  readonly estimatedTimeRemaining?: number;
  readonly logs: readonly string[];
}