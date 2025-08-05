-- Create bulk processing jobs table migration
-- This table tracks bulk processing operations and their progress

CREATE TABLE IF NOT EXISTS bulk_processing_jobs (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL CHECK (operation IN (
    'scrape_all', 
    'analyze_all', 
    'extract_all', 
    'full_pipeline_all', 
    'municipality_batch'
  )),
  status TEXT DEFAULT 'queued' CHECK (status IN (
    'queued', 
    'pending', 
    'running', 
    'completed', 
    'failed', 
    'cancelled'
  )),
  municipality_ids INTEGER[] DEFAULT NULL,
  total_operations INTEGER DEFAULT 0,
  completed_operations INTEGER DEFAULT 0,
  failed_operations INTEGER DEFAULT 0,
  progress_file_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  result_summary JSONB,
  created_by TEXT
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_bulk_processing_jobs_status ON bulk_processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bulk_processing_jobs_operation ON bulk_processing_jobs(operation);
CREATE INDEX IF NOT EXISTS idx_bulk_processing_jobs_created_at ON bulk_processing_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_processing_jobs_municipality_ids ON bulk_processing_jobs USING GIN(municipality_ids);

-- Create function to automatically set started_at when status changes to 'running'
CREATE OR REPLACE FUNCTION set_bulk_job_started_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Set started_at when status changes to 'running'
  IF NEW.status = 'running' AND OLD.status != 'running' AND NEW.started_at IS NULL THEN
    NEW.started_at = NOW();
  END IF;
  
  -- Set completed_at when status changes to a final state
  IF NEW.status IN ('completed', 'failed', 'cancelled') AND OLD.status NOT IN ('completed', 'failed', 'cancelled') THEN
    NEW.completed_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bulk_processing_jobs_status_trigger
  BEFORE UPDATE ON bulk_processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_bulk_job_started_at();

-- Add comments for documentation
COMMENT ON TABLE bulk_processing_jobs IS 'Tracks bulk processing operations across multiple municipalities';
COMMENT ON COLUMN bulk_processing_jobs.id IS 'Unique job identifier (UUID format)';
COMMENT ON COLUMN bulk_processing_jobs.operation IS 'Type of bulk operation being performed';
COMMENT ON COLUMN bulk_processing_jobs.municipality_ids IS 'Array of municipality IDs to process (NULL for all)';
COMMENT ON COLUMN bulk_processing_jobs.progress_file_path IS 'Path to progress file for real-time tracking';
COMMENT ON COLUMN bulk_processing_jobs.result_summary IS 'JSON summary of operation results';

-- Create view for job statistics
CREATE OR REPLACE VIEW bulk_processing_job_stats AS
SELECT 
  operation,
  status,
  COUNT(*) as job_count,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds,
  AVG(completed_operations::float / NULLIF(total_operations, 0) * 100) as avg_completion_rate,
  MAX(created_at) as last_job_created
FROM bulk_processing_jobs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY operation, status
ORDER BY operation, status;

COMMENT ON VIEW bulk_processing_job_stats IS 'Statistics for bulk processing jobs over the last 30 days';