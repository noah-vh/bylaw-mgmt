/**
 * TypeScript types and interfaces for Python service communication
 */

// Base message types
export interface BaseMessage {
  id: string;
  timestamp: number;
}

export interface ServiceRequest extends BaseMessage {
  type: 'request';
  operation: string;
  params: Record<string, unknown>;
}

export interface ServiceResponse extends BaseMessage {
  type: 'response';
  request_id: string;
  success: boolean;
  data?: unknown;
  error?: ServiceError;
}

export interface ProgressMessage extends BaseMessage {
  type: 'progress';
  request_id: string;
  stage: string;
  progress: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface HealthCheckMessage extends BaseMessage {
  type: 'health_check';
}

export interface HealthCheckResponse extends BaseMessage {
  type: 'health_response';
  status: 'healthy' | 'unhealthy';
  details?: Record<string, unknown>;
}

// Error types
export interface ServiceError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

export type ServiceErrorCode = 
  | 'SCRAPER_NOT_FOUND'
  | 'MUNICIPALITY_NOT_FOUND'
  | 'INVALID_PARAMETERS'
  | 'SCRAPING_FAILED'
  | 'EXTRACTION_FAILED'
  | 'ANALYSIS_FAILED'
  | 'DATABASE_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'INTERNAL_ERROR';

// Municipality data types
export interface Municipality {
  id: string;
  name: string;
  province: string;
  website_url?: string;
  bylaws_url?: string;
  population?: number;
  created_at: string;
  updated_at: string;
}

export interface MunicipalityCreateParams {
  name: string;
  province: string;
  website_url?: string;
  bylaws_url?: string;
  population?: number;
}

export interface MunicipalityUpdateParams {
  name?: string;
  province?: string;
  website_url?: string;
  bylaws_url?: string;
  population?: number;
}

// Scraper data types
export interface Scraper {
  name: string;
  description: string;
  supported_municipalities: string[];
  config_schema: Record<string, unknown>;
  is_active: boolean;
}

export interface ScraperTestParams {
  scraper_name: string;
  municipality_id: string;
  config?: Record<string, unknown>;
  dry_run?: boolean;
  max_documents?: number;
}

export interface ScraperTestResult {
  success: boolean;
  documents_found: number;
  sample_documents: DocumentMetadata[];
  errors: string[];
  warnings: string[];
  execution_time: number;
}

// Document data types
export interface Document {
  id: string;
  municipality_id: string;
  title: string;
  url: string;
  document_type: DocumentType;
  file_path?: string;
  file_size?: number;
  page_count?: number;
  scraped_at: string;
  processed_at?: string;
  status: DocumentStatus;
  metadata: Record<string, unknown>;
}

export interface DocumentMetadata {
  title: string;
  url: string;
  document_type: DocumentType;
  estimated_pages?: number;
  last_modified?: string;
  file_size?: number;
}

export type DocumentType = 
  | 'bylaw'
  | 'policy'
  | 'ordinance'
  | 'resolution'
  | 'minutes'
  | 'report'
  | 'other';

export type DocumentStatus = 
  | 'discovered'
  | 'downloading'
  | 'downloaded'
  | 'processing'
  | 'processed'
  | 'failed'
  | 'skipped';

// Pipeline operation parameters
export interface ScrapingPhaseParams {
  municipalities: string[];
  scrapers?: string[];
  config?: Record<string, unknown>;
  max_documents_per_municipality?: number;
  concurrent_requests?: number;
  delay_between_requests?: number;
  retry_attempts?: number;
  timeout?: number;
}

export interface ExtractionPhaseParams {
  document_ids?: string[];
  municipality_ids?: string[];
  document_types?: DocumentType[];
  batch_size?: number;
  concurrent_extractions?: number;
  force_reprocess?: boolean;
  timeout?: number;
}

export interface AnalysisPhaseParams {
  municipality_ids: string[];
  analysis_types?: AnalysisType[];
  comparison_municipalities?: string[];
  output_format?: 'json' | 'csv' | 'pdf';
  include_charts?: boolean;
  timeout?: number;
}

export interface CompletePipelineParams {
  municipalities: string[];
  scrapers?: string[];
  scraping_config?: Record<string, unknown>;
  extraction_config?: Record<string, unknown>;
  analysis_config?: Record<string, unknown>;
  skip_scraping?: boolean;
  skip_extraction?: boolean;
  skip_analysis?: boolean;
  timeout?: number;
}

export type AnalysisType = 
  | 'content_summary'
  | 'topic_modeling'
  | 'policy_comparison'
  | 'regulatory_gaps'
  | 'compliance_check';

// Progress reporting
export interface ProgressReport {
  stage: PipelineStage;
  progress: number; // 0-100
  message: string;
  current_item?: string;
  items_completed: number;
  items_total: number;
  estimated_time_remaining?: number;
  details?: Record<string, unknown>;
}

export type PipelineStage = 
  | 'initializing'
  | 'scraping'
  | 'downloading'
  | 'extracting'
  | 'analyzing'
  | 'finalizing'
  | 'completed'
  | 'failed';

// Operation results
export interface ScrapingPhaseResult {
  municipalities_processed: number;
  documents_discovered: number;
  documents_downloaded: number;
  failed_downloads: number;
  execution_time: number;
  errors: ServiceError[];
  warnings: string[];
  municipality_results: MunicipalityScrapingResult[];
}

export interface MunicipalityScrapingResult {
  municipality_id: string;
  municipality_name: string;
  scraper_used: string;
  documents_found: number;
  documents_downloaded: number;
  failed_downloads: number;
  errors: string[];
  warnings: string[];
}

export interface ExtractionPhaseResult {
  documents_processed: number;
  successful_extractions: number;
  failed_extractions: number;
  execution_time: number;
  errors: ServiceError[];
  warnings: string[];
  document_results: DocumentExtractionResult[];
}

export interface DocumentExtractionResult {
  document_id: string;
  document_title: string;
  success: boolean;
  extracted_text_length: number;
  page_count: number;
  processing_time: number;
  error?: string;
}

export interface AnalysisPhaseResult {
  municipalities_analyzed: number;
  analysis_types_completed: AnalysisType[];
  reports_generated: string[];
  execution_time: number;
  errors: ServiceError[];
  warnings: string[];
  analysis_summary: Record<string, unknown>;
}

export interface CompletePipelineResult {
  pipeline_id: string;
  status: 'completed' | 'partial' | 'failed';
  start_time: string;
  end_time: string;
  total_execution_time: number;
  scraping_result?: ScrapingPhaseResult;
  extraction_result?: ExtractionPhaseResult;
  analysis_result?: AnalysisPhaseResult;
  errors: ServiceError[];
  warnings: string[];
}

// Service client options
export interface ServiceClientOptions {
  pythonExecutable?: string;
  servicePath: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  healthCheckInterval?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  onProgress?: (progress: ProgressReport) => void;
  onError?: (error: ServiceError) => void;
}

export interface ServiceHealthStatus {
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck: Date;
  responseTime?: number;
  details?: Record<string, unknown>;
}

// Request timeout options
export interface RequestOptions {
  timeout?: number;
  retries?: number;
  onProgress?: (progress: ProgressReport) => void;
}

// Type guards
export function isServiceResponse(message: unknown): message is ServiceResponse {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'response' &&
    'request_id' in message &&
    'success' in message
  );
}

