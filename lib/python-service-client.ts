/**
 * Node.js service client for communicating with the Python service
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  ServiceClientOptions,
  ServiceRequest,
  ServiceResponse,
  ProgressMessage,
  HealthCheckResponse,
  ServiceError,
  ServiceHealthStatus,
  RequestOptions,
  ProgressReport,
  ServiceOperation,
  ServiceOperationMap,
  isServiceResponse,
  isProgressMessage,
  isHealthCheckResponse,
  ScraperTestParams,
  ScraperTestResult,
  ScrapingPhaseParams,
  ScrapingPhaseResult,
  ExtractionPhaseParams,
  ExtractionPhaseResult,
  AnalysisPhaseParams,
  AnalysisPhaseResult,
  CompletePipelineParams,
  CompletePipelineResult,
  Municipality,
  MunicipalityCreateParams,
  MunicipalityUpdateParams,
  Scraper,
  Document,
  DocumentType,
  DocumentStatus
} from './service-types';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  onProgress?: (progress: ProgressReport) => void;
}

export class PythonServiceClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private readonly options: Required<ServiceClientOptions>;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private healthStatus: ServiceHealthStatus = {
    status: 'unknown',
    lastCheck: new Date()
  };
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private restartAttempts = 0;
  private readonly maxRestartAttempts = 3;
  private readonly restartDelay = 5000;

  constructor(options: ServiceClientOptions) {
    super();
    
    this.options = {
      pythonExecutable: options.pythonExecutable ?? 'python3',
      servicePath: options.servicePath,
      timeout: options.timeout ?? 30000,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      healthCheckInterval: options.healthCheckInterval ?? 30000,
      logLevel: options.logLevel ?? 'info',
      onProgress: options.onProgress ?? (() => {}),
      onError: options.onError ?? (() => {})
    };

    this.setupErrorHandlers();
  }

  /**
   * Start the Python service process
   */
  async start(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.log('warn', 'Service already running');
      return;
    }

    this.log('info', 'Starting Python service...');
    
    try {
      this.process = spawn(this.options.pythonExecutable, [this.options.servicePath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      this.setupProcessHandlers();
      await this.waitForServiceReady();
      this.startHealthChecks();
      this.restartAttempts = 0;
      
      this.log('info', 'Python service started successfully');
      this.emit('started');
    } catch (error) {
      this.log('error', 'Failed to start Python service', { error });
      throw new Error(`Failed to start Python service: ${error}`);
    }
  }

  /**
   * Stop the Python service process
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;
    this.stopHealthChecks();

    if (this.process && !this.process.killed) {
      this.log('info', 'Stopping Python service...');
      
      // Reject all pending requests
      for (const [requestId, request] of this.pendingRequests) {
        clearTimeout(request.timeout);
        request.reject(new Error('Service is shutting down'));
      }
      this.pendingRequests.clear();

      // Gracefully terminate the process
      this.process.kill('SIGTERM');
      
      // Force kill if it doesn't terminate within 5 seconds
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);

      this.process = null;
      this.healthStatus = { status: 'unknown', lastCheck: new Date() };
      
      this.log('info', 'Python service stopped');
      this.emit('stopped');
    }
  }

  /**
   * Restart the Python service process
   */
  async restart(): Promise<void> {
    this.log('info', 'Restarting Python service...');
    await this.stop();
    await this.start();
  }

  /**
   * Get the current health status of the service
   */
  getHealthStatus(): ServiceHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Test a scraper against a municipality
   */
  async testScraper(
    scraperName: string,
    municipalityId: string,
    options: Omit<ScraperTestParams, 'scraper_name' | 'municipality_id'> & RequestOptions = {}
  ): Promise<ScraperTestResult> {
    const params: ScraperTestParams = {
      scraper_name: scraperName,
      municipality_id: municipalityId,
      ...options
    };

    return this.sendRequest('test_scraper', params, options);
  }

  /**
   * Run the scraping phase for multiple municipalities
   */
  async runScrapingPhase(
    municipalities: string[],
    options: Omit<ScrapingPhaseParams, 'municipalities'> & RequestOptions = {}
  ): Promise<ScrapingPhaseResult> {
    const params: ScrapingPhaseParams = {
      municipalities,
      ...options
    };

    return this.sendRequest('run_scraping_phase', params, options);
  }

  /**
   * Run the extraction phase for documents
   */
  async runExtractionPhase(
    documentIds?: string[],
    options: Omit<ExtractionPhaseParams, 'document_ids'> & RequestOptions = {}
  ): Promise<ExtractionPhaseResult> {
    const params: ExtractionPhaseParams = {
      document_ids: documentIds,
      ...options
    };

    return this.sendRequest('run_extraction_phase', params, options);
  }

  /**
   * Run the analysis phase for municipalities
   */
  async runAnalysisPhase(
    municipalityIds: string[],
    options: Omit<AnalysisPhaseParams, 'municipality_ids'> & RequestOptions = {}
  ): Promise<AnalysisPhaseResult> {
    const params: AnalysisPhaseParams = {
      municipality_ids: municipalityIds,
      ...options
    };

    return this.sendRequest('run_analysis_phase', params, options);
  }

  /**
   * Run the complete pipeline for municipalities
   */
  async runCompletePipeline(
    municipalities: string[],
    options: Omit<CompletePipelineParams, 'municipalities'> & RequestOptions = {}
  ): Promise<CompletePipelineResult> {
    const params: CompletePipelineParams = {
      municipalities,
      ...options
    };

    return this.sendRequest('run_complete_pipeline', params, options);
  }

  /**
   * Get all municipalities
   */
  async getMunicipalities(): Promise<Municipality[]> {
    return this.sendRequest('get_municipalities', {});
  }

  /**
   * Create a new municipality
   */
  async createMunicipality(params: MunicipalityCreateParams): Promise<Municipality> {
    return this.sendRequest('create_municipality', params);
  }

  /**
   * Update an existing municipality
   */
  async updateMunicipality(
    id: string,
    params: MunicipalityUpdateParams
  ): Promise<Municipality> {
    return this.sendRequest('update_municipality', { id, ...params });
  }

  /**
   * Delete a municipality
   */
  async deleteMunicipality(id: string): Promise<{ success: boolean }> {
    return this.sendRequest('delete_municipality', { id });
  }

  /**
   * Get all available scrapers
   */
  async getScrapers(): Promise<Scraper[]> {
    return this.sendRequest('get_scrapers', {});
  }

  /**
   * Get documents with optional filtering
   */
  async getDocuments(params: {
    municipality_id?: string;
    document_type?: DocumentType;
    status?: DocumentStatus;
    limit?: number;
    offset?: number;
  } = {}): Promise<Document[]> {
    return this.sendRequest('get_documents', params);
  }

  /**
   * Get a specific document by ID
   */
  async getDocument(id: string): Promise<Document> {
    return this.sendRequest('get_document', { id });
  }

  /**
   * Delete a document
   */
  async deleteDocument(id: string): Promise<{ success: boolean }> {
    return this.sendRequest('delete_document', { id });
  }

  /**
   * Perform a health check
   */
  async healthCheck(): Promise<ServiceHealthStatus> {
    return this.sendRequest('health_check', {});
  }

  /**
   * Send a request to the Python service
   */
  private async sendRequest<T extends ServiceOperation>(
    operation: T,
    params: ServiceOperationMap[T]['params'],
    options: RequestOptions = {}
  ): Promise<ServiceOperationMap[T]['result']> {
    if (!this.process || this.process.killed) {
      throw new Error('Service is not running');
    }

    const requestId = uuidv4();
    const timeout = options.timeout ?? this.options.timeout;
    
    const request: ServiceRequest = {
      id: requestId,
      type: 'request',
      operation,
      params,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutHandle,
        onProgress: options.onProgress
      });

      try {
        this.process!.stdin!.write(JSON.stringify(request) + '\n');
      } catch (error) {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeoutHandle);
        reject(new Error(`Failed to send request: ${error}`));
      }
    });
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.stdout!.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleMessage(message);
          } catch (error) {
            this.log('error', 'Failed to parse message from Python service', { 
              line, 
              error 
            });
          }
        }
      }
    });

    this.process.stderr!.on('data', (data: Buffer) => {
      const error = data.toString().trim();
      this.log('error', 'Python service stderr', { error });
      this.options.onError({
        code: 'INTERNAL_ERROR',
        message: error
      });
    });

    this.process.on('exit', (code, signal) => {
      this.log('warn', 'Python service exited', { code, signal });
      this.healthStatus = { status: 'unhealthy', lastCheck: new Date() };
      this.emit('exit', code, signal);

      if (!this.isShuttingDown && this.restartAttempts < this.maxRestartAttempts) {
        this.log('info', `Attempting to restart service (attempt ${this.restartAttempts + 1})`);
        this.restartAttempts++;
        setTimeout(() => this.start().catch(console.error), this.restartDelay);
      }
    });

    this.process.on('error', (error) => {
      this.log('error', 'Python service process error', { error });
      this.healthStatus = { status: 'unhealthy', lastCheck: new Date() };
      this.emit('error', error);
    });
  }

  /**
   * Handle messages from the Python service
   */
  private handleMessage(message: unknown): void {
    if (isServiceResponse(message)) {
      this.handleResponse(message);
    } else if (isProgressMessage(message)) {
      this.handleProgress(message);
    } else if (isHealthCheckResponse(message)) {
      this.handleHealthCheck(message);
    } else {
      this.log('warn', 'Unknown message type from Python service', { message });
    }
  }

  /**
   * Handle service responses
   */
  private handleResponse(response: ServiceResponse): void {
    const request = this.pendingRequests.get(response.request_id);
    if (!request) {
      this.log('warn', 'Received response for unknown request', { 
        requestId: response.request_id 
      });
      return;
    }

    this.pendingRequests.delete(response.request_id);
    clearTimeout(request.timeout);

    if (response.success) {
      request.resolve(response.data);
    } else {
      const error = new Error(response.error?.message ?? 'Unknown service error');
      (error as any).code = response.error?.code;
      (error as any).details = response.error?.details;
      request.reject(error);
    }
  }

  /**
   * Handle progress messages
   */
  private handleProgress(progress: ProgressMessage): void {
    const request = this.pendingRequests.get(progress.request_id);
    
    const progressReport: ProgressReport = {
      stage: progress.stage as any,
      progress: progress.progress,
      message: progress.message,
      current_item: progress.details?.current_item as string,
      items_completed: progress.details?.items_completed as number ?? 0,
      items_total: progress.details?.items_total as number ?? 0,
      estimated_time_remaining: progress.details?.estimated_time_remaining as number,
      details: progress.details
    };

    // Call request-specific progress handler
    request?.onProgress?.(progressReport);
    
    // Call global progress handler
    this.options.onProgress(progressReport);
    
    // Emit progress event
    this.emit('progress', progressReport);
  }

  /**
   * Handle health check responses
   */
  private handleHealthCheck(response: HealthCheckResponse): void {
    const now = new Date();
    this.healthStatus = {
      status: response.status,
      lastCheck: now,
      responseTime: now.getTime() - response.timestamp,
      details: response.details
    };
    
    this.emit('healthCheck', this.healthStatus);
  }

  /**
   * Wait for the service to be ready
   */
  private async waitForServiceReady(maxWait = 10000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      try {
        await this.healthCheck();
        if (this.healthStatus.status === 'healthy') {
          return;
        }
      } catch (error) {
        // Service not ready yet, continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    throw new Error('Service failed to become ready within timeout');
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.stopHealthChecks();
    
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        this.log('warn', 'Health check failed', { error });
        this.healthStatus = { 
          status: 'unhealthy', 
          lastCheck: new Date(),
          details: { error: String(error) }
        };
      }
    }, this.options.healthCheckInterval);
  }

  /**
   * Stop periodic health checks
   */
  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Setup error handlers for uncaught exceptions
   */
  private setupErrorHandlers(): void {
    this.on('error', (error) => {
      this.log('error', 'Service client error', { error });
      this.options.onError({
        code: 'INTERNAL_ERROR',
        message: error.message,
        details: { stack: error.stack }
      });
    });
  }

  /**
   * Log messages based on log level
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: any): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[this.options.logLevel];
    const messageLevel = levels[level];
    
    if (messageLevel >= currentLevel) {
      const timestamp = new Date().toISOString();
      const logMessage = meta 
        ? `[${timestamp}] [${level.toUpperCase()}] ${message} ${JSON.stringify(meta)}`
        : `[${timestamp}] [${level.toUpperCase()}] ${message}`;
      
      console.log(logMessage);
    }
  }
}

// Export factory function for easier instantiation
export function createPythonServiceClient(options: ServiceClientOptions): PythonServiceClient {
  return new PythonServiceClient(options);
}