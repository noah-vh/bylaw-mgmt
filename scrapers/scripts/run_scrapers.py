#!/usr/bin/env python3
"""
Main execution script for running scrapers

This script provides the main interface for executing scrapers with support for:
- Individual scraper execution by municipality ID/name
- Bulk scraper execution with batch processing
- Integration with existing municipality registry
- Progress tracking and job status updates
- Command-line interface with structured JSON output
- Database integration via Supabase

Usage:
    python run_scrapers.py --municipality-id 1 --operation scrape
    python run_scrapers.py --operation scrape --municipality-ids 1,2,3
    python run_scrapers.py --operation full_pipeline --municipality-ids all
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Any

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.municipality_registry import get_registry
from supabase_client import get_supabase_client
from batch_coordinator import BatchCoordinator
from municipality_processor import MunicipalityProcessor
from utils.output_manager import OutputManager


def setup_logging(level: str = 'INFO') -> logging.Logger:
    """Setup logging configuration"""
    log_level = getattr(logging, level.upper(), logging.INFO)
    
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    return logging.getLogger(__name__)


def parse_municipality_ids(ids_str: str) -> Set[int]:
    """Parse municipality IDs from string"""
    registry = get_registry()
    return registry.parse_municipality_selection(ids_str)


def print_progress_json(stage: str, progress: int, message: str, **kwargs):
    """Print progress in JSON format for API consumption"""
    progress_data = {
        'stage': stage,
        'progress': progress,
        'message': message,
        'timestamp': datetime.utcnow().isoformat(),
        **kwargs
    }
    print(f"PROGRESS:{json.dumps(progress_data)}")
    sys.stdout.flush()


def run_single_scraper(municipality_id: int, 
                      operation: str,
                      options: Dict[str, Any],
                      logger: logging.Logger) -> Dict[str, Any]:
    """Run scraper for a single municipality"""
    registry = get_registry()
    supabase_client = get_supabase_client()
    
    # Get municipality config
    config = registry.get_municipality(municipality_id)
    if not config:
        return {
            'success': False,
            'error': f'Municipality {municipality_id} not found',
            'municipality_id': municipality_id
        }
    
    if not config.active:
        return {
            'success': False,
            'error': f'Municipality {municipality_id} ({config.name}) is not active',
            'municipality_id': municipality_id,
            'municipality_name': config.name
        }
    
    logger.info(f"Starting {operation} for {config.name} (ID: {municipality_id})")
    print_progress_json('starting', 5, f'Starting {operation} for {config.name}',
                       municipality_id=municipality_id, municipality_name=config.name)
    
    try:
        # Create job in database
        job_id = None
        if operation in ['scrape', 'full_pipeline']:
            job_id = supabase_client.create_scraper_job(
                municipality_id, 
                config.scraper_module,
                job_type='scraper' if operation == 'scrape' else 'processing',
                priority=options.get('priority', 'normal')
            )
            logger.info(f"Created job {job_id}")
        
        start_time = time.time()
        
        # Progress callback
        def progress_callback(mid: int, stage: str, data: Dict[str, Any]):
            progress = data.get('progress', 0)
            message = data.get('message', stage)
            print_progress_json(stage, progress, message, 
                              municipality_id=mid, 
                              municipality_name=config.name,
                              job_id=job_id)
            
            if job_id:
                supabase_client.update_job_progress(job_id, progress, message)
        
        # Create processor
        output_manager = OutputManager()
        processor = MunicipalityProcessor(output_manager, progress_callback)
        
        print_progress_json('processing', 10, f'Processing {config.name}',
                           municipality_id=municipality_id, municipality_name=config.name)
        
        # Execute based on operation type
        if operation == 'scrape':
            result = processor.process_municipality(municipality_id)
        elif operation == 'extract':
            # For extract, we need documents to process
            print_progress_json('extract', 20, 'Starting document extraction',
                               municipality_id=municipality_id)
            # This would typically extract content from already scraped documents
            result = processor.extract_documents(municipality_id)
        elif operation == 'analyze':
            # For analyze, we need extracted content to analyze
            print_progress_json('analyze', 20, 'Starting content analysis',
                               municipality_id=municipality_id)
            result = processor.analyze_content(municipality_id)
        elif operation == 'full_pipeline':
            # Run complete pipeline: scrape -> extract -> analyze
            print_progress_json('full_pipeline', 20, 'Starting full pipeline',
                               municipality_id=municipality_id)
            result = processor.process_full_pipeline(municipality_id)
        else:
            return {
                'success': False,
                'error': f'Unknown operation: {operation}',
                'municipality_id': municipality_id,
                'municipality_name': config.name
            }
        
        elapsed_time = time.time() - start_time
        
        print_progress_json('completed', 100, f'Completed {operation} for {config.name}',
                           municipality_id=municipality_id, 
                           municipality_name=config.name,
                           elapsed_time=elapsed_time)
        
        # Complete job in database
        if job_id:
            supabase_client.complete_job(
                job_id, 
                result.success, 
                result_data={
                    'operation': operation,
                    'documents_found': result.documents_found,
                    'elapsed_time': elapsed_time,
                    'output_file': result.output_file
                },
                error_message='; '.join(result.errors) if result.errors else None
            )
        
        # Log scrape result
        if operation in ['scrape', 'full_pipeline']:
            supabase_client.log_scrape_result(
                municipality_id=municipality_id,
                status='success' if result.success else 'failed',
                documents_found=result.documents_found,
                documents_new=result.documents_found,  # Simplified for now
                job_id=job_id,
                error_message='; '.join(result.errors) if result.errors else None,
                duration_seconds=elapsed_time
            )
        
        return {
            'success': result.success,
            'municipality_id': municipality_id,
            'municipality_name': config.name,
            'operation': operation,
            'documents_found': result.documents_found,
            'errors': result.errors,
            'elapsed_time': elapsed_time,
            'output_file': result.output_file,
            'job_id': job_id
        }
        
    except Exception as e:
        logger.error(f"Error processing {config.name}: {e}", exc_info=True)
        
        if job_id:
            supabase_client.complete_job(
                job_id, 
                False, 
                error_message=str(e)
            )
        
        print_progress_json('error', 0, f'Error processing {config.name}: {str(e)}',
                           municipality_id=municipality_id, 
                           municipality_name=config.name)
        
        return {
            'success': False,
            'error': str(e),
            'municipality_id': municipality_id,
            'municipality_name': config.name,
            'operation': operation
        }


def run_batch_scrapers(municipality_ids: Set[int],
                      operation: str,
                      options: Dict[str, Any],
                      logger: logging.Logger) -> Dict[str, Any]:
    """Run scrapers for multiple municipalities"""
    registry = get_registry()
    
    # Validate municipalities
    valid_ids = registry.validate_municipalities(municipality_ids)
    if not valid_ids:
        return {
            'success': False,
            'error': 'No valid municipalities found',
            'requested_ids': list(municipality_ids)
        }
    
    logger.info(f"Starting batch {operation} for {len(valid_ids)} municipalities")
    print_progress_json('batch_starting', 5, f'Starting batch {operation}',
                       total_municipalities=len(valid_ids),
                       municipality_ids=list(valid_ids))
    
    try:
        # Progress callback for batch coordinator
        def batch_progress_callback(stage: str, status):
            progress = int((status.completed / status.total_municipalities) * 100) if status.total_municipalities > 0 else 0
            print_progress_json(
                f'batch_{stage.lower()}', 
                progress,
                f'Batch {operation}: {status.completed}/{status.total_municipalities} completed '
                f'({status.successful} successful, {status.failed} failed)',
                batch_id=status.batch_id,
                total_municipalities=status.total_municipalities,
                completed=status.completed,
                successful=status.successful,
                failed=status.failed,
                running=status.running
            )
        
        # Create batch coordinator
        coordinator = BatchCoordinator(
            max_concurrent=options.get('batch_size', 3),
            progress_callback=batch_progress_callback
        )
        
        # Process municipalities
        batch_id = f"batch_{operation}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        result = coordinator.process_municipalities(
            valid_ids,
            batch_id=batch_id,
            sequential=options.get('batch_size', 3) == 1
        )
        
        if result.get('success'):
            summary = result['summary']
            print_progress_json('batch_completed', 100, 
                               f'Batch {operation} completed successfully',
                               **summary)
            
            return {
                'success': True,
                'operation': operation,
                'batch_id': batch_id,
                'summary': summary,
                'results': result['results']
            }
        else:
            print_progress_json('batch_error', 0, 
                               f'Batch {operation} failed: {result.get("error")}',
                               batch_id=batch_id)
            
            return {
                'success': False,
                'error': result.get('error'),
                'operation': operation,
                'batch_id': batch_id
            }
        
    except Exception as e:
        logger.error(f"Error in batch processing: {e}", exc_info=True)
        print_progress_json('batch_error', 0, f'Batch processing error: {str(e)}')
        
        return {
            'success': False,
            'error': str(e),
            'operation': operation
        }


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='Run bylaw scrapers for municipalities',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --municipality-id 1 --operation scrape
  %(prog)s --municipality-ids 1,2,3 --operation scrape --batch-size 2
  %(prog)s --municipality-ids all --operation full_pipeline
  %(prog)s --municipality-ids toronto,ottawa --operation extract
        """
    )
    
    # Operation type
    parser.add_argument(
        '--operation',
        choices=['scrape', 'extract', 'analyze', 'full_pipeline'],
        required=True,
        help='Operation to perform'
    )
    
    # Municipality selection
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        '--municipality-id',
        type=int,
        help='Single municipality ID to process'
    )
    group.add_argument(
        '--municipality-ids',
        type=str,
        help='Comma-separated municipality IDs, names, ranges, or "all"'
    )
    
    # Processing options
    parser.add_argument(
        '--priority',
        choices=['low', 'normal', 'high', 'urgent'],
        default='normal',
        help='Job priority (default: normal)'
    )
    
    parser.add_argument(
        '--batch-size',
        type=int,
        default=3,
        help='Number of concurrent scrapers (default: 3, use 1 for sequential)'
    )
    
    parser.add_argument(
        '--skip-existing',
        action='store_true',
        help='Skip processing if recent results exist'
    )
    
    parser.add_argument(
        '--validate-results',
        action='store_true',
        default=True,
        help='Validate processing results (default: True)'
    )
    
    parser.add_argument(
        '--retry-failed',
        action='store_true',
        help='Retry failed jobs from previous runs'
    )
    
    parser.add_argument(
        '--max-retries',
        type=int,
        default=1,
        help='Maximum number of retries for failed operations (default: 1)'
    )
    
    parser.add_argument(
        '--timeout-minutes',
        type=int,
        default=30,
        help='Timeout in minutes per municipality (default: 30)'
    )
    
    parser.add_argument(
        '--log-level',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        default='INFO',
        help='Logging level (default: INFO)'
    )
    
    parser.add_argument(
        '--test-mode',
        action='store_true',
        help='Run in test mode (limited processing, verbose output)'
    )
    
    parser.add_argument(
        '--output-format',
        choices=['json', 'summary'],
        default='json',
        help='Output format (default: json)'
    )
    
    args = parser.parse_args()
    
    # Setup logging
    logger = setup_logging(args.log_level)
    
    # Prepare options
    options = {
        'priority': args.priority,
        'batch_size': args.batch_size,
        'skip_existing': args.skip_existing,
        'validate_results': args.validate_results,
        'retry_failed': args.retry_failed,
        'max_retries': args.max_retries,
        'timeout_minutes': args.timeout_minutes,
        'test_mode': args.test_mode
    }
    
    try:
        start_time = time.time()
        
        # Determine municipalities to process
        if args.municipality_id:
            municipality_ids = {args.municipality_id}
        else:
            municipality_ids = parse_municipality_ids(args.municipality_ids)
        
        if not municipality_ids:
            result = {
                'success': False,
                'error': 'No municipalities specified or found',
                'timestamp': datetime.utcnow().isoformat()
            }
        elif len(municipality_ids) == 1:
            # Single municipality processing
            municipality_id = next(iter(municipality_ids))
            result = run_single_scraper(municipality_id, args.operation, options, logger)
        else:
            # Batch processing
            result = run_batch_scrapers(municipality_ids, args.operation, options, logger)
        
        # Add timing information
        result['total_elapsed_time'] = time.time() - start_time
        result['timestamp'] = datetime.utcnow().isoformat()
        
        # Output results
        if args.output_format == 'json':
            print(json.dumps(result, indent=2, default=str))
        else:
            # Summary format
            if result.get('success'):
                if 'summary' in result:
                    # Batch results
                    s = result['summary']
                    print(f"✓ Batch {args.operation} completed successfully")
                    print(f"  Processed: {s['successful']}/{s['total_municipalities']} municipalities")
                    print(f"  Documents: {s['total_documents_found']} found")
                    print(f"  Time: {s['elapsed_time']:.1f}s")
                else:
                    # Single municipality results
                    print(f"✓ {args.operation} completed for {result.get('municipality_name', 'municipality')}")
                    print(f"  Documents: {result.get('documents_found', 0)} found")
                    print(f"  Time: {result.get('elapsed_time', 0):.1f}s")
            else:
                print(f"✗ {args.operation} failed: {result.get('error', 'Unknown error')}")
        
        # Exit with appropriate code
        sys.exit(0 if result.get('success') else 1)
        
    except KeyboardInterrupt:
        logger.info("Process interrupted by user")
        print_progress_json('interrupted', 0, 'Process interrupted by user')
        sys.exit(130)  # Standard exit code for SIGINT
        
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        result = {
            'success': False,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }
        
        if args.output_format == 'json':
            print(json.dumps(result, indent=2))
        else:
            print(f"✗ Unexpected error: {e}")
        
        sys.exit(1)


if __name__ == '__main__':
    main()