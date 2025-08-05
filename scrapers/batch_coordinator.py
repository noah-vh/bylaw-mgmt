"""
Batch Coordinator - Multi-municipality processing coordinator

This module coordinates the processing of multiple municipalities,
handling parallel execution, progress aggregation, and batch reporting.
All Redis/SSE dependencies have been removed for offline-only operation.
"""

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Dict, List, Set, Optional, Callable, Any
from dataclasses import dataclass

from .config.municipality_registry import get_registry
from .municipality_processor import MunicipalityProcessor, ProcessingResult
from .utils.output_manager import OutputManager


@dataclass
class BatchStatus:
    """Status of batch processing"""
    batch_id: str
    total_municipalities: int
    completed: int
    successful: int
    failed: int
    running: int
    start_time: float
    estimated_completion: Optional[float] = None
    current_municipalities: List[str] = None


class BatchCoordinator:
    """Coordinates processing of multiple municipalities - offline only"""
    
    def __init__(self, output_manager: OutputManager = None, 
                 max_concurrent: int = 3,
                 progress_callback: Callable[[str, BatchStatus], None] = None):
        self.registry = get_registry()
        self.output_manager = output_manager or OutputManager()
        self.max_concurrent = max_concurrent
        self.progress_callback = progress_callback
        self.logger = logging.getLogger("batch_coordinator")
        
        # State tracking
        self.current_batch_id = None
        self.batch_results: Dict[int, ProcessingResult] = {}
        self.batch_status = None
    
    def process_municipalities(self, municipality_ids: Set[int],
                             batch_id: str = None,
                             sequential: bool = False) -> Dict[str, Any]:
        """
        Process multiple municipalities
        
        Args:
            municipality_ids: Set of municipality IDs to process
            batch_id: Optional batch identifier
            sequential: If True, process one at a time; if False, use parallel processing
            
        Returns:
            Batch processing results
        """
        if not municipality_ids:
            return {'error': 'No municipalities specified'}
        
        # Generate batch ID if not provided
        if not batch_id:
            batch_id = f"batch_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{len(municipality_ids)}"
        
        self.current_batch_id = batch_id
        start_time = time.time()
        
        # Initialize batch status
        self.batch_status = BatchStatus(
            batch_id=batch_id,
            total_municipalities=len(municipality_ids),
            completed=0,
            successful=0,
            failed=0,
            running=0,
            start_time=start_time,
            current_municipalities=[]
        )
        
        self.logger.info(f"Starting batch {batch_id} with {len(municipality_ids)} municipalities")
        self._notify_batch_progress("STARTED")
        
        # Validate municipalities
        valid_ids = self.registry.validate_municipalities(municipality_ids)
        if len(valid_ids) < len(municipality_ids):
            invalid_count = len(municipality_ids) - len(valid_ids)
            self.logger.warning(f"{invalid_count} municipalities were invalid and skipped")
        
        if not valid_ids:
            error_msg = "No valid municipalities to process"
            self.logger.error(error_msg)
            return {'error': error_msg}
        
        # Update status with valid count
        self.batch_status.total_municipalities = len(valid_ids)
        
        try:
            if sequential:
                results = self._process_sequential(valid_ids)
            else:
                results = self._process_parallel(valid_ids)
            
            # Process results
            batch_results = {}
            for municipality_id, result in results.items():
                batch_results[municipality_id] = {
                    'municipality_id': result.municipality_id,
                    'municipality_name': result.municipality_name,
                    'success': result.success,
                    'documents_found': result.documents_found,
                    'errors': result.errors,
                    'elapsed_time': result.elapsed_time,
                    'output_file': result.output_file
                }
            
            # Save batch results
            batch_output_file = self.output_manager.save_batch_results(batch_results, batch_id)
            
            elapsed_time = time.time() - start_time
            
            # Final statistics
            successful = sum(1 for r in results.values() if r.success)
            failed = len(results) - successful
            total_documents = sum(r.documents_found for r in results.values())
            total_errors = sum(len(r.errors) for r in results.values())
            
            self.batch_status.completed = len(results)
            self.batch_status.successful = successful
            self.batch_status.failed = failed
            self.batch_status.running = 0
            
            self._notify_batch_progress("COMPLETED")
            
            summary = {
                'batch_id': batch_id,
                'start_time': datetime.fromtimestamp(start_time).isoformat(),
                'end_time': datetime.utcnow().isoformat(),
                'elapsed_time': elapsed_time,
                'total_municipalities': len(valid_ids),
                'successful': successful,
                'failed': failed,
                'total_documents_found': total_documents,
                'total_errors': total_errors,
                'batch_output_file': batch_output_file,
                'processing_mode': 'sequential' if sequential else 'parallel',
                'max_concurrent': self.max_concurrent if not sequential else 1,
                'offline_mode': True
            }
            
            self.logger.info(f"Batch {batch_id} completed: {successful}/{len(valid_ids)} successful")
            
            return {
                'success': True,
                'summary': summary,
                'results': batch_results
            }
            
        except Exception as e:
            self.logger.error(f"Batch processing failed: {e}", exc_info=True)
            self._notify_batch_progress("ERROR")
            
            return {
                'success': False,
                'error': str(e),
                'batch_id': batch_id
            }
    
    def _process_sequential(self, municipality_ids: Set[int]) -> Dict[int, ProcessingResult]:
        """Process municipalities one at a time"""
        results = {}
        processor = MunicipalityProcessor(
            self.output_manager, 
            self._create_municipality_progress_callback()
        )
        
        for i, municipality_id in enumerate(sorted(municipality_ids), 1):
            config = self.registry.get_municipality(municipality_id)
            municipality_name = config.name if config else f"Municipality_{municipality_id}"
            
            self.logger.info(f"Processing {i}/{len(municipality_ids)}: {municipality_name}")
            
            # Update batch status
            self.batch_status.current_municipalities = [municipality_name]
            self.batch_status.running = 1
            self._notify_batch_progress("PROCESSING")
            
            # Process municipality
            result = processor.process_municipality(municipality_id)
            results[municipality_id] = result
            
            # Update counters
            self.batch_status.completed += 1
            self.batch_status.running = 0
            if result.success:
                self.batch_status.successful += 1
            else:
                self.batch_status.failed += 1
            
            # Estimate completion time
            if i > 1:  # Need at least 2 completed to estimate
                avg_time_per_municipality = (time.time() - self.batch_status.start_time) / i
                remaining = len(municipality_ids) - i
                self.batch_status.estimated_completion = time.time() + (remaining * avg_time_per_municipality)
            
            self._notify_batch_progress("PROCESSING")
            
            self.logger.info(f"Completed {municipality_name}: "
                           f"{'SUCCESS' if result.success else 'FAILED'} "
                           f"({result.documents_found} documents)")
        
        return results
    
    def _process_parallel(self, municipality_ids: Set[int]) -> Dict[int, ProcessingResult]:
        """Process municipalities in parallel using thread pool"""
        results = {}
        
        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            # Create municipality processor for each thread
            def create_processor():
                return MunicipalityProcessor(
                    self.output_manager,
                    self._create_municipality_progress_callback()
                )
            
            # Submit all tasks
            future_to_id = {}
            for municipality_id in municipality_ids:
                processor = create_processor()
                future = executor.submit(processor.process_municipality, municipality_id)
                future_to_id[future] = municipality_id
            
            # Process completed tasks
            for future in as_completed(future_to_id):
                municipality_id = future_to_id[future]
                
                try:
                    result = future.result()
                    results[municipality_id] = result
                    
                    # Update batch status
                    self.batch_status.completed += 1
                    if result.success:
                        self.batch_status.successful += 1
                    else:
                        self.batch_status.failed += 1
                    
                    # Update running count (approximate)
                    self.batch_status.running = len(municipality_ids) - self.batch_status.completed
                    
                    self._notify_batch_progress("PROCESSING")
                    
                    self.logger.info(f"Completed {result.municipality_name}: "
                                   f"{'SUCCESS' if result.success else 'FAILED'} "
                                   f"({result.documents_found} documents)")
                    
                except Exception as e:
                    # Create failed result
                    config = self.registry.get_municipality(municipality_id)
                    municipality_name = config.name if config else f"Municipality_{municipality_id}"
                    
                    result = ProcessingResult(
                        municipality_id=municipality_id,
                        municipality_name=municipality_name,
                        success=False,
                        documents_found=0,
                        errors=[f"Processing exception: {str(e)}"],
                        elapsed_time=0
                    )
                    
                    results[municipality_id] = result
                    
                    self.batch_status.completed += 1
                    self.batch_status.failed += 1
                    self.batch_status.running = len(municipality_ids) - self.batch_status.completed
                    
                    self.logger.error(f"Failed to process {municipality_name}: {e}")
        
        return results
    
    def _create_municipality_progress_callback(self) -> Callable[[int, str, Dict], None]:
        """Create a progress callback for municipality processing"""
        def callback(municipality_id: int, stage: str, data: Dict[str, Any]):
            # Update current municipalities being processed
            config = self.registry.get_municipality(municipality_id)
            municipality_name = config.name if config else f"Municipality_{municipality_id}"
            
            # This could be enhanced to track individual municipality progress
            # For now, just log the progress
            self.logger.debug(f"{municipality_name} [{stage}]: {data.get('message', '')}")
        
        return callback
    
    def _notify_batch_progress(self, stage: str):
        """Notify about batch progress"""
        if self.progress_callback and self.batch_status:
            try:
                self.progress_callback(stage, self.batch_status)
            except Exception as e:
                self.logger.warning(f"Batch progress callback error: {e}")
    
    def get_batch_status(self) -> Optional[BatchStatus]:
        """Get current batch status"""
        return self.batch_status
    
    def estimate_batch_time(self, municipality_ids: Set[int]) -> Dict[str, Any]:
        """Estimate total processing time for a batch"""
        total_estimated_seconds = 0
        municipality_estimates = []
        
        processor = MunicipalityProcessor(self.output_manager)
        
        for municipality_id in municipality_ids:
            estimate = processor.get_processing_estimate(municipality_id)
            if estimate:
                total_estimated_seconds += estimate['estimated_time_seconds']
                municipality_estimates.append(estimate)
        
        # Adjust for parallel processing
        if len(municipality_ids) > 1 and self.max_concurrent > 1:
            # Rough parallel processing adjustment
            parallel_factor = min(self.max_concurrent, len(municipality_ids))
            parallel_estimated_seconds = total_estimated_seconds / parallel_factor * 1.2  # 20% overhead
        else:
            parallel_estimated_seconds = total_estimated_seconds
        
        return {
            'total_municipalities': len(municipality_ids),
            'total_estimated_seconds': total_estimated_seconds,
            'total_estimated_minutes': total_estimated_seconds / 60,
            'parallel_estimated_seconds': parallel_estimated_seconds,
            'parallel_estimated_minutes': parallel_estimated_seconds / 60,
            'max_concurrent': self.max_concurrent,
            'municipality_estimates': municipality_estimates
        }


