#!/usr/bin/env python3
"""
Local Runner - CLI for flexible municipality scraper execution

This script provides a command-line interface for running municipality scrapers
with flexible selection options, progress reporting, and output management.
All Redis/SSE dependencies have been removed for offline-only operation.

Usage Examples:
    python scrapers/local_runner.py --municipalities=all
    python scrapers/local_runner.py --municipalities=1,2,3
    python scrapers/local_runner.py --municipalities=toronto,ottawa
    python scrapers/local_runner.py --municipalities=1-5 --sequential
    python scrapers/local_runner.py --list
"""

import argparse
import logging
import sys
import time
from pathlib import Path
from typing import Set

# Add the parent directory to the path so we can import our modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from scrapers.config.municipality_registry import get_registry
from scrapers.municipality_processor import MunicipalityProcessor
from scrapers.batch_coordinator import BatchCoordinator, BatchStatus
from scrapers.utils.output_manager import OutputManager


class LocalRunner:
    """Main runner class for local scraper execution - offline only"""
    
    def __init__(self, output_dir: str = "scraper_output", 
                 max_concurrent: int = 3, verbose: bool = False):
        self.registry = get_registry()
        self.output_manager = OutputManager(output_dir, create_dirs=True)
        self.max_concurrent = max_concurrent
        self.verbose = verbose
        
        # Set up logging
        log_level = logging.DEBUG if verbose else logging.INFO
        logging.basicConfig(
            level=log_level,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(sys.stdout),
                logging.FileHandler(self.output_manager.logs_dir / "local_runner.log")
            ]
        )
        
        self.logger = logging.getLogger("local_runner")
    
    def list_municipalities(self, active_only: bool = True):
        """List all available municipalities"""
        print(self.registry.list_municipalities(active_only))
        
        summary = self.registry.get_summary()
        print(f"\nSummary:")
        print(f"  Total municipalities: {summary['total_municipalities']}")
        print(f"  Active municipalities: {summary['active_municipalities']}")
        print(f"  Estimated total processing time: {summary['estimated_total_pages'] * 2 / 60:.1f} minutes")
    
    def validate_selection(self, selection: str) -> Set[int]:
        """Validate and parse municipality selection"""
        municipality_ids = self.registry.parse_municipality_selection(selection)
        
        if not municipality_ids:
            print(f"Error: No valid municipalities found for selection '{selection}'")
            print("\nUse --list to see available municipalities")
            sys.exit(1)
        
        # Validate municipalities
        valid_ids = self.registry.validate_municipalities(municipality_ids)
        
        if not valid_ids:
            print("Error: No active municipalities found in selection")
            sys.exit(1)
        
        if len(valid_ids) < len(municipality_ids):
            invalid_count = len(municipality_ids) - len(valid_ids)
            print(f"Warning: {invalid_count} municipalities were invalid and will be skipped")
        
        return valid_ids
    
    def run_single_municipality(self, municipality_id: int):
        """Run scraper for a single municipality"""
        print(f"Processing single municipality: {municipality_id}")
        
        processor = MunicipalityProcessor(self.output_manager)
        
        # Validate municipality
        is_valid, message = processor.validate_municipality(municipality_id)
        if not is_valid:
            print(f"Error: {message}")
            sys.exit(1)
        
        print(f"Validation: {message}")
        
        # Get processing estimate
        estimate = processor.get_processing_estimate(municipality_id)
        if estimate:
            print(f"Estimated processing time: {estimate['estimated_time_minutes']:.1f} minutes")
        
        # Progress callback
        def progress_callback(muni_id: int, stage: str, data: dict):
            if self.verbose:
                progress = data.get('progress', 0)
                message = data.get('message', '')
                print(f"[{stage}] {message} ({progress}%)")
        
        print(f"Starting processing...")
        start_time = time.time()
        
        result = processor.process_municipality(municipality_id, enable_progress_logging=True)
        
        elapsed_time = time.time() - start_time
        
        # Display results
        print(f"\nProcessing completed in {elapsed_time:.2f} seconds")
        print(f"Municipality: {result.municipality_name}")
        print(f"Success: {'YES' if result.success else 'NO'}")
        print(f"Documents found: {result.documents_found}")
        print(f"Errors: {len(result.errors)}")
        
        if result.output_file:
            print(f"Results saved to: {result.output_file}")
        
        if result.errors:
            print(f"\nErrors encountered:")
            for error in result.errors:
                print(f"  - {error}")
        
        return result.success
    
    def run_batch_municipalities(self, municipality_ids: Set[int], 
                               sequential: bool = False):
        """Run scrapers for multiple municipalities"""
        print(f"Processing {len(municipality_ids)} municipalities: {sorted(municipality_ids)}")
        
        coordinator = BatchCoordinator(
            self.output_manager,
            max_concurrent=1 if sequential else self.max_concurrent,
            progress_callback=self._batch_progress_callback
        )
        
        # Get batch processing estimate
        estimates = coordinator.estimate_batch_time(municipality_ids)
        processing_mode = "sequential" if sequential else f"parallel (max {self.max_concurrent})"
        estimated_time = estimates['parallel_estimated_minutes'] if not sequential else estimates['total_estimated_minutes']
        
        print(f"Processing mode: {processing_mode}")
        print(f"Estimated processing time: {estimated_time:.1f} minutes")
        
        # Start batch processing
        print(f"\nStarting batch processing...")
        start_time = time.time()
        
        result = coordinator.process_municipalities(
            municipality_ids, 
            sequential=sequential
        )
        
        elapsed_time = time.time() - start_time
        
        # Display results
        print(f"\nBatch processing completed in {elapsed_time:.2f} seconds")
        
        if result.get('success'):
            summary = result['summary']
            print(f"Batch ID: {summary['batch_id']}")
            print(f"Successful: {summary['successful']}/{summary['total_municipalities']}")
            print(f"Failed: {summary['failed']}")
            print(f"Total documents found: {summary['total_documents_found']}")
            print(f"Total errors: {summary['total_errors']}")
            print(f"Results saved to: {summary['batch_output_file']}")
            
            # Show individual results
            if self.verbose:
                print(f"\nIndividual Results:")
                for muni_id, muni_result in result['results'].items():
                    status = "SUCCESS" if muni_result['success'] else "FAILED"
                    print(f"  {muni_id:2d}. {muni_result['municipality_name']}: "
                          f"{status} ({muni_result['documents_found']} docs)")
            
            return summary['failed'] == 0
        else:
            print(f"Batch processing failed: {result.get('error')}")
            return False
    
    def _batch_progress_callback(self, stage: str, status: BatchStatus):
        """Callback for batch progress updates"""
        if stage == "STARTED":
            print(f"Batch started: {status.total_municipalities} municipalities")
        elif stage == "PROCESSING":
            progress_pct = (status.completed / status.total_municipalities * 100) if status.total_municipalities > 0 else 0
            print(f"Progress: {status.completed}/{status.total_municipalities} "
                  f"({progress_pct:.1f}%) - {status.successful} successful, {status.failed} failed")
            
            if status.estimated_completion:
                remaining_minutes = max(0, (status.estimated_completion - time.time()) / 60)
                print(f"  Estimated completion in {remaining_minutes:.1f} minutes")
        elif stage == "COMPLETED":
            print(f"Batch completed: {status.successful}/{status.total_municipalities} successful")
        elif stage == "ERROR":
            print(f"Batch processing encountered an error")
    
    def show_output_summary(self):
        """Show summary of output files"""
        summary = self.output_manager.get_output_summary()
        
        print(f"Output Summary:")
        print(f"  Output directory: {summary['output_directory']}")
        print(f"  Result files: {summary['results_count']}")
        print(f"  Batch summaries: {summary['batch_summaries_count']}")
        print(f"  Log files: {summary['log_files_count']}")
        print(f"  Total size: {summary['total_size_mb']} MB")
        print(f"  Offline mode: {summary.get('offline_mode', True)}")
        
        if summary['recent_files']:
            print(f"\nMost recent files:")
            for i, file_info in enumerate(summary['recent_files'], 1):
                file_path = Path(file_info['path'])
                size_kb = file_info['size'] / 1024
                print(f"  {i}. {file_path.name} ({size_kb:.1f} KB)")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Local municipality scraper runner - offline only",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --list                                    # List all municipalities
  %(prog)s --municipalities=all                      # Process all active municipalities
  %(prog)s --municipalities=1,2,3                    # Process specific IDs
  %(prog)s --municipalities=toronto,ottawa           # Process by name
  %(prog)s --municipalities=1-5                      # Process ID range
  %(prog)s --municipalities=1 --sequential           # Single municipality sequentially
  %(prog)s --output-dir=my_results --concurrent=5    # Custom output and concurrency
  %(prog)s --show-output                             # Show output file summary
        """
    )
    
    parser.add_argument(
        '--municipalities', '-m',
        type=str,
        help='Municipality selection: "all", "1,2,3", "toronto,ottawa", or "1-5"'
    )
    
    parser.add_argument(
        '--list', '-l',
        action='store_true',
        help='List all available municipalities'
    )
    
    parser.add_argument(
        '--list-all',
        action='store_true',
        help='List all municipalities including inactive ones'
    )
    
    parser.add_argument(
        '--sequential',
        action='store_true',
        help='Process municipalities sequentially (default: parallel)'
    )
    
    parser.add_argument(
        '--concurrent', '-c',
        type=int,
        default=3,
        help='Maximum concurrent municipalities (default: 3)'
    )
    
    parser.add_argument(
        '--output-dir', '-o',
        type=str,
        default='scraper_output',
        help='Output directory for results (default: scraper_output)'
    )
    
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose output'
    )
    
    parser.add_argument(
        '--show-output',
        action='store_true',
        help='Show summary of output files'
    )
    
    args = parser.parse_args()
    
    # Create runner
    runner = LocalRunner(
        output_dir=args.output_dir,
        max_concurrent=args.concurrent,
        verbose=args.verbose
    )
    
    # Handle different commands
    if args.list:
        runner.list_municipalities(active_only=True)
        return
    
    if args.list_all:
        runner.list_municipalities(active_only=False)
        return
    
    if args.show_output:
        runner.show_output_summary()
        return
    
    if not args.municipalities:
        print("Error: Must specify --municipalities or use --list")
        print("Use --help for usage information")
        sys.exit(1)
    
    # Validate and process municipalities
    municipality_ids = runner.validate_selection(args.municipalities)
    
    print(f"Selected municipalities: {sorted(municipality_ids)}")
    
    # Show municipality details
    for municipality_id in sorted(municipality_ids):
        config = runner.registry.get_municipality(municipality_id)
        if config:
            print(f"  {municipality_id:2d}. {config.name} "
                  f"(est. {config.estimated_pages} pages, {config.estimated_pdfs} PDFs)")
    
    # Determine processing approach
    success = False
    if len(municipality_ids) == 1:
        # Single municipality
        municipality_id = next(iter(municipality_ids))
        success = runner.run_single_municipality(municipality_id)
    else:
        # Multiple municipalities
        success = runner.run_batch_municipalities(municipality_ids, args.sequential)
    
    # Show final output summary
    print(f"\n" + "="*50)
    runner.show_output_summary()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()