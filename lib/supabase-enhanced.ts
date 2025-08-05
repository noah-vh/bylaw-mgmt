/**
 * Type-safe Supabase Client Configuration with Enhanced Features
 * 
 * This file provides type-safe Supabase client instances with enhanced
 * TypeScript integration, query builders, and utility functions.
 */

import { createClient, SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import type { 
  Database,
  MunicipalityId,
  DocumentId,
  JobId,
  KeywordId,
  Municipality,
  PdfDocument,
  BackgroundJob,
  ApiResponse,
  SuccessResponse,
  ErrorResponse,
} from '../types/database';
import type { Result } from '../types/utils';
import { supabase } from './supabase';

// Re-export the basic client
export { supabase };

// ============================================================================
// TYPE-SAFE QUERY BUILDERS
// ============================================================================

/** Type-safe municipalities query builder */
export const municipalitiesQuery = (client: SupabaseClient<Database> = supabase) => ({
  /** Get all municipalities with optional filtering */
  findMany: (params?: {
    limit?: number;
    offset?: number;
    status?: Database['public']['Tables']['municipalities']['Row']['status'];
    search?: string;
  }) => {
    let query = client
      .from('municipalities')
      .select('*');
    
    if (params?.status) {
      query = query.eq('status', params.status);
    }
    
    if (params?.search) {
      query = query.ilike('name', `%${params.search}%`);
    }
    
    if (params?.limit) {
      query = query.limit(params.limit);
    }
    
    if (params?.offset) {
      query = query.range(params.offset, (params.offset + (params.limit || 50)) - 1);
    }
    
    return query.order('name');
  },

  /** Get municipality by ID */
  findById: (id: MunicipalityId) => {
    return client
      .from('municipalities')
      .select('*')
      .eq('id', id)
      .single();
  },

  /** Create new municipality */
  create: (data: Database['public']['Tables']['municipalities']['Insert']) => {
    return client
      .from('municipalities')
      .insert(data)
      .select()
      .single();
  },

  /** Update municipality */
  update: (id: MunicipalityId, data: Database['public']['Tables']['municipalities']['Update']) => {
    return client
      .from('municipalities')
      .update(data)
      .eq('id', id)
      .select()
      .single();
  },

  /** Delete municipality */
  delete: (id: MunicipalityId) => {
    return client
      .from('municipalities')
      .delete()
      .eq('id', id)
      .select()
      .single();
  },

  /** Get municipalities with document counts */
  withDocumentCounts: () => {
    return client
      .from('municipalities')
      .select(`
        *,
        pdf_documents(count)
      `);
  },

  /** Get municipalities with latest scrape logs */
  withLatestScrapes: () => {
    return client
      .from('municipalities')
      .select(`
        *,
        scrape_logs(
          id,
          scrape_date,
          status,
          documents_found,
          documents_new
        )
      `)
      .order('scrape_date', { ascending: false, foreignTable: 'scrape_logs' })
      .limit(1, { foreignTable: 'scrape_logs' });
  },
});

/** Type-safe documents query builder */
export const documentsQuery = (client: SupabaseClient<Database> = supabase) => ({
  /** Get all documents with optional filtering */
  findMany: (params?: {
    limit?: number;
    offset?: number;
    municipalityId?: MunicipalityId;
    isAduRelevant?: boolean;
    isFavorited?: boolean;
    search?: string;
  }) => {
    let query = client
      .from('pdf_documents')
      .select(`
        *,
        municipalities(id, name)
      `);
    
    if (params?.municipalityId) {
      query = query.eq('municipality_id', params.municipalityId);
    }
    
    if (params?.isAduRelevant !== undefined) {
      query = query.eq('is_adu_relevant', params.isAduRelevant);
    }
    
    if (params?.isFavorited !== undefined) {
      query = query.eq('is_favorited', params.isFavorited);
    }
    
    if (params?.search) {
      query = query.or(`title.ilike.%${params.search}%,filename.ilike.%${params.search}%`);
    }
    
    if (params?.limit) {
      query = query.limit(params.limit);
    }
    
    if (params?.offset) {
      query = query.range(params.offset, (params.offset + (params.limit || 50)) - 1);
    }
    
    return query.order('date_found', { ascending: false });
  },

  /** Get document by ID */
  findById: (id: DocumentId) => {
    return client
      .from('pdf_documents')
      .select(`
        *,
        municipalities(id, name, website_url)
      `)
      .eq('id', id)
      .single();
  },

  /** Create new document */
  create: (data: Database['public']['Tables']['pdf_documents']['Insert']) => {
    return client
      .from('pdf_documents')
      .insert(data)
      .select()
      .single();
  },

  /** Update document */
  update: (id: DocumentId, data: Database['public']['Tables']['pdf_documents']['Update']) => {
    return client
      .from('pdf_documents')
      .update(data)
      .eq('id', id)
      .select()
      .single();
  },

  /** Delete document */
  delete: (id: DocumentId) => {
    return client
      .from('pdf_documents')
      .delete()
      .eq('id', id)
      .select()
      .single();
  },

  /** Get documents by municipality */
  findByMunicipality: (municipalityId: MunicipalityId, limit = 50) => {
    return client
      .from('pdf_documents')
      .select('*')
      .eq('municipality_id', municipalityId)
      .order('date_found', { ascending: false })
      .limit(limit);
  },

  /** Get favorite documents */
  findFavorites: (limit = 50) => {
    return client
      .from('pdf_documents')
      .select(`
        *,
        municipalities(id, name)
      `)
      .eq('is_favorited', true)
      .order('date_found', { ascending: false })
      .limit(limit);
  },
});

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/** Convert Supabase error to API response */
export const handleSupabaseError = (error: PostgrestError | null): ErrorResponse | null => {
  if (!error) return null;
  
  return {
    error: error.message || 'Database operation failed',
    message: error.hint || error.details || 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    code: error.code || 'SUPABASE_ERROR',
    details: {
      code: error.code,
      details: error.details,
      hint: error.hint,
    },
  };
};

/** Handle Supabase query result */
export const handleQueryResult = <T>(
  result: { data: T | null; error: PostgrestError | null }
): Result<T, ErrorResponse> => {
  if (result.error) {
    const errorResponse = handleSupabaseError(result.error);
    return {
      success: false,
      error: errorResponse!,
    };
  }
  
  if (result.data === null) {
    return {
      success: false,
      error: {
        error: 'Not found',
        message: 'The requested resource was not found',
        timestamp: new Date().toISOString(),
        code: 'NOT_FOUND',
      },
    };
  }
  
  return {
    success: true,
    data: result.data,
  };
};

/** Handle Supabase array query result */
export const handleArrayQueryResult = <T>(
  result: { data: T[] | null; error: PostgrestError | null }
): Result<T[], ErrorResponse> => {
  if (result.error) {
    const errorResponse = handleSupabaseError(result.error);
    return {
      success: false,
      error: errorResponse!,
    };
  }
  
  return {
    success: true,
    data: result.data || [],
  };
};

// ============================================================================
// ANALYTICS QUERIES
// ============================================================================

/** Get dashboard statistics */
export const getDashboardStats = async (client: SupabaseClient<Database> = supabase) => {
  const [
    municipalitiesResult,
    documentsResult,
    relevantDocsResult,
    activeJobsResult,
  ] = await Promise.all([
    client.from('municipalities').select('*', { count: 'exact', head: true }),
    client.from('pdf_documents').select('*', { count: 'exact', head: true }),
    client.from('pdf_documents').select('*', { count: 'exact', head: true }).eq('is_adu_relevant', true),
    client.from('background_jobs').select('*', { count: 'exact', head: true }).in('status', ['pending', 'running']),
  ]);
  
  return {
    totalMunicipalities: municipalitiesResult.count || 0,
    totalDocuments: documentsResult.count || 0,
    relevantDocuments: relevantDocsResult.count || 0,
    activeJobs: activeJobsResult.count || 0,
  };
};

/** Get municipality statistics */
export const getMunicipalityStats = async (
  municipalityId: MunicipalityId,
  client: SupabaseClient<Database> = supabase
) => {
  const [
    documentsResult,
    relevantDocsResult,
    analyzedDocsResult,
    scrapesResult,
  ] = await Promise.all([
    client.from('pdf_documents').select('*', { count: 'exact', head: true }).eq('municipality_id', municipalityId),
    client.from('pdf_documents').select('*', { count: 'exact', head: true }).eq('municipality_id', municipalityId).eq('is_adu_relevant', true),
    client.from('pdf_documents').select('*', { count: 'exact', head: true }).eq('municipality_id', municipalityId).eq('content_analyzed', true),
    client.from('scrape_logs').select('*').eq('municipality_id', municipalityId).order('scrape_date', { ascending: false }).limit(10),
  ]);
  
  const successfulScrapes = scrapesResult.data?.filter(log => log.status === 'success').length || 0;
  const totalScrapes = scrapesResult.data?.length || 0;
  
  return {
    totalDocuments: documentsResult.count || 0,
    relevantDocuments: relevantDocsResult.count || 0,
    analyzedDocuments: analyzedDocsResult.count || 0,
    totalScrapes,
    successfulScrapes,
    successRate: totalScrapes > 0 ? Math.round((successfulScrapes / totalScrapes) * 100) : 0,
    recentScrapes: scrapesResult.data || [],
  };
};

export type SupabaseQueryResult<T> = Result<T, ErrorResponse>;
export type SupabaseArrayQueryResult<T> = Result<T[], ErrorResponse>;

// ============================================================================
// ENHANCED SERVICE ARCHITECTURE QUERIES
// ============================================================================

/** Enhanced municipalities query with scraper assignment support */
export const municipalitiesServiceQuery = (client: SupabaseClient<Database> = supabase) => ({
  /** Find municipalities by assigned scraper names */
  findByAssignedScrapers: (scraperNames: string[], options?: { includeInactive?: boolean }) => {
    let query = client
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
          documents_new,
          error_message
        )
      `)
      .overlaps('assigned_scrapers', scraperNames);

    if (!options?.includeInactive) {
      query = query.neq('status', 'inactive');
    }

    return query
      .order('name')
      .order('scrape_date', { ascending: false, foreignTable: 'scrape_logs' })
      .limit(5, { foreignTable: 'scrape_logs' });
  },

  /** Get municipalities with active scraper details */
  withActiveScrapers: () => {
    return client
      .from('municipalities')
      .select(`
        *,
        scrapers!inner(
          id,
          name,
          status,
          success_rate,
          last_tested,
          is_active
        )
      `)
      .eq('scrapers.is_active', true)
      .not('active_scraper', 'is', null);
  },

  /** Update scraper assignments with validation */
  updateScraperAssignments: async (
    municipalityId: MunicipalityId, 
    scraperNames: string[], 
    activeScraperId?: string
  ) => {
    // First validate that scrapers exist and are active
    const { data: scrapers, error: scrapersError } = await client
      .from('scrapers')
      .select('name, is_active, municipality_id')
      .in('name', scraperNames);

    if (scrapersError) {
      return { data: null, error: scrapersError };
    }

    // Validate scrapers
    const invalidScrapers = scrapers?.filter(s => 
      !s.is_active || (s.municipality_id && s.municipality_id !== municipalityId)
    );

    if (invalidScrapers && invalidScrapers.length > 0) {
      return {
        data: null,
        error: {
          message: `Invalid scrapers: ${invalidScrapers.map(s => s.name).join(', ')}`,
          code: 'INVALID_SCRAPER_ASSIGNMENT',
        } as PostgrestError
      };
    }

    // Update municipality
    return client
      .from('municipalities')
      .update({
        assigned_scrapers: scraperNames.length > 0 ? scraperNames : null,
        active_scraper: activeScraperId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', municipalityId)
      .select()
      .single();
  },
});

/** Enhanced documents query with processing status support */
export const documentsServiceQuery = (client: SupabaseClient<Database> = supabase) => ({
  /** Find documents ready for processing */
  findReadyForProcessing: (
    operation: 'download' | 'extract' | 'analyze',
    limit = 50
  ) => {
    let query = client
      .from('pdf_documents')
      .select(`
        *,
        municipalities(id, name, website_url)
      `);

    switch (operation) {
      case 'download':
        query = query.eq('download_status', 'pending');
        break;
      case 'extract':
        query = query
          .eq('download_status', 'downloaded')
          .in('extraction_status', ['pending', null]);
        break;
      case 'analyze':
        query = query
          .eq('extraction_status', 'completed')
          .in('analysis_status', ['pending', null])
          .not('content_text', 'is', null);
        break;
    }

    return query
      .order('date_found', { ascending: false })
      .limit(limit);
  },

  /** Batch update document statuses */
  batchUpdateStatus: async (
    documentIds: DocumentId[],
    updates: Partial<PdfDocumentUpdate>
  ) => {
    const results = [];
    const errors = [];

    // Process in chunks of 10 to avoid query limits
    for (let i = 0; i < documentIds.length; i += 10) {
      const chunk = documentIds.slice(i, i + 10);
      
      const { data, error } = await client
        .from('pdf_documents')
        .update(updates)
        .in('id', chunk)
        .select();

      if (error) {
        errors.push(error);
      } else if (data) {
        results.push(...data);
      }
    }

    return {
      data: results,
      errors,
      success: errors.length === 0,
    };
  },

  /** Get processing queue statistics */
  getProcessingQueueStats: async () => {
    const [
      pendingDownloads,
      pendingExtractions,
      pendingAnalyses,
      processingJobs,
    ] = await Promise.all([
      client.from('pdf_documents').select('*', { count: 'exact', head: true }).eq('download_status', 'pending'),
      client.from('pdf_documents').select('*', { count: 'exact', head: true })
        .eq('download_status', 'downloaded')
        .in('extraction_status', ['pending', null]),
      client.from('pdf_documents').select('*', { count: 'exact', head: true })
        .eq('extraction_status', 'completed')
        .in('analysis_status', ['pending', null]),
      client.from('background_jobs').select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'running'])
        .in('type', ['download', 'extraction', 'analysis']),
    ]);

    return {
      pendingDownloads: pendingDownloads.count || 0,
      pendingExtractions: pendingExtractions.count || 0,
      pendingAnalyses: pendingAnalyses.count || 0,
      processingJobs: processingJobs.count || 0,
    };
  },
});

/** Enhanced background jobs query with progress tracking */
export const backgroundJobsServiceQuery = (client: SupabaseClient<Database> = supabase) => ({
  /** Get jobs with detailed progress */
  findWithProgress: (params?: {
    statuses?: JobStatus[];
    types?: string[];
    municipalityIds?: MunicipalityId[];
    limit?: number;
  }) => {
    let query = client
      .from('background_jobs')
      .select(`
        *,
        municipalities(id, name),
        pdf_documents(id, title)
      `);

    if (params?.statuses && params.statuses.length > 0) {
      query = query.in('status', params.statuses);
    }

    if (params?.types && params.types.length > 0) {
      query = query.in('type', params.types);
    }

    if (params?.municipalityIds && params.municipalityIds.length > 0) {
      query = query.in('municipality_id', params.municipalityIds);
    }

    return query
      .order('created_at', { ascending: false })
      .limit(params?.limit || 50);
  },

  /** Update job progress */
  updateProgress: (
    jobId: JobId,
    progress: number,
    message?: string,
    status?: JobStatus
  ) => {
    const updates: BackgroundJobUpdate = {
      progress,
      progress_message: message,
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updates.status = status;
      if (status === 'running' && !updates.started_at) {
        updates.started_at = new Date().toISOString();
      } else if (['completed', 'failed', 'cancelled'].includes(status)) {
        updates.completed_at = new Date().toISOString();
      }
    }

    return client
      .from('background_jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single();
  },

  /** Get job queue by priority */
  getQueueByPriority: () => {
    return client
      .from('background_jobs')
      .select(`
        *,
        municipalities(id, name),
        pdf_documents(id, title)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
  },
});