def main():
    """Test the batch coordinator"""
    import sys
    
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    def batch_progress_callback(stage: str, status: BatchStatus):
        print(f"Batch [{stage}]: {status.completed}/{status.total_municipalities} completed "
              f"({status.successful} successful, {status.failed} failed)")
        if status.estimated_completion:
            remaining_minutes = (status.estimated_completion - time.time()) / 60
            print(f"  Estimated completion in {remaining_minutes:.1f} minutes")
    
    coordinator = BatchCoordinator(
        max_concurrent=2,
        progress_callback=batch_progress_callback
    )
    
    # Test with multiple municipalities
    if len(sys.argv) > 1:
        # Parse municipality IDs from command line
        municipality_ids = set()
        for arg in sys.argv[1:]:
            try:
                municipality_ids.add(int(arg))
            except ValueError:
                print(f"Invalid municipality ID: {arg}")
    else:
        # Default test set
        municipality_ids = {1, 2, 3}  # Toronto, Ottawa, Hamilton
    
    print(f"Processing municipalities: {sorted(municipality_ids)}")
    
    # Get estimates
    estimates = coordinator.estimate_batch_time(municipality_ids)
    print(f"Estimated processing time: {estimates['parallel_estimated_minutes']:.1f} minutes")
    
    # Process batch
    result = coordinator.process_municipalities(municipality_ids)
    
    if result.get('success'):
        summary = result['summary']
        print(f"\nBatch Processing Results:")
        print(f"  Batch ID: {summary['batch_id']}")
        print(f"  Total Time: {summary['elapsed_time']:.2f}s")
        print(f"  Successful: {summary['successful']}/{summary['total_municipalities']}")
        print(f"  Total Documents: {summary['total_documents_found']}")
        print(f"  Output File: {summary['batch_output_file']}")
        print(f"  Offline Mode: {summary.get('offline_mode', True)}")
    else:
        print(f"Batch processing failed: {result.get('error')}")


if __name__ == "__main__":
    main()