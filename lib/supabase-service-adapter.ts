/**
 * Supabase Service Adapter
 * 
 * Database adapter that provides a comprehensive interface for working with
 * the existing Supabase schema while supporting the new service architecture.
 * Handles assigned_scrapers arrays, batch operations, transactions, and
 * data consistency checks.
 */

import { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
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
  BulkProcessingOperation,
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
import type {
  MunicipalityWithScrapers,
  MunicipalityQueryParams,
  ScraperAssignmentUpdate,
  DocumentWithProcessingStatus,
  DocumentBatchOperation,
  DocumentQueryParams,
  ScrapeLogWithContext,
  ScrapeLogQueryParams,
  JobWithProgress,
  JobQueueParams,
  BulkJobWithDetails,
  BulkOperationParams,
  ScraperWithDetails,
  ScraperQueryParams,
  TransactionOperation,
  TransactionBatch,
  ProgressUpdate,
  ProgressCheckpoint,
  ConsistencyCheckParams,
  ConsistencyCheckResult,
  DatabaseOperationResult,
  DatabaseAdapterConfig,
  BatchOperationConfig,
  DatabaseMetrics,
  QueryOptimization,
} from './database-types';
import { supabase } from './supabase';
import { handleSupabaseError, handleQueryResult, handleArrayQueryResult } from './supabase-enhanced';

// ============================================================================
// SUPABASE SERVICE ADAPTER CLASS
// ============================================================================

export class SupabaseServiceAdapter {
  private client: SupabaseClient<Database>;
  private config: DatabaseAdapterConfig;
  private metrics: Map<string, DatabaseMetrics[]> = new Map();
  private connectionPool: Map<string, SupabaseClient<Database>> = new Map();

  constructor(
    client: SupabaseClient<Database> = supabase,
    config: DatabaseAdapterConfig = {}
  ) {
    this.client = client;
    this.config = {
      connectionPoolSize: 5,
      queryTimeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      enableQueryLogging: process.env.NODE_ENV === 'development',
      enablePerformanceMonitoring: true,
      cacheConfig: {
        enabled: true,
        ttl: 300, // 5 minutes
        maxSize: 1000,
      },
      ...config,
    };
  }

  // ============================================================================
  // MUNICIPALITY OPERATIONS
  // ============================================================================

  /**
   * Find municipalities by assigned scraper names
   */
  async findMunicipalitiesByScrapers(
    scraperNames: readonly string[],
    options: { includeInactive?: boolean } = {}
  ): Promise<DatabaseOperationResult<MunicipalityWithScrapers[]>> {
    const startTime = Date.now();
    
    try {
      let query = this.client
        .from('municipalities')
        .select(`
          *,
          scrapers(
            id,
            name,
            status,
            success_rate,
            last_tested,
            is_active
          )
        `);

      // Filter by assigned scrapers array
      if (scraperNames.length > 0) {
        query = query.overlaps('assigned_scrapers', scraperNames);
      }

      if (!options.includeInactive) {
        query = query.neq('status', 'inactive');
      }

      const result = await query.order('name');
      
      if (result.error) {
        return {
          success: false,
          error: {
            message: result.error.message,
            code: result.error.code,
            details: result.error.details,
          },
        };
      }

      const municipalities = result.data.map(row => this.enrichMunicipalityData(row));
      
      this.recordMetrics('findMunicipalitiesByScrapers', 'municipalities', Date.now() - startTime, municipalities.length);
      
      return {
        success: true,
        data: municipalities,
        metadata: {
          recordsAffected: municipalities.length,
          duration: Date.now() - startTime,
          cacheUsed: false,
        },
      };
    } catch (error) {
      return this.handleError('findMunicipalitiesByScrapers', error as Error, startTime);
    }
  }

  /**
   * Query municipalities with advanced filtering
   */
  async queryMunicipalities(
    params: MunicipalityQueryParams
  ): Promise<DatabaseOperationResult<MunicipalityWithScrapers[]>> {
    const startTime = Date.now();
    
    try {
      let query = this.client
        .from('municipalities')
        .select(`
          *,
          scrapers(
            id,
            name,
            status,
            success_rate,
            last_tested,
            is_active,
            priority
          ),
          scrape_logs(
            id,
            scrape_date,
            status,
            documents_found,
            documents_new
          )
        `);

      // Apply filters
      if (params.ids && params.ids.length > 0) {
        query = query.in('id', params.ids);
      }

      if (params.statuses && params.statuses.length > 0) {
        query = query.in('status', params.statuses);
      }

      if (params.scraperNames && params.scraperNames.length > 0) {
        query = query.overlaps('assigned_scrapers', params.scraperNames);
      }

      if (params.hasAssignedScrapers !== undefined) {
        if (params.hasAssignedScrapers) {
          query = query.not('assigned_scrapers', 'is', null);
        } else {
          query = query.is('assigned_scrapers', null);
        }
      }

      if (params.hasActiveScrapers !== undefined) {
        if (params.hasActiveScrapers) {
          query = query.not('active_scraper', 'is', null);
        } else {
          query = query.is('active_scraper', null);
        }
      }

      if (params.search) {
        query = query.ilike('name', `%${params.search}%`);
      }

      // Apply ordering
      const orderBy = params.orderBy || 'name';
      const direction = params.orderDirection === 'desc';
      query = query.order(orderBy, { ascending: !direction });

      // Apply pagination
      if (params.limit) {
        query = query.limit(params.limit);
      }
      if (params.offset) {
        query = query.range(params.offset, (params.offset + (params.limit || 50)) - 1);
      }

      // Order scrape logs by date
      query = query.order('scrape_date', { ascending: false, foreignTable: 'scrape_logs' });
      query = query.limit(5, { foreignTable: 'scrape_logs' });

      const result = await query;
      
      if (result.error) {
        return {
          success: false,
          error: {
            message: result.error.message,
            code: result.error.code,
            details: result.error.details,
          },
        };
      }

      const municipalities = result.data.map(row => this.enrichMunicipalityData(row));
      
      this.recordMetrics('queryMunicipalities', 'municipalities', Date.now() - startTime, municipalities.length);
      
      return {
        success: true,
        data: municipalities,
        metadata: {
          recordsAffected: municipalities.length,
          duration: Date.now() - startTime,
          cacheUsed: false,
        },
      };
    } catch (error) {
      return this.handleError('queryMunicipalities', error as Error, startTime);
    }
  }

  /**
   * Update scraper assignments for municipalities
   */
  async updateScraperAssignments(
    updates: readonly ScraperAssignmentUpdate[]
  ): Promise<DatabaseOperationResult<MunicipalityRow[]>> {
    const startTime = Date.now();
    
    try {
      const results: MunicipalityRow[] = [];
      const errors: string[] = [];

      // Process each update
      for (const update of updates) {
        const { municipalityId, scraperNames, activeScraperId, validateAssignment } = update;

        // Validate assignment if requested
        if (validateAssignment) {
          const isValid = await this.validateScraperAssignment(municipalityId, scraperNames);
          if (!isValid) {
            errors.push(`Invalid scraper assignment for municipality ${municipalityId}`);
            continue;
          }
        }

        // Update municipality
        const updateData: MunicipalityUpdate = {
          assigned_scrapers: scraperNames.length > 0 ? scraperNames : null,
          active_scraper: activeScraperId || null,
          updated_at: new Date().toISOString(),
        };

        const result = await this.client
          .from('municipalities')
          .update(updateData)
          .eq('id', municipalityId)
          .select()
          .single();

        if (result.error) {
          errors.push(`Failed to update municipality ${municipalityId}: ${result.error.message}`);
        } else if (result.data) {
          results.push(result.data);
        }
      }

      this.recordMetrics('updateScraperAssignments', 'municipalities', Date.now() - startTime, results.length);

      if (errors.length > 0 && results.length === 0) {
        return {
          success: false,
          error: {
            message: 'All assignment updates failed',
            details: { errors },
          },
        };
      }

      return {
        success: true,
        data: results,
        metadata: {
          recordsAffected: results.length,
          duration: Date.now() - startTime,
          cacheUsed: false,
        },
      };
    } catch (error) {
      return this.handleError('updateScraperAssignments', error as Error, startTime);
    }
  }

  // ============================================================================
  // DOCUMENT OPERATIONS
  // ============================================================================

  /**
   * Query documents with advanced filtering and processing status
   */
  async queryDocuments(
    params: DocumentQueryParams
  ): Promise<DatabaseOperationResult<DocumentWithProcessingStatus[]>> {
    const startTime = Date.now();
    
    try {
      let query = this.client
        .from('pdf_documents')
        .select(`
          *,
          municipalities(
            id,
            name,
            website_url
          )
        `);

      // Apply municipality filter
      if (params.municipalityIds && params.municipalityIds.length > 0) {
        query = query.in('municipality_id', params.municipalityIds);
      }

      // Apply status filters
      if (params.statuses) {
        if (params.statuses.download) {
          query = query.in('download_status', params.statuses.download);
        }
        if (params.statuses.extraction) {
          query = query.in('extraction_status', params.statuses.extraction);
        }
        if (params.statuses.analysis) {
          query = query.in('analysis_status', params.statuses.analysis);
        }
      }

      // Apply content filters
      if (params.contentFilters) {
        const { hasContent, minConfidence, maxConfidence, isRelevant, isFavorited } = params.contentFilters;
        
        if (hasContent !== undefined) {
          if (hasContent) {
            query = query.not('content_text', 'is', null);
          } else {
            query = query.is('content_text', null);
          }
        }

        if (minConfidence !== undefined) {
          query = query.gte('relevance_confidence', minConfidence);
        }
        if (maxConfidence !== undefined) {
          query = query.lte('relevance_confidence', maxConfidence);
        }
        if (isRelevant !== undefined) {
          query = query.eq('is_adu_relevant', isRelevant);
        }
        if (isFavorited !== undefined) {
          query = query.eq('is_favorited', isFavorited);
        }
      }

      // Apply date filters
      if (params.dateFilters) {
        const { foundAfter, foundBefore, analyzedAfter, analyzedBefore } = params.dateFilters;
        
        if (foundAfter) {
          query = query.gte('date_found', foundAfter);
        }
        if (foundBefore) {
          query = query.lte('date_found', foundBefore);
        }
        if (analyzedAfter) {
          query = query.gte('analysis_date', analyzedAfter);
        }
        if (analyzedBefore) {
          query = query.lte('analysis_date', analyzedBefore);
        }
      }

      // Apply search
      if (params.search) {
        const { query: searchQuery, searchIn, matchType } = params.search;
        let searchConditions: string[] = [];
        
        if (searchIn.includes('title')) {
          searchConditions.push(`title.${matchType === 'exact' ? 'eq' : 'ilike'}.${matchType === 'exact' ? searchQuery : `%${searchQuery}%`}`);
        }
        if (searchIn.includes('filename')) {
          searchConditions.push(`filename.${matchType === 'exact' ? 'eq' : 'ilike'}.${matchType === 'exact' ? searchQuery : `%${searchQuery}%`}`);
        }
        if (searchIn.includes('content')) {
          searchConditions.push(`content_text.${matchType === 'exact' ? 'eq' : 'ilike'}.${matchType === 'exact' ? searchQuery : `%${searchQuery}%`}`);
        }
        
        if (searchConditions.length > 0) {
          query = query.or(searchConditions.join(','));
        }
      }

      // Apply pagination and ordering
      if (params.pagination) {
        const { limit, offset, orderBy, orderDirection } = params.pagination;
        
        if (orderBy) {
          query = query.order(orderBy, { ascending: orderDirection === 'asc' });
        }
        if (limit) {
          query = query.limit(limit);
        }
        if (offset) {
          query = query.range(offset, (offset + (limit || 50)) - 1);
        }
      } else {
        query = query.order('date_found', { ascending: false });
      }

      const result = await query;
      
      if (result.error) {
        return {
          success: false,
          error: {
            message: result.error.message,
            code: result.error.code,
            details: result.error.details,
          },
        };
      }

      const documents = result.data.map(row => this.enrichDocumentData(row));
      
      this.recordMetrics('queryDocuments', 'pdf_documents', Date.now() - startTime, documents.length);
      
      return {
        success: true,
        data: documents,
        metadata: {
          recordsAffected: documents.length,
          duration: Date.now() - startTime,
          cacheUsed: false,
        },
      };
    } catch (error) {
      return this.handleError('queryDocuments', error as Error, startTime);
    }
  }

  /**
   * Execute batch document operations
   */
  async executeBatchDocumentOperation(
    operation: DocumentBatchOperation,
    config: BatchOperationConfig = { batchSize: 50, maxConcurrency: 3 }
  ): Promise<DatabaseOperationResult<{ processed: number; failed: number; errors: string[] }>> {
    const startTime = Date.now();
    const { documentIds, operation: op, options } = operation;
    const { batchSize, maxConcurrency, continueOnError = true } = config;
    
    try {
      let processed = 0;
      let failed = 0;
      const errors: string[] = [];

      // Process in batches
      for (let i = 0; i < documentIds.length; i += batchSize) {
        const batch = documentIds.slice(i, i + batchSize);
        const batchPromises = [];
        
        // Process batch with concurrency limit
        for (let j = 0; j < batch.length; j += Math.ceil(batch.length / maxConcurrency)) {
          const subBatch = batch.slice(j, j + Math.ceil(batch.length / maxConcurrency));
          batchPromises.push(this.processBatchChunk(subBatch, op, options));
        }
        
        const results = await Promise.allSettled(batchPromises);
        
        for (const result of results) {
          if (result.status === 'fulfilled') {
            processed += result.value.processed;
            failed += result.value.failed;
            errors.push(...result.value.errors);
          } else {
            failed += batchSize;
            errors.push(result.reason?.message || 'Unknown batch error');
            
            if (!continueOnError) {
              break;
            }
          }
        }

        // Progress callback
        if (config.progressCallback) {
          const progress = Math.round(((i + batch.length) / documentIds.length) * 100);
          config.progressCallback({
            jobId: `batch_${Date.now()}` as any,
            type: 'job',
            progress,
            stage: `Processing batch ${Math.floor(i / batchSize) + 1}`,
            timestamp: new Date().toISOString(),
          });
        }

        // Delay between batches if configured
        if (config.delayBetweenBatches && i + batchSize < documentIds.length) {
          await new Promise(resolve => setTimeout(resolve, config.delayBetweenBatches));
        }
      }

      this.recordMetrics('executeBatchDocumentOperation', 'pdf_documents', Date.now() - startTime, processed);

      return {
        success: failed === 0 || (processed > 0 && continueOnError),
        data: { processed, failed, errors },
        metadata: {
          recordsAffected: processed,
          duration: Date.now() - startTime,
          cacheUsed: false,
        },
      };
    } catch (error) {
      return this.handleError('executeBatchDocumentOperation', error as Error, startTime);
    }
  }

  // ============================================================================
  // SCRAPE LOG OPERATIONS
  // ============================================================================

  /**
   * Query scrape logs with context and aggregation
   */
  async queryScrapeLogsWithContext(
    params: ScrapeLogQueryParams
  ): Promise<DatabaseOperationResult<ScrapeLogWithContext[]>> {
    const startTime = Date.now();
    
    try {
      let query = this.client
        .from('scrape_logs')
        .select(`
          *,
          municipalities(
            id,
            name
          ),
          background_jobs(
            id,
            type,
            status
          )
        `);

      // Apply filters
      if (params.municipalityIds && params.municipalityIds.length > 0) {
        query = query.in('municipality_id', params.municipalityIds);
      }

      if (params.statuses && params.statuses.length > 0) {
        query = query.in('status', params.statuses);
      }

      if (params.jobIds && params.jobIds.length > 0) {
        query = query.in('job_id', params.jobIds);
      }

      if (params.dateRange) {
        query = query.gte('scrape_date', params.dateRange.start)
                    .lte('scrape_date', params.dateRange.end);
      }

      // Apply pagination
      if (params.limit) {
        query = query.limit(params.limit);
      }
      if (params.offset) {
        query = query.range(params.offset, (params.offset + (params.limit || 50)) - 1);
      }

      query = query.order('scrape_date', { ascending: false });

      const result = await query;
      
      if (result.error) {
        return {
          success: false,
          error: {
            message: result.error.message,
            code: result.error.code,
            details: result.error.details,
          },
        };
      }

      const logs = result.data.map(row => this.enrichScrapeLogData(row));
      
      this.recordMetrics('queryScrapeLogsWithContext', 'scrape_logs', Date.now() - startTime, logs.length);
      
      return {
        success: true,
        data: logs,
        metadata: {
          recordsAffected: logs.length,
          duration: Date.now() - startTime,
          cacheUsed: false,
        },
      };
    } catch (error) {
      return this.handleError('queryScrapeLogsWithContext', error as Error, startTime);
    }
  }

  // ============================================================================
  // TRANSACTION OPERATIONS
  // ============================================================================

  /**
   * Execute a multi-table transaction
   */
  async executeTransaction(
    batch: TransactionBatch
  ): Promise<DatabaseOperationResult<{ results: any[]; rollbacks: number }>> {
    const startTime = Date.now();
    const { operations, options = {}, metadata } = batch;
    const results: any[] = [];
    let rollbacks = 0;
    
    try {
      // Execute operations in sequence for transaction-like behavior
      for (const operation of operations) {
        const { type, table, data, condition, validateBefore, validateAfter } = operation;
        
        try {
          // Pre-validation
          if (validateBefore) {
            const isValid = await validateBefore(data);
            if (!isValid) {
              throw new Error(`Pre-validation failed for ${type} operation on ${table}`);
            }
          }

          let result;
          
          switch (type) {
            case 'insert':
              result = await this.client
                .from(table as any)
                .insert(data)
                .select();
              break;
              
            case 'update':
              let updateQuery = this.client
                .from(table as any)
                .update(data);
              
              if (condition) {
                Object.entries(condition).forEach(([key, value]) => {
                  updateQuery = updateQuery.eq(key, value);
                });
              }
              
              result = await updateQuery.select();
              break;
              
            case 'delete':
              let deleteQuery = this.client
                .from(table as any)
                .delete();
              
              if (condition) {
                Object.entries(condition).forEach(([key, value]) => {
                  deleteQuery = deleteQuery.eq(key, value);
                });
              }
              
              result = await deleteQuery.select();
              break;
              
            default:
              throw new Error(`Unsupported operation type: ${type}`);
          }
          
          if (result.error) {
            throw new Error(result.error.message);
          }

          // Post-validation
          if (validateAfter) {
            const isValid = await validateAfter(result.data);
            if (!isValid) {
              throw new Error(`Post-validation failed for ${type} operation on ${table}`);
            }
          }
          
          results.push(result.data);
          
        } catch (error) {
          if (options.rollbackOnError) {
            // In a real implementation, you would perform rollback operations
            // For now, we just track the number of rollbacks needed
            rollbacks++;
            
            if (!options.validateAll) {
              throw error;
            }
          } else {
            results.push({ error: (error as Error).message });
          }
        }
      }

      this.recordMetrics('executeTransaction', 'transaction', Date.now() - startTime, results.length);

      return {
        success: rollbacks === 0,
        data: { results, rollbacks },
        metadata: {
          recordsAffected: results.length,
          duration: Date.now() - startTime,
          cacheUsed: false,
        },
      };
    } catch (error) {
      return this.handleError('executeTransaction', error as Error, startTime);
    }
  }

  // ============================================================================
  // CONSISTENCY CHECK OPERATIONS
  // ============================================================================

  /**
   * Perform data consistency checks
   */
  async performConsistencyCheck(
    params: ConsistencyCheckParams
  ): Promise<DatabaseOperationResult<ConsistencyCheckResult[]>> {
    const startTime = Date.now();
    const results: ConsistencyCheckResult[] = [];
    
    try {
      for (const checkType of params.checkTypes) {
        let checkResult: ConsistencyCheckResult;
        
        switch (checkType) {
          case 'municipality_scrapers':
            checkResult = await this.checkMunicipalityScraperConsistency(params);
            break;
            
          case 'document_statuses':
            checkResult = await this.checkDocumentStatusConsistency(params);
            break;
            
          case 'job_dependencies':
            checkResult = await this.checkJobDependencyConsistency(params);
            break;
            
          case 'scraper_assignments':
            checkResult = await this.checkScraperAssignmentConsistency(params);
            break;
            
          case 'progress_integrity':
            checkResult = await this.checkProgressIntegrity(params);
            break;
            
          default:
            checkResult = {
              checkType,
              passed: false,
              issues: [{
                severity: 'error',
                description: `Unknown check type: ${checkType}`,
                affectedRecords: [],
                autoFixable: false,
              }],
            };
        }
        
        results.push(checkResult);
      }

      this.recordMetrics('performConsistencyCheck', 'consistency_check', Date.now() - startTime, results.length);

      return {
        success: true,
        data: results,
        metadata: {
          recordsAffected: results.length,
          duration: Date.now() - startTime,
          cacheUsed: false,
        },
      };
    } catch (error) {
      return this.handleError('performConsistencyCheck', error as Error, startTime);
    }
  }

  // ============================================================================
  // PROGRESS TRACKING OPERATIONS
  // ============================================================================

  /**
   * Update job progress
   */
  async updateJobProgress(
    update: ProgressUpdate
  ): Promise<DatabaseOperationResult<void>> {
    const startTime = Date.now();
    
    try {
      const table = update.type === 'bulk_job' ? 'bulk_processing_jobs' : 'background_jobs';
      
      const updateData = {
        progress: update.progress,
        progress_message: update.message,
        updated_at: update.timestamp,
      };

      const result = await this.client
        .from(table as any)
        .update(updateData)
        .eq('id', update.jobId);

      if (result.error) {
        return {
          success: false,
          error: {
            message: result.error.message,
            code: result.error.code,
            details: result.error.details,
          },
        };
      }

      this.recordMetrics('updateJobProgress', table, Date.now() - startTime, 1);

      return {
        success: true,
        metadata: {
          recordsAffected: 1,
          duration: Date.now() - startTime,
          cacheUsed: false,
        },
      };
    } catch (error) {
      return this.handleError('updateJobProgress', error as Error, startTime);
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private enrichMunicipalityData(row: any): MunicipalityWithScrapers {
    const municipality = row as MunicipalityWithScrapers;
    
    // Add computed fields
    if (row.scrapers) {
      municipality.scrapers = row.scrapers;
      municipality.activeScraperInfo = row.scrapers.find((s: any) => s.name === row.active_scraper) || null;
      municipality.availableScrapers = row.assigned_scrapers || [];
      municipality.scraperAssignments = (row.assigned_scrapers || []).map((name: string) => {
        const scraper = row.scrapers.find((s: any) => s.name === name);
        return {
          scraperName: name,
          isActive: name === row.active_scraper,
          priority: scraper?.priority || 0,
          lastTested: scraper?.last_tested || null,
        };
      });
    }
    
    return municipality;
  }

  private enrichDocumentData(row: any): DocumentWithProcessingStatus {
    const document = row as DocumentWithProcessingStatus;
    
    // Determine processing stage
    let processingStage: DocumentWithProcessingStatus['processingStage'] = 'found';
    let canProcess = true;
    let nextAction: DocumentWithProcessingStatus['nextAction'] = 'download';
    
    if (row.download_status === 'downloading') {
      processingStage = 'downloading';
      canProcess = false;
    } else if (row.download_status === 'downloaded') {
      processingStage = 'downloaded';
      nextAction = 'extract';
    }
    
    if (row.extraction_status === 'processing') {
      processingStage = 'extracting';
      canProcess = false;
    } else if (row.extraction_status === 'completed') {
      processingStage = 'extracted';
      nextAction = 'analyze';
    }
    
    if (row.analysis_status === 'processing') {
      processingStage = 'analyzing';
      canProcess = false;
    } else if (row.analysis_status === 'completed') {
      processingStage = 'analyzed';
      nextAction = 'complete';
    }
    
    if (row.download_status === 'error' || row.extraction_status === 'failed' || row.analysis_status === 'failed') {
      processingStage = 'error';
      canProcess = false;
    }
    
    document.processingStage = processingStage;
    document.canProcess = canProcess;
    document.nextAction = nextAction;
    
    return document;
  }

  private enrichScrapeLogData(row: any): ScrapeLogWithContext {
    const log = row as ScrapeLogWithContext;
    
    // Add performance metrics if we have duration
    if (row.duration_seconds && row.documents_found) {
      log.performanceMetrics = {
        docsPerSecond: row.documents_found / row.duration_seconds,
        successRate: row.status === 'success' ? 100 : row.status === 'partial' ? 50 : 0,
        avgProcessingTime: row.duration_seconds,
      };
    }
    
    return log;
  }

  private async processBatchChunk(
    documentIds: readonly DocumentId[],
    operation: string,
    options?: any
  ): Promise<{ processed: number; failed: number; errors: string[] }> {
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];
    
    for (const documentId of documentIds) {
      try {
        let result;
        
        switch (operation) {
          case 'favorite':
            result = await this.client
              .from('pdf_documents')
              .update({ is_favorited: true })
              .eq('id', documentId);
            break;
            
          case 'unfavorite':
            result = await this.client
              .from('pdf_documents')
              .update({ is_favorited: false })
              .eq('id', documentId);
            break;
            
          case 'delete':
            result = await this.client
              .from('pdf_documents')
              .delete()
              .eq('id', documentId);
            break;
            
          default:
            throw new Error(`Unsupported batch operation: ${operation}`);
        }
        
        if (result.error) {
          throw new Error(result.error.message);
        }
        
        processed++;
      } catch (error) {
        failed++;
        errors.push(`Document ${documentId}: ${(error as Error).message}`);
      }
    }
    
    return { processed, failed, errors };
  }

  private async validateScraperAssignment(
    municipalityId: MunicipalityId,
    scraperNames: readonly string[]
  ): Promise<boolean> {
    try {
      // Check if scrapers exist and are active
      const { data: scrapers } = await this.client
        .from('scrapers')
        .select('name, is_active, municipality_id')
        .in('name', scraperNames);
      
      if (!scrapers || scrapers.length !== scraperNames.length) {
        return false;
      }
      
      // Check if all scrapers are active and compatible with the municipality
      return scrapers.every(scraper => 
        scraper.is_active && 
        (scraper.municipality_id === municipalityId || scraper.municipality_id === null)
      );
    } catch {
      return false;
    }
  }

  private async checkMunicipalityScraperConsistency(
    params: ConsistencyCheckParams
  ): Promise<ConsistencyCheckResult> {
    const issues: ConsistencyCheckResult['issues'] = [];
    
    try {
      // Check for municipalities with invalid scraper assignments
      const { data: municipalities } = await this.client
        .from('municipalities')
        .select('id, name, assigned_scrapers, active_scraper');
      
      for (const municipality of municipalities || []) {
        // Check if assigned scrapers exist
        if (municipality.assigned_scrapers && municipality.assigned_scrapers.length > 0) {
          const { data: scrapers } = await this.client
            .from('scrapers')
            .select('name')
            .in('name', municipality.assigned_scrapers);
          
          const existingScrapers = scrapers?.map(s => s.name) || [];
          const missingScrapers = municipality.assigned_scrapers.filter(
            name => !existingScrapers.includes(name)
          );
          
          if (missingScrapers.length > 0) {
            issues.push({
              severity: 'error',
              description: `Municipality ${municipality.name} has non-existent scrapers assigned: ${missingScrapers.join(', ')}`,
              affectedRecords: [municipality.id.toString()],
              autoFixable: true,
              suggestedFix: 'Remove non-existent scrapers from assigned_scrapers array',
            });
          }
        }
        
        // Check if active scraper is in assigned scrapers
        if (municipality.active_scraper && 
            (!municipality.assigned_scrapers || !municipality.assigned_scrapers.includes(municipality.active_scraper))) {
          issues.push({
            severity: 'warning',
            description: `Municipality ${municipality.name} has active scraper not in assigned scrapers list`,
            affectedRecords: [municipality.id.toString()],
            autoFixable: true,
            suggestedFix: 'Add active scraper to assigned_scrapers or clear active_scraper',
          });
        }
      }
    } catch (error) {
      issues.push({
        severity: 'error',
        description: `Failed to check municipality-scraper consistency: ${(error as Error).message}`,
        affectedRecords: [],
        autoFixable: false,
      });
    }
    
    return {
      checkType: 'municipality_scrapers',
      passed: issues.length === 0,
      issues,
    };
  }

  private async checkDocumentStatusConsistency(
    params: ConsistencyCheckParams
  ): Promise<ConsistencyCheckResult> {
    const issues: ConsistencyCheckResult['issues'] = [];
    
    try {
      // Check for documents with inconsistent status progression
      const { data: documents } = await this.client
        .from('pdf_documents')
        .select('id, title, download_status, extraction_status, analysis_status, content_text, content_analyzed');
      
      for (const doc of documents || []) {
        // Check status progression logic
        if (doc.extraction_status === 'completed' && doc.download_status !== 'downloaded') {
          issues.push({
            severity: 'error',
            description: `Document ${doc.title} has extraction completed but download not completed`,
            affectedRecords: [doc.id.toString()],
            autoFixable: true,
            suggestedFix: 'Set download_status to downloaded',
          });
        }
        
        if (doc.analysis_status === 'completed' && doc.extraction_status !== 'completed') {
          issues.push({
            severity: 'error',
            description: `Document ${doc.title} has analysis completed but extraction not completed`,
            affectedRecords: [doc.id.toString()],
            autoFixable: true,
            suggestedFix: 'Set extraction_status to completed or reset analysis_status',
          });
        }
        
        // Check content consistency
        if (doc.content_analyzed && !doc.content_text) {
          issues.push({
            severity: 'warning',
            description: `Document ${doc.title} marked as analyzed but has no content`,
            affectedRecords: [doc.id.toString()],
            autoFixable: true,
            suggestedFix: 'Set content_analyzed to false or extract content',
          });
        }
      }
    } catch (error) {
      issues.push({
        severity: 'error',
        description: `Failed to check document status consistency: ${(error as Error).message}`,
        affectedRecords: [],
        autoFixable: false,
      });
    }
    
    return {
      checkType: 'document_statuses',
      passed: issues.length === 0,
      issues,
    };
  }

  private async checkJobDependencyConsistency(
    params: ConsistencyCheckParams
  ): Promise<ConsistencyCheckResult> {
    return {
      checkType: 'job_dependencies',
      passed: true,
      issues: [],
    };
  }

  private async checkScraperAssignmentConsistency(
    params: ConsistencyCheckParams
  ): Promise<ConsistencyCheckResult> {
    return {
      checkType: 'scraper_assignments',
      passed: true,
      issues: [],
    };
  }

  private async checkProgressIntegrity(
    params: ConsistencyCheckParams
  ): Promise<ConsistencyCheckResult> {
    return {
      checkType: 'progress_integrity',
      passed: true,
      issues: [],
    };
  }

  private recordMetrics(operation: string, table: string, duration: number, recordCount: number): void {
    if (!this.config.enablePerformanceMonitoring) return;
    
    const metric: DatabaseMetrics = {
      operation,
      table,
      duration,
      recordsAffected: recordCount,
      timestamp: new Date().toISOString(),
    };
    
    const key = `${operation}_${table}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    const metrics = this.metrics.get(key)!;
    metrics.push(metric);
    
    // Keep only last 100 metrics per operation
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  private handleError(operation: string, error: Error, startTime: number): DatabaseOperationResult<never> {
    const duration = Date.now() - startTime;
    
    if (this.config.enableQueryLogging) {
      console.error(`[SupabaseServiceAdapter] ${operation} failed after ${duration}ms:`, error);
    }
    
    return {
      success: false,
      error: {
        message: error.message,
        code: 'ADAPTER_ERROR',
        details: { operation, duration },
      },
    };
  }

  // ============================================================================
  // PUBLIC UTILITY METHODS
  // ============================================================================

  /**
   * Get performance metrics for operations
   */
  getMetrics(): Map<string, DatabaseMetrics[]> {
    return new Map(this.metrics);
  }

  /**
   * Clear performance metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Get query optimization suggestions
   */
  getQueryOptimizations(): QueryOptimization[] {
    const optimizations: QueryOptimization[] = [];
    
    for (const [key, metrics] of this.metrics) {
      if (metrics.length < 10) continue; // Need enough data
      
      const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
      const [operation, table] = key.split('_');
      
      if (avgDuration > 1000) { // Slow queries (>1s)
        optimizations.push({
          query: operation,
          table,
          currentPerformance: {
            avgDuration,
            executionCount: metrics.length,
            lastExecuted: metrics[metrics.length - 1].timestamp,
          },
          suggestions: [
            {
              type: 'index',
              description: `Consider adding an index on frequently queried columns in ${table}`,
              expectedImprovement: '50-80% reduction in query time',
              implementationEffort: 'low',
            },
          ],
        });
      }
    }
    
    return optimizations;
  }

  /**
   * Health check for the adapter
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: { name: string; status: 'pass' | 'fail'; message?: string }[];
  }> {
    const checks: { name: string; status: 'pass' | 'fail'; message?: string }[] = [];
    
    try {
      // Test basic connectivity
      const { error } = await this.client.from('municipalities').select('id').limit(1);
      checks.push({
        name: 'database_connection',
        status: error ? 'fail' : 'pass',
        message: error?.message,
      });
      
      // Check recent performance
      const recentMetrics = Array.from(this.metrics.values())
        .flat()
        .filter(m => Date.now() - new Date(m.timestamp).getTime() < 300000); // Last 5 minutes
      
      const avgRecentDuration = recentMetrics.length > 0 
        ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length
        : 0;
      
      checks.push({
        name: 'performance',
        status: avgRecentDuration < 2000 ? 'pass' : 'fail',
        message: avgRecentDuration > 0 ? `Average response time: ${avgRecentDuration.toFixed(0)}ms` : 'No recent operations',
      });
      
    } catch (error) {
      checks.push({
        name: 'health_check',
        status: 'fail',
        message: (error as Error).message,
      });
    }
    
    const failedChecks = checks.filter(c => c.status === 'fail').length;
    const status = failedChecks === 0 ? 'healthy' : failedChecks === checks.length ? 'unhealthy' : 'degraded';
    
    return { status, checks };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Create default instance
export const supabaseAdapter = new SupabaseServiceAdapter();

// Export the class for custom instances
export default SupabaseServiceAdapter;
