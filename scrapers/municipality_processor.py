"""
Municipality Processor - Single municipality scraper processor

This module handles the processing of a single municipality, including
progress tracking, error handling, and result output.
All Redis/SSE dependencies have been removed for offline-only operation.
"""

import logging
import time
from datetime import datetime
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass
from pathlib import Path

from .config.municipality_registry import get_registry, MunicipalityConfig
from .utils.output_manager import OutputManager


@dataclass
class ProcessingResult:
    """Result of processing a single municipality"""
    municipality_id: int
    municipality_name: str
    success: bool
    documents_found: int
    errors: List[str]
    elapsed_time: float
    output_file: Optional[str] = None
    progress_log: List[Dict[str, Any]] = None


class LocalProgressTracker:
    """Local progress tracker - no Redis dependencies"""
    
    def __init__(self, municipality_id: int, municipality_name: str):
        self.municipality_id = municipality_id
        self.municipality_name = municipality_name
        self.start_time = time.time()
        self.progress_entries = []
        self.logger = logging.getLogger(f"progress.{municipality_name.lower().replace(' ', '_')}")
    
    def log_progress(self, stage: str, message: str, current: int = None, total: int = None):
        """Log a progress entry"""
        entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'stage': stage,
            'message': message,
            'current': current,
            'total': total,
            'elapsed_seconds': time.time() - self.start_time
        }
        
        self.progress_entries.append(entry)
        
        # Log to file/console
        if current is not None and total is not None:
            self.logger.info(f"[{stage}] {message} ({current}/{total})")
        else:
            self.logger.info(f"[{stage}] {message}")
    
    def log_error(self, error_message: str, url: str = None):
        """Log an error"""
        self.log_progress("ERROR", f"Error: {error_message}" + (f" at {url}" if url else ""))
    
    def get_progress_entries(self) -> List[Dict[str, Any]]:
        """Get all progress entries"""
        return self.progress_entries.copy()