export function isProgressMessage(message: unknown): message is ProgressMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'progress' &&
    'request_id' in message &&
    'progress' in message
  );
}

export function isHealthCheckResponse(message: unknown): message is HealthCheckResponse {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'health_response' &&
    'status' in message
  );
}

// Utility types
export type ServiceOperation = 
  | 'test_scraper'
  | 'run_scraping_phase'
  | 'run_extraction_phase'
  | 'run_analysis_phase'
  | 'run_complete_pipeline'
  | 'get_municipalities'
  | 'create_municipality'
  | 'update_municipality'
  | 'delete_municipality'
  | 'get_scrapers'
  | 'get_documents'
  | 'get_document'
  | 'delete_document'
  | 'health_check';

export interface ServiceOperationMap {
  test_scraper: {
    params: ScraperTestParams;
    result: ScraperTestResult;
  };
  run_scraping_phase: {
    params: ScrapingPhaseParams;
    result: ScrapingPhaseResult;
  };
  run_extraction_phase: {
    params: ExtractionPhaseParams;
    result: ExtractionPhaseResult;
  };
  run_analysis_phase: {
    params: AnalysisPhaseParams;
    result: AnalysisPhaseResult;
  };
  run_complete_pipeline: {
    params: CompletePipelineParams;
    result: CompletePipelineResult;
  };
  get_municipalities: {
    params: Record<string, never>;
    result: Municipality[];
  };
  create_municipality: {
    params: MunicipalityCreateParams;
    result: Municipality;
  };
  update_municipality: {
    params: { id: string } & MunicipalityUpdateParams;
    result: Municipality;
  };
  delete_municipality: {
    params: { id: string };
    result: { success: boolean };
  };
  get_scrapers: {
    params: Record<string, never>;
    result: Scraper[];
  };
  get_documents: {
    params: {
      municipality_id?: string;
      document_type?: DocumentType;
      status?: DocumentStatus;
      limit?: number;
      offset?: number;
    };
    result: Document[];
  };
  get_document: {
    params: { id: string };
    result: Document;
  };
  delete_document: {
    params: { id: string };
    result: { success: boolean };
  };
  health_check: {
    params: Record<string, never>;
    result: ServiceHealthStatus;
  };
}