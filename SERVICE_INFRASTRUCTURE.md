# Service Infrastructure Documentation

This document describes the core Python service infrastructure created for the Flask-style migration.

## Overview

The service infrastructure consists of two main components that provide JSON-based communication and pipeline management for the bylaw scraping system.

## Core Components

### 1. ServiceManager (`scrapers/service_manager.py`)

**Purpose**: Main service process that handles JSON requests via stdin/stdout and maintains ScraperManager instances.

**Key Features**:
- JSON request/response communication via stdin/stdout
- Integration with existing ScraperManager and EnhancedScraperManager
- Comprehensive error handling and logging
- Progress reporting for long-running operations
- Support for both basic and enhanced scraping features

**Supported Actions**:
- `health_check` - System health and connectivity status
- `list_scrapers` - Get available scrapers with metadata
- `run_scraper` - Execute individual scraper
- `test_scraper` - Test scraper without saving results
- `scraping_phase` - Run scraping phase only
- `extraction_phase` - Run content extraction phase only
- `analysis_phase` - Run content analysis phase only
- `complete_pipeline` - Run full scraping → extraction → analysis pipeline
- `batch_process` - Process multiple municipalities
- `get_job_status` - Check job progress
- `cancel_job` - Cancel running operation
- `get_system_status` - Get comprehensive system status

### 2. PipelineController (`scrapers/pipeline_controller.py`)

**Purpose**: Pipeline management that controls individual phases and orchestrates complete workflows.

**Key Features**:
- Individual phase control (scraping, extraction, analysis)
- Complete pipeline orchestration
- Batch processing for multiple municipalities
- Operation mode support (test, production, resume)
- Progress tracking and error handling
- Database integration for document management

**Phase Operations**:
- `run_scraping_only()` - Execute scraping phase with assigned scrapers
- `run_extraction_only()` - Extract content from discovered PDFs
- `run_analysis_only()` - Analyze content for ADU relevance
- `run_complete_pipeline()` - Execute all phases sequentially
- `run_on_multiple()` - Process specific municipalities
- `run_on_all()` - Process all active municipalities

## JSON Communication Protocol

### Request Format
```json
{
  "id": "unique_request_id",
  "action": "action_name",
  "params": {
    "parameter1": "value1",
    "parameter2": "value2"
  }
}
```

### Response Format
```json
{
  "type": "response",
  "request_id": "unique_request_id", 
  "success": true,
  "data": {
    "result_data": "value"
  }
}
```

### Progress Updates
```json
{
  "type": "progress",
  "job_id": "job_identifier",
  "progress": 75,
  "message": "Processing documents...",
  "timestamp": "2025-01-05T10:30:00Z"
}
```

### Error Response
```json
{
  "type": "response",
  "success": false,
  "error": "Error description",
  "request_id": "unique_request_id"
}
```

## Database Integration

The services integrate with the existing Supabase database schema:

- **municipalities table**: Municipality configuration and assigned scrapers
- **pdf_documents table**: Document storage and metadata
- **background_jobs table**: Job tracking and progress
- **scrape_logs table**: Scraping operation history
- **scrapers table**: Scraper configuration and statistics

### Assigned Scrapers Support

The system supports the `assigned_scrapers` array field in the municipalities table, allowing multiple scrapers per municipality while maintaining backward compatibility with the single `scraper_name` field.

## Operation Modes

### Test Mode
- Limited scope processing
- Safe for testing new scrapers
- No persistent changes
- Quick validation

### Production Mode  
- Full processing pipeline
- Persistent database changes
- Complete document lifecycle
- Error recovery

### Resume Mode
- Continue from interrupted operations
- Skip already processed items
- Maintain operation state

## Usage Examples

### Direct Python Usage
```python
from scrapers.service_manager import ServiceManager
from scrapers.pipeline_controller import PipelineController

# Create service manager
service = ServiceManager(enable_enhanced_features=True)

# Run complete pipeline
result = service.pipeline_controller.run_complete_pipeline(
    municipality_ids=[1, 2, 3],
    mode="production",
    sequential=False
)
```

### JSON Service Communication
```bash
# Start service
python -m scrapers.service_manager

# Send JSON request via stdin
echo '{"id":"test","action":"health_check","params":{}}' | python -m scrapers.service_manager
```

### Individual Phase Operations
```python
# Run only scraping phase
scraping_result = pipeline_controller.run_scraping_only(
    municipality_ids=[1, 2, 3],
    mode="production"
)

# Run only extraction phase  
extraction_result = pipeline_controller.run_extraction_only(
    municipality_ids=[1, 2, 3],
    force_reextract=False
)

# Run only analysis phase
analysis_result = pipeline_controller.run_analysis_only(
    municipality_ids=[1, 2, 3],
    force_reanalyze=False
)
```

## Error Handling

The service infrastructure implements comprehensive error handling:

- **Request validation**: Invalid JSON and missing parameters
- **Database connectivity**: Graceful degradation when database unavailable
- **Scraper failures**: Individual scraper errors don't stop batch operations
- **Resource management**: Proper cleanup of failed operations
- **Progress tracking**: Error states reported via progress updates

## Logging

Structured logging throughout the system:

- Service-level events (startup, shutdown, requests)
- Pipeline operations (phase start/complete, errors)
- Individual scraper operations (documents found, errors)
- Database operations (connection, queries, failures)

## Thread Safety

The services are designed for concurrent operation:

- Thread-safe operation tracking
- Concurrent municipality processing
- Safe progress reporting
- Resource lock management

## Integration with Existing System

The service infrastructure integrates seamlessly with existing components:

- **ScraperManager**: Existing scraper execution and management
- **EnhancedScraperManager**: Advanced parallel processing features
- **Supabase client**: Direct database integration
- **PDF extractors**: Content extraction pipeline
- **Analysis tools**: Document relevance scoring

## Performance Considerations

- **Parallel processing**: Concurrent municipality processing
- **Resource limits**: Configurable maximum concurrent jobs
- **Memory management**: Streaming JSON processing
- **Database optimization**: Batch operations and connection pooling

## Installation Requirements

Required Python packages (from `requirements.txt`):
- supabase
- requests
- beautifulsoup4
- pathlib
- threading
- concurrent.futures

## Testing

Test the service infrastructure:

```bash
# Run basic tests
python scrapers/test_services.py

# View usage examples
python scrapers/example_usage.py

# Test service communication
echo '{"id":"test","action":"health_check","params":{}}' | python -m scrapers.service_manager
```

## Future Enhancements

Planned improvements:
- WebSocket support for real-time progress
- REST API wrapper for HTTP communication
- Enhanced error recovery mechanisms
- Performance metrics and monitoring
- Configuration management system
- Distributed processing capabilities

## Files Created

1. `/Users/noahvanhart/Documents/GitHub/bylaw-mgmt/scrapers/service_manager.py` - Main service process
2. `/Users/noahvanhart/Documents/GitHub/bylaw-mgmt/scrapers/pipeline_controller.py` - Pipeline management
3. `/Users/noahvanhart/Documents/GitHub/bylaw-mgmt/scrapers/test_services.py` - Test suite
4. `/Users/noahvanhart/Documents/GitHub/bylaw-mgmt/scrapers/example_usage.py` - Usage examples
5. `/Users/noahvanhart/Documents/GitHub/bylaw-mgmt/SERVICE_INFRASTRUCTURE.md` - This documentation

The service infrastructure provides a robust, scalable foundation for the Flask-style migration while maintaining compatibility with the existing Supabase database schema and scraper implementations.