/** Enhanced bulk processing jobs query */
export const bulkJobsServiceQuery = (client: SupabaseClient<Database> = supabase) => ({
  /** Find bulk jobs with municipality details */
  findWithMunicipalityDetails: (params?: {
    statuses?: JobStatus[];
    operations?: BulkProcessingOperation[];
    limit?: number;
  }) => {
    let query = client
      .from('bulk_processing_jobs')
      .select('*');

    if (params?.statuses && params.statuses.length > 0) {
      query = query.in('status', params.statuses);
    }

    if (params?.operations && params.operations.length > 0) {
      query = query.in('operation', params.operations);
    }

    return query
      .order('created_at', { ascending: false })
      .limit(params?.limit || 20);
  },

  /** Update bulk job progress */
  updateBulkProgress: (
    jobId: BulkJobId,
    completedOperations: number,
    failedOperations: number,
    status?: JobStatus,
    errorMessage?: string
  ) => {
    const updates: BulkProcessingJobUpdate = {
      completed_operations: completedOperations,
      failed_operations: failedOperations,
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updates.status = status;
      if (status === 'running' && !updates.started_at) {
        updates.started_at = new Date().toISOString();
      } else if (['completed', 'failed', 'cancelled'].includes(status)) {
        updates.completed_at = new Date().toISOString();
      }
    }

    if (errorMessage) {
      updates.error_message = errorMessage;
    }

    return client
      .from('bulk_processing_jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single();
  },
});

/** Enhanced scrapers query with municipality assignments */
export const scrapersServiceQuery = (client: SupabaseClient<Database> = supabase) => ({
  /** Find scrapers by municipality assignments */
  findByMunicipalityAssignments: (municipalityIds: MunicipalityId[]) => {
    return client
      .from('scrapers')
      .select(`
        *,
        municipalities(id, name, website_url)
      `)
      .in('municipality_id', municipalityIds);
  },

  /** Get scraper performance metrics */
  getPerformanceMetrics: async (scraperId: ScraperId, days = 30) => {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data: logs, error } = await client
      .from('scrape_logs')
      .select(`
        scrape_date,
        status,
        documents_found,
        documents_new,
        duration_seconds,
        municipalities(name)
      `)
      .eq('municipality_id', scraperId) // Note: This needs to be adjusted based on actual relationship
      .gte('scrape_date', since.toISOString());

    if (error) return { data: null, error };

    const totalRuns = logs?.length || 0;
    const successfulRuns = logs?.filter(log => log.status === 'success').length || 0;
    const totalDocuments = logs?.reduce((sum, log) => sum + (log.documents_found || 0), 0) || 0;
    const avgDuration = logs?.reduce((sum, log) => sum + (log.duration_seconds || 0), 0) / totalRuns || 0;

    return {
      data: {
        totalRuns,
        successfulRuns,
        successRate: totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0,
        totalDocuments,
        avgDuration,
        avgDocumentsPerRun: totalRuns > 0 ? Math.round(totalDocuments / totalRuns) : 0,
      },
      error: null,
    };
  },

  /** Update scraper validation status */
  updateValidationStatus: (
    scraperId: ScraperId,
    status: ScraperValidationStatus,
    testNotes?: string,
    successRate?: number
  ) => {
    const updates: ScraperUpdate = {
      status,
      last_tested: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (testNotes) updates.test_notes = testNotes;
    if (successRate !== undefined) updates.success_rate = successRate;

    return client
      .from('scrapers')
      .update(updates)
      .eq('id', scraperId)
      .select()
      .single();
  },
});

/** Scrape logs query with enhanced analytics */
export const scrapeLogsServiceQuery = (client: SupabaseClient<Database> = supabase) => ({
  /** Get logs with municipality and scraper context */
  findWithContext: (params?: {
    municipalityIds?: MunicipalityId[];
    statuses?: ScrapeStatus[];
    since?: string;
    limit?: number;
  }) => {
    let query = client
      .from('scrape_logs')
      .select(`
        *,
        municipalities(id, name, website_url),
        background_jobs(id, type, status)
      `);

    if (params?.municipalityIds && params.municipalityIds.length > 0) {
      query = query.in('municipality_id', params.municipalityIds);
    }

    if (params?.statuses && params.statuses.length > 0) {
      query = query.in('status', params.statuses);
    }

    if (params?.since) {
      query = query.gte('scrape_date', params.since);
    }

    return query
      .order('scrape_date', { ascending: false })
      .limit(params?.limit || 50);
  },

  /** Get aggregated statistics */
  getAggregatedStats: async (params?: {
    municipalityIds?: MunicipalityId[];
    since?: string;
    groupBy?: 'municipality' | 'status' | 'date';
  }) => {
    let query = client
      .from('scrape_logs')
      .select(`
        municipality_id,
        status,
        scrape_date,
        documents_found,
        documents_new,
        duration_seconds,
        municipalities(name)
      `);

    if (params?.municipalityIds && params.municipalityIds.length > 0) {
      query = query.in('municipality_id', params.municipalityIds);
    }

    if (params?.since) {
      query = query.gte('scrape_date', params.since);
    }

    const { data: logs, error } = await query;

    if (error) return { data: null, error };

    // Group and aggregate based on groupBy parameter
    const grouped = new Map();
    
    logs?.forEach(log => {
      let key: string;
      switch (params?.groupBy) {
        case 'municipality':
          key = `${log.municipality_id}_${log.municipalities?.name}`;
          break;
        case 'status':
          key = log.status;
          break;
        case 'date':
          key = log.scrape_date.split('T')[0]; // Date only
          break;
        default:
          key = 'total';
      }

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          totalRuns: 0,
          successfulRuns: 0,
          totalDocuments: 0,
          newDocuments: 0,
          totalDuration: 0,
          averageDuration: 0,
          successRate: 0,
        });
      }

      const group = grouped.get(key);
      group.totalRuns++;
      if (log.status === 'success') group.successfulRuns++;
      group.totalDocuments += log.documents_found || 0;
      group.newDocuments += log.documents_new || 0;
      group.totalDuration += log.duration_seconds || 0;
    });

    // Calculate derived metrics
    grouped.forEach(group => {
      group.averageDuration = group.totalRuns > 0 ? group.totalDuration / group.totalRuns : 0;
      group.successRate = group.totalRuns > 0 ? Math.round((group.successfulRuns / group.totalRuns) * 100) : 0;
    });

    return {
      data: Array.from(grouped.values()),
      error: null,
    };
  },
});