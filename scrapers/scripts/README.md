# Scraper Execution Scripts

This directory contains the main execution scripts for running bylaw scrapers. These scripts are called by the API routes for processing operations.

## Main Scripts

### `run_scrapers.py`
The main execution script that handles all scraper operations. Supports:

- **Single municipality processing**: `--municipality-id 1 --operation scrape`
- **Bulk processing**: `--municipality-ids 1,2,3 --operation scrape --batch-size 2`
- **All municipalities**: `--municipality-ids all --operation full_pipeline`
- **Named municipalities**: `--municipality-ids toronto,ottawa --operation extract`

#### Operations
- `scrape`: Run web scraping to find new documents
- `extract`: Extract text content from PDF documents
- `analyze`: Analyze content for ADU relevance
- `full_pipeline`: Run complete pipeline (scrape → extract → analyze)

#### Key Features
- **Progress tracking**: Real-time progress updates via JSON output
- **Database integration**: Updates Supabase with job status and results
- **Error handling**: Comprehensive error handling and timeout management
- **Flexible input**: Supports IDs, names, ranges, and "all" selection
- **Concurrent processing**: Configurable batch processing with thread pools

### Helper Scripts
- `extract_documents.py`: Wrapper that calls `run_scrapers.py` with `--operation extract`
- `analyze_documents.py`: Wrapper that calls `run_scrapers.py` with `--operation analyze`
- `run_full_pipeline.py`: Wrapper that calls `run_scrapers.py` with `--operation full_pipeline`

## API Integration

The scripts integrate with the API routes via:

1. **Command execution**: API spawns Python processes with appropriate arguments
2. **Progress monitoring**: Scripts output JSON progress updates prefixed with "PROGRESS:"
3. **Result handling**: Scripts return structured JSON results for API consumption
4. **File-based progress**: Progress written to `tmp/job-progress/` for real-time monitoring

## Usage Examples

```bash
# Single municipality scrape
python run_scrapers.py --municipality-id 1 --operation scrape

# Batch processing with custom options
python run_scrapers.py --municipality-ids 1,2,3 --operation scrape \
  --batch-size 2 --priority high --skip-existing

# Full pipeline for all active municipalities
python run_scrapers.py --municipality-ids all --operation full_pipeline \
  --timeout-minutes 60

# Test mode with verbose output
python run_scrapers.py --municipality-id 1 --operation scrape \
  --test-mode --log-level DEBUG --output-format summary
```

## Configuration

The scripts use the municipality registry (`config/municipality_registry.py`) to:
- Validate municipality IDs and names
- Load scraper configurations
- Handle municipality selection parsing
- Provide processing estimates

## Dependencies

- `supabase_client.py`: Database operations and job management
- `municipality_processor.py`: Core processing logic
- `batch_coordinator.py`: Multi-municipality coordination
- `config/municipality_registry.py`: Municipality configuration
- `utils/output_manager.py`: Result output and file management

## Progress Tracking

Scripts output progress in JSON format for API consumption:

```json
PROGRESS:{"stage":"starting","progress":5,"message":"Starting scrape for City of Toronto","timestamp":"2025-08-05T03:48:09.630652"}
PROGRESS:{"stage":"processing","progress":50,"message":"Processing documents","municipality_id":1}
PROGRESS:{"stage":"completed","progress":100,"message":"Completed successfully","documents_found":42}
```

## Error Handling

- Graceful degradation when municipalities are not found or inactive
- Timeout management for long-running operations
- Comprehensive error logging and reporting
- Cleanup of temporary files and database resources
- Proper exit codes for API integration (0 = success, 1 = failure, 130 = interrupted)