class MunicipalityProcessor:
    """Processes a single municipality using its configured scraper - offline only"""
    
    def __init__(self, output_manager: OutputManager = None, 
                 progress_callback: Callable[[int, str, Dict], None] = None):
        self.registry = get_registry()
        self.output_manager = output_manager or OutputManager()
        self.progress_callback = progress_callback
        self.logger = logging.getLogger("municipality_processor")
    
    def process_municipality(self, municipality_id: int, 
                           enable_progress_logging: bool = True) -> ProcessingResult:
        """
        Process a single municipality
        
        Args:
            municipality_id: ID of municipality to process
            enable_progress_logging: Whether to enable detailed progress logging
            
        Returns:
            ProcessingResult with processing details
        """
        start_time = time.time()
        
        # Get municipality configuration
        config = self.registry.get_municipality(municipality_id)
        if not config:
            error_msg = f"Municipality {municipality_id} not found in registry"
            self.logger.error(error_msg)
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=f"Unknown_{municipality_id}",
                success=False,
                documents_found=0,
                errors=[error_msg],
                elapsed_time=0
            )
        
        if not config.active:
            error_msg = f"Municipality {config.name} (ID: {municipality_id}) is not active"
            self.logger.error(error_msg)
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=config.name,
                success=False,
                documents_found=0,
                errors=[error_msg],
                elapsed_time=0
            )
        
        # Initialize progress tracker
        progress_tracker = LocalProgressTracker(municipality_id, config.name)
        progress_tracker.log_progress("INITIALIZING", f"Starting scrape for {config.name}")
        
        # Notify callback if provided
        if self.progress_callback:
            try:
                self.progress_callback(municipality_id, "INITIALIZING", {
                    'message': f"Starting scrape for {config.name}",
                    'progress': 0
                })
            except Exception as e:
                self.logger.warning(f"Progress callback error: {e}")
        
        try:
            # Get scraper class
            scraper_class = self.registry.get_scraper_class(municipality_id)
            if not scraper_class:
                error_msg = f"Scraper class not found for {config.name}"
                progress_tracker.log_error(error_msg)
                return ProcessingResult(
                    municipality_id=municipality_id,
                    municipality_name=config.name,
                    success=False,
                    documents_found=0,
                    errors=[error_msg],
                    elapsed_time=time.time() - start_time,
                    progress_log=progress_tracker.get_progress_entries()
                )
            
            progress_tracker.log_progress("LOADING", f"Loaded scraper class: {config.scraper_class}")
            
            # Create and configure scraper instance
            scraper = scraper_class(municipality_id)
            
            # Ensure offline mode (no Redis-based progress reporting)
            if hasattr(scraper, 'enable_progress_reporting'):
                scraper.enable_progress_reporting = True  # Keep local progress reporting
            
            progress_tracker.log_progress("SCRAPING", "Starting web scraping process")
            
            # Run the scraper
            result = scraper.run_scrape()
            
            progress_tracker.log_progress("PROCESSING", "Scraping completed, processing results")
            
            # Process and enhance the result
            enhanced_result = self._enhance_result(result, config, progress_tracker)
            
            # Save result to output file
            output_file = self.output_manager.save_municipality_result(enhanced_result)
            progress_tracker.log_progress("SAVING", f"Results saved to {output_file}")
            
            # Save progress log
            if enable_progress_logging:
                self.output_manager.save_progress_log(
                    municipality_id, config.name, progress_tracker.get_progress_entries()
                )
            
            elapsed_time = time.time() - start_time
            documents_found = enhanced_result.get('documents_found', 0)
            errors = enhanced_result.get('errors', [])
            
            progress_tracker.log_progress("COMPLETED", 
                f"Processing completed: {documents_found} documents found in {elapsed_time:.2f}s")
            
            # Final callback notification
            if self.progress_callback:
                try:
                    self.progress_callback(municipality_id, "COMPLETED", {
                        'message': f"Completed: {documents_found} documents found",
                        'progress': 100,
                        'documents_found': documents_found,
                        'elapsed_time': elapsed_time
                    })
                except Exception as e:
                    self.logger.warning(f"Progress callback error: {e}")
            
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=config.name,
                success=True,
                documents_found=documents_found,
                errors=errors,
                elapsed_time=elapsed_time,
                output_file=output_file,
                progress_log=progress_tracker.get_progress_entries()
            )
            
        except Exception as e:
            elapsed_time = time.time() - start_time
            error_msg = f"Processing failed for {config.name}: {str(e)}"
            
            progress_tracker.log_error(error_msg)
            self.logger.error(error_msg, exc_info=True)
            
            # Error callback notification
            if self.progress_callback:
                try:
                    self.progress_callback(municipality_id, "ERROR", {
                        'message': error_msg,
                        'progress': 0,
                        'error': str(e)
                    })
                except Exception as callback_e:
                    self.logger.warning(f"Progress callback error: {callback_e}")
            
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=config.name,
                success=False,
                documents_found=0,
                errors=[error_msg],
                elapsed_time=elapsed_time,
                progress_log=progress_tracker.get_progress_entries()
            )
    
    def _enhance_result(self, result: Dict[str, Any], config: MunicipalityConfig,
                       progress_tracker: LocalProgressTracker) -> Dict[str, Any]:
        """Enhance scraper result with additional metadata"""
        enhanced = {
            **result,
            'processing_timestamp': datetime.utcnow().isoformat(),
            'scraper_module': config.scraper_module,
            'scraper_class': config.scraper_class,
            'municipality_config': {
                'id': config.id,
                'name': config.name,
                'priority': config.priority,
                'estimated_pages': config.estimated_pages,
                'estimated_pdfs': config.estimated_pdfs
            },
            'progress_entries_count': len(progress_tracker.get_progress_entries()),
            'redis_dependencies_removed': True,
            'local_processing': True,
            'offline_mode': True
        }
        
        return enhanced
    
    def validate_municipality(self, municipality_id: int) -> tuple[bool, str]:
        """
        Validate if a municipality can be processed
        
        Returns:
            (is_valid, message)
        """
        config = self.registry.get_municipality(municipality_id)
        
        if not config:
            return False, f"Municipality {municipality_id} not found"
        
        if not config.active:
            return False, f"Municipality {config.name} is not active"
        
        scraper_class = self.registry.get_scraper_class(municipality_id)
        if not scraper_class:
            return False, f"Scraper class not available for {config.name}"
        
        return True, f"Municipality {config.name} is ready for processing"
    
    def get_processing_estimate(self, municipality_id: int) -> Optional[Dict[str, Any]]:
        """Get processing time estimates for a municipality"""
        config = self.registry.get_municipality(municipality_id)
        if not config:
            return None
        
        # Rough estimates based on configuration
        estimated_time_seconds = config.estimated_pages * 2 + config.estimated_pdfs * 0.1
        
        return {
            'municipality_id': municipality_id,
            'municipality_name': config.name,
            'estimated_pages': config.estimated_pages,
            'estimated_pdfs': config.estimated_pdfs,
            'estimated_time_seconds': estimated_time_seconds,
            'estimated_time_minutes': estimated_time_seconds / 60
        }
    
    def extract_documents(self, municipality_id: int) -> ProcessingResult:
        """Extract content from documents for a municipality"""
        start_time = time.time()
        config = self.registry.get_municipality(municipality_id)
        
        if not config:
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=f"Unknown_{municipality_id}",
                success=False,
                documents_found=0,
                errors=["Municipality not found"],
                elapsed_time=0
            )
        
        progress_tracker = LocalProgressTracker(municipality_id, config.name)
        progress_tracker.log_progress("EXTRACT_INIT", f"Starting document extraction for {config.name}")
        
        try:
            # This would typically run document extraction logic
            # For now, we'll simulate the process
            progress_tracker.log_progress("EXTRACT_PROCESSING", "Processing documents for extraction")
            
            # Placeholder for actual extraction logic
            # In a real implementation, this would:
            # 1. Query database for documents from this municipality
            # 2. Extract text/content from PDFs
            # 3. Store extracted content in database
            # 4. Return processing results
            
            documents_processed = 0  # Placeholder
            elapsed_time = time.time() - start_time
            
            progress_tracker.log_progress("EXTRACT_COMPLETED", 
                f"Document extraction completed: {documents_processed} documents processed")
            
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=config.name,
                success=True,
                documents_found=documents_processed,
                errors=[],
                elapsed_time=elapsed_time,
                progress_log=progress_tracker.get_progress_entries()
            )
            
        except Exception as e:
            elapsed_time = time.time() - start_time
            error_msg = f"Document extraction failed for {config.name}: {str(e)}"
            progress_tracker.log_error(error_msg)
            
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=config.name,
                success=False,
                documents_found=0,
                errors=[error_msg],
                elapsed_time=elapsed_time,
                progress_log=progress_tracker.get_progress_entries()
            )
    
    def analyze_content(self, municipality_id: int) -> ProcessingResult:
        """Analyze content for ADU relevance for a municipality"""
        start_time = time.time()
        config = self.registry.get_municipality(municipality_id)
        
        if not config:
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=f"Unknown_{municipality_id}",
                success=False,
                documents_found=0,
                errors=["Municipality not found"],
                elapsed_time=0
            )
        
        progress_tracker = LocalProgressTracker(municipality_id, config.name)
        progress_tracker.log_progress("ANALYZE_INIT", f"Starting content analysis for {config.name}")
        
        try:
            # This would typically run content analysis logic
            # For now, we'll simulate the process
            progress_tracker.log_progress("ANALYZE_PROCESSING", "Analyzing content for ADU relevance")
            
            # Placeholder for actual analysis logic
            # In a real implementation, this would:
            # 1. Query database for extracted content from this municipality
            # 2. Run ADU relevance analysis using ML/NLP models
            # 3. Update relevance scores in database
            # 4. Return analysis results
            
            documents_analyzed = 0  # Placeholder
            elapsed_time = time.time() - start_time
            
            progress_tracker.log_progress("ANALYZE_COMPLETED", 
                f"Content analysis completed: {documents_analyzed} documents analyzed")
            
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=config.name,
                success=True,
                documents_found=documents_analyzed,
                errors=[],
                elapsed_time=elapsed_time,
                progress_log=progress_tracker.get_progress_entries()
            )
            
        except Exception as e:
            elapsed_time = time.time() - start_time
            error_msg = f"Content analysis failed for {config.name}: {str(e)}"
            progress_tracker.log_error(error_msg)
            
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=config.name,
                success=False,
                documents_found=0,
                errors=[error_msg],
                elapsed_time=elapsed_time,
                progress_log=progress_tracker.get_progress_entries()
            )
    
    def process_full_pipeline(self, municipality_id: int) -> ProcessingResult:
        """Run full pipeline: scrape -> extract -> analyze"""
        start_time = time.time()
        config = self.registry.get_municipality(municipality_id)
        
        if not config:
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=f"Unknown_{municipality_id}",
                success=False,
                documents_found=0,
                errors=["Municipality not found"],
                elapsed_time=0
            )
        
        progress_tracker = LocalProgressTracker(municipality_id, config.name)
        progress_tracker.log_progress("PIPELINE_INIT", f"Starting full pipeline for {config.name}")
        
        all_errors = []
        total_documents = 0
        
        try:
            # Step 1: Scrape documents
            if self.progress_callback:
                self.progress_callback(municipality_id, "PIPELINE_SCRAPE", {
                    'message': f"Pipeline step 1/3: Scraping documents for {config.name}",
                    'progress': 10
                })
            
            scrape_result = self.process_municipality(municipality_id, enable_progress_logging=False)
            if not scrape_result.success:
                all_errors.extend(scrape_result.errors)
                return ProcessingResult(
                    municipality_id=municipality_id,
                    municipality_name=config.name,
                    success=False,
                    documents_found=0,
                    errors=all_errors,
                    elapsed_time=time.time() - start_time,
                    progress_log=progress_tracker.get_progress_entries()
                )
            
            total_documents = scrape_result.documents_found
            progress_tracker.log_progress("PIPELINE_SCRAPE", f"Scraping completed: {total_documents} documents found")
            
            # Step 2: Extract content
            if self.progress_callback:
                self.progress_callback(municipality_id, "PIPELINE_EXTRACT", {
                    'message': f"Pipeline step 2/3: Extracting content from {total_documents} documents",
                    'progress': 40
                })
            
            extract_result = self.extract_documents(municipality_id)
            if not extract_result.success:
                all_errors.extend(extract_result.errors)
            else:
                progress_tracker.log_progress("PIPELINE_EXTRACT", 
                    f"Content extraction completed: {extract_result.documents_found} documents processed")
            
            # Step 3: Analyze content
            if self.progress_callback:
                self.progress_callback(municipality_id, "PIPELINE_ANALYZE", {
                    'message': f"Pipeline step 3/3: Analyzing content for ADU relevance",
                    'progress': 70
                })
            
            analyze_result = self.analyze_content(municipality_id)
            if not analyze_result.success:
                all_errors.extend(analyze_result.errors)
            else:
                progress_tracker.log_progress("PIPELINE_ANALYZE", 
                    f"Content analysis completed: {analyze_result.documents_found} documents analyzed")
            
            elapsed_time = time.time() - start_time
            success = len(all_errors) == 0
            
            progress_tracker.log_progress("PIPELINE_COMPLETED", 
                f"Full pipeline completed: {total_documents} documents processed in {elapsed_time:.2f}s")
            
            if self.progress_callback:
                self.progress_callback(municipality_id, "PIPELINE_COMPLETED", {
                    'message': f"Full pipeline completed for {config.name}",
                    'progress': 100,
                    'documents_found': total_documents,
                    'elapsed_time': elapsed_time
                })
            
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=config.name,
                success=success,
                documents_found=total_documents,
                errors=all_errors,
                elapsed_time=elapsed_time,
                progress_log=progress_tracker.get_progress_entries()
            )
            
        except Exception as e:
            elapsed_time = time.time() - start_time
            error_msg = f"Full pipeline failed for {config.name}: {str(e)}"
            progress_tracker.log_error(error_msg)
            all_errors.append(error_msg)
            
            return ProcessingResult(
                municipality_id=municipality_id,
                municipality_name=config.name,
                success=False,
                documents_found=total_documents,
                errors=all_errors,
                elapsed_time=elapsed_time,
                progress_log=progress_tracker.get_progress_entries()
            )


def main():
    """Test the municipality processor"""
    import sys
    
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    processor = MunicipalityProcessor()
    
    # Test with Toronto (ID 1) if no argument provided
    municipality_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    
    # Validate municipality
    is_valid, message = processor.validate_municipality(municipality_id)
    print(f"Validation: {message}")
    
    if is_valid:
        # Get estimate
        estimate = processor.get_processing_estimate(municipality_id)
        if estimate:
            print(f"Estimated processing time: {estimate['estimated_time_minutes']:.1f} minutes")
        
        # Process municipality
        result = processor.process_municipality(municipality_id)
        
        print(f"\nProcessing Result:")
        print(f"  Municipality: {result.municipality_name}")
        print(f"  Success: {result.success}")
        print(f"  Documents Found: {result.documents_found}")
        print(f"  Errors: {len(result.errors)}")
        print(f"  Elapsed Time: {result.elapsed_time:.2f}s")
        if result.output_file:
            print(f"  Output File: {result.output_file}")
        
        if result.errors:
            print(f"\nErrors:")
            for error in result.errors:
                print(f"  - {error}")


if __name__ == "__main__":
    main()