"""
Enhanced Scraper Manager with Parallel Processing and Resource Management
Provides coordinated scraping of multiple municipalities with real-time progress tracking

Updated for modular local processing without Redis dependencies.
"""

import asyncio
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable, Any, Set
from dataclasses import dataclass, field
from enum import Enum
import json
import time
import traceback
from pathlib import Path

# Local imports - use modular components
from .config.municipality_registry import get_registry, MunicipalityConfig
from .municipality_processor import MunicipalityProcessor, ProcessingResult
from .batch_coordinator import BatchCoordinator
from .utils.output_manager import OutputManager


class ManagerStatus(Enum):
    """Manager operation status"""
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPING = "stopping"
    ERROR = "error"


class ScrapingStatus(Enum):
    """Scraping job status"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ScrapingJob:
    """Represents a scraping job for a municipality"""
    municipality_id: int
    scraper_name: str
    priority: int = 1
    created_at: datetime = field(default_factory=datetime.utcnow)
    status: ScrapingStatus = ScrapingStatus.PENDING
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert job to dictionary for serialization"""
        return {
            'municipality_id': self.municipality_id,
            'scraper_name': self.scraper_name,
            'priority': self.priority,
            'created_at': self.created_at.isoformat(),
            'status': self.status.value,
            'error': self.error,
            'result': self.result
        }


class EnhancedScraperManager:
    """Enhanced manager for orchestrating multiple scrapers - Updated for modular processing"""
    
    def __init__(
        self,
        max_concurrent_jobs: int = 5,
        output_dir: str = "scraper_output",
        progress_callback: Callable[[str, Dict[str, Any]], None] = None,
        logger: logging.Logger = None
    ):
        self.max_concurrent_jobs = max_concurrent_jobs
        self.progress_callback = progress_callback
        
        # Set up logging
        self.logger = logger or self._setup_logger()
        
        # Initialize modular components
        self.registry = get_registry()
        self.output_manager = OutputManager(output_dir, create_dirs=True)
        self.municipality_processor = MunicipalityProcessor(
            self.output_manager, 
            self._create_progress_callback()
        )
        self.batch_coordinator = BatchCoordinator(
            self.output_manager,
            max_concurrent=max_concurrent_jobs,
            progress_callback=self._batch_progress_callback
        )
        
        # State management
        self.status = ManagerStatus.IDLE
        self.jobs: Dict[str, ScrapingJob] = {}  # job_id -> ScrapingJob
        self.active_jobs: Set[str] = set()
        self.completed_jobs: Set[str] = set()
        self.failed_jobs: Set[str] = set()
        
        # Session statistics
        self.session_stats = {
            'jobs_created': 0,
            'jobs_completed': 0,
            'jobs_failed': 0,
            'total_documents_found': 0,
            'total_errors': 0,
            'start_time': None,
            'end_time': None
        }
        
        # Threading
        self._lock = threading.Lock()
        
        self.logger.info(f"Enhanced scraper manager initialized with modular components")
        self.logger.info(f"Registry: {len(self.registry.get_all_municipalities())} municipalities available")
    
    def _setup_logger(self) -> logging.Logger:
        """Set up logger for the manager"""
        logger = logging.getLogger("enhanced_scraper_manager")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    def _create_progress_callback(self):
        """Create progress callback for municipality processor"""
        def callback(municipality_id: int, stage: str, data: Dict[str, Any]):
            if self.progress_callback:
                try:
                    self.progress_callback(f"municipality_{municipality_id}", data)
                except Exception as e:
                    self.logger.warning(f"Progress callback error: {e}")
        return callback
    
    def _batch_progress_callback(self, stage: str, status):
        """Handle batch progress updates"""
        if self.progress_callback:
            try:
                self.progress_callback("batch", {
                    'stage': stage,
                    'completed': status.completed,
                    'total': status.total_municipalities,
                    'successful': status.successful,
                    'failed': status.failed
                })
            except Exception as e:
                self.logger.warning(f"Batch progress callback error: {e}")
    
    def _generate_job_id(self, municipality_id: int) -> str:
        """Generate unique job ID"""
        timestamp = int(time.time() * 1000)
        return f"job_{municipality_id}_{timestamp}"
    
    def create_job(
        self,
        municipality_id: int,
        priority: int = 1
    ) -> str:
        """Create a new scraping job using modular system"""
        # Validate municipality
        config = self.registry.get_municipality(municipality_id)
        if not config:
            raise ValueError(f"Municipality {municipality_id} not found")
        
        if not config.active:
            raise ValueError(f"Municipality {config.name} is not active")
        
        job_id = self._generate_job_id(municipality_id)
        
        job = ScrapingJob(
            municipality_id=municipality_id,
            scraper_name=config.scraper_module,
            priority=priority
        )
        
        with self._lock:
            self.jobs[job_id] = job
            self.session_stats['jobs_created'] += 1
        
        self.logger.info(f"Created job {job_id} for municipality {municipality_id} ({config.name})")
        return job_id
    
    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a specific job"""
        with self._lock:
            job = self.jobs.get(job_id)
            return job.to_dict() if job else None
    
    def get_all_jobs_status(self) -> Dict[str, Any]:
        """Get status of all jobs"""
        with self._lock:
            return {
                'status': self.status.value,
                'session_stats': self.session_stats.copy(),
                'jobs': {job_id: job.to_dict() for job_id, job in self.jobs.items()},
                'active_jobs': len(self.active_jobs),
                'completed_jobs': len(self.completed_jobs),
                'failed_jobs': len(self.failed_jobs),
                'performance': self.performance_monitor.get_summary()
            }
    
    def cancel_job(self, job_id: str) -> bool:
        """Cancel a specific job"""
        with self._lock:
            job = self.jobs.get(job_id)
            if not job:
                return False
            
            if job.status == ScrapingStatus.RUNNING and job.scraper_instance:
                job.scraper_instance.cancel_scraping()
                if job.task:
                    job.task.cancel()
            
            job.status = ScrapingStatus.CANCELLED
            self.active_jobs.discard(job_id)
            
            self.logger.info(f"Cancelled job {job_id}")
            return True
    
    def cancel_all_jobs(self):
        """Cancel all active jobs"""
        with self._lock:
            for job_id in list(self.active_jobs):
                self.cancel_job(job_id)
    
    def run_single_job(self, job_id: str) -> Dict[str, Any]:
        """Run a single scraping job using modular system"""
        job = self.jobs.get(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")
        
        municipality_id = job.municipality_id
        
        try:
            with self._lock:
                self.active_jobs.add(job_id)
                job.status = ScrapingStatus.RUNNING
            
            # Use municipality processor to handle the job
            result = self.municipality_processor.process_municipality(municipality_id)
            
            # Convert ProcessingResult to job result format
            job_result = {
                'municipality_id': result.municipality_id,
                'municipality_name': result.municipality_name,
                'documents_found': result.documents_found,
                'errors': result.errors,
                'elapsed_time': result.elapsed_time,
                'success': result.success,
                'output_file': result.output_file
            }
            
            # Update job and session stats
            with self._lock:
                if result.success:
                    job.status = ScrapingStatus.COMPLETED
                    self.completed_jobs.add(job_id)
                    self.session_stats['jobs_completed'] += 1
                    self.session_stats['total_documents_found'] += result.documents_found
                else:
                    job.status = ScrapingStatus.FAILED
                    self.failed_jobs.add(job_id)
                    self.session_stats['jobs_failed'] += 1
                    self.session_stats['total_errors'] += len(result.errors)
                
                job.result = job_result
                self.active_jobs.discard(job_id)
            
            self.logger.info(f"Job {job_id} completed: {'SUCCESS' if result.success else 'FAILED'}")
            return job_result
            
        except Exception as e:
            error_msg = f"Job {job_id} failed: {e}"
            self.logger.error(error_msg, exc_info=True)
            
            with self._lock:
                job.status = ScrapingStatus.FAILED
                job.error = str(e)
                self.active_jobs.discard(job_id)
                self.failed_jobs.add(job_id)
                self.session_stats['jobs_failed'] += 1
                self.session_stats['total_errors'] += 1
            
            return {'error': str(e), 'job_id': job_id}
    
    def run_jobs_batch(
        self,
        job_ids: List[str],
        sequential: bool = False
    ) -> Dict[str, Any]:
        """Run multiple jobs using batch coordinator"""
        if not job_ids:
            return {'results': {}, 'summary': 'No jobs to run'}
        
        self.status = ManagerStatus.RUNNING
        self.session_stats['start_time'] = datetime.utcnow().isoformat()
        
        # Extract municipality IDs from jobs
        municipality_ids = set()
        for job_id in job_ids:
            job = self.jobs.get(job_id)
            if job:
                municipality_ids.add(job.municipality_id)
        
        try:
            # Use batch coordinator
            result = self.batch_coordinator.process_municipalities(
                municipality_ids,
                batch_id=f"jobs_batch_{len(job_ids)}",
                sequential=sequential
            )
            
            # Update session stats
            if result.get('success'):
                summary = result['summary']
                with self._lock:
                    self.session_stats['jobs_completed'] = summary['successful']
                    self.session_stats['jobs_failed'] = summary['failed']
                    self.session_stats['total_documents_found'] = summary['total_documents_found']
                    self.session_stats['total_errors'] = summary['total_errors']
                    self.session_stats['end_time'] = datetime.utcnow().isoformat()
            
            self.status = ManagerStatus.IDLE
            return result
            
        except Exception as e:
            self.status = ManagerStatus.ERROR
            self.logger.error(f"Batch job execution failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def run_all_active_municipalities(self) -> Dict[str, Any]:
        """Run scrapers for all active municipalities using modular system"""
        self.logger.info("Running scrapers for all active municipalities")
        
        active_municipalities = self.registry.get_active_ids()
        
        if not active_municipalities:
            return {
                'success': False,
                'message': 'No active municipalities found'
            }
        
        self.status = ManagerStatus.RUNNING
        self.session_stats['start_time'] = datetime.utcnow().isoformat()
        
        try:
            # Use batch coordinator for processing
            result = self.batch_coordinator.process_municipalities(
                active_municipalities,
                batch_id=f"all_active_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
            )
            
            # Update session stats
            if result.get('success'):
                summary = result['summary']
                with self._lock:
                    self.session_stats['jobs_completed'] = summary['successful']
                    self.session_stats['jobs_failed'] = summary['failed']
                    self.session_stats['total_documents_found'] = summary['total_documents_found']
                    self.session_stats['total_errors'] = summary['total_errors']
                    self.session_stats['end_time'] = datetime.utcnow().isoformat()
            
            self.status = ManagerStatus.IDLE
            return result
            
        except Exception as e:
            self.status = ManagerStatus.ERROR
            self.logger.error(f"Failed to run all active municipalities: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def pause_all_jobs(self):
        """Pause all running jobs"""
        self.status = ManagerStatus.PAUSED
        self.logger.info("Manager paused")
    
    def resume_all_jobs(self):
        """Resume paused jobs"""
        if self.status == ManagerStatus.PAUSED:
            self.status = ManagerStatus.RUNNING
            self.logger.info("Manager resumed")
    
    def shutdown(self):
        """Gracefully shutdown the manager"""
        self.logger.info("Shutting down scraper manager...")
        self.status = ManagerStatus.STOPPING
        
        # Cancel all active jobs
        self.cancel_all_jobs()
        
        # Wait for jobs to finish cancelling
        timeout = 30  # 30 seconds timeout
        start = time.time()
        
        while self.active_jobs and (time.time() - start) < timeout:
            time.sleep(0.1)
        
        if self.active_jobs:
            self.logger.warning(f"Forced shutdown with {len(self.active_jobs)} jobs still active")
        
        self.status = ManagerStatus.IDLE
        self.logger.info("Scraper manager shutdown complete")
    
    def get_available_scrapers(self) -> List[str]:
        """Get list of available scraper names"""
        municipalities = self.registry.get_all_municipalities(active_only=True)
        return [m.scraper_module for m in municipalities]
    
    def get_manager_stats(self) -> Dict[str, Any]:
        """Get comprehensive manager statistics"""
        registry_summary = self.registry.get_summary()
        output_summary = self.output_manager.get_output_summary()
        
        with self._lock:
            return {
                'status': self.status.value,
                'available_municipalities': registry_summary['active_municipalities'],
                'total_municipalities': registry_summary['total_municipalities'],
                'max_concurrent_jobs': self.max_concurrent_jobs,
                'active_jobs': len(self.active_jobs),
                'session_stats': self.session_stats.copy(),
                'output_summary': {
                    'output_directory': output_summary['output_directory'],
                    'results_count': output_summary['results_count'],
                    'total_size_mb': output_summary['total_size_mb']
                },
                'modular_components': {
                    'municipality_registry': 'active',
                    'output_manager': 'active',
                    'batch_coordinator': 'active',
                    'redis_dependencies': 'removed'
                }
            }
    
    # Convenience methods for easy integration
    
    def process_municipalities_by_selection(self, selection: str, 
                                          sequential: bool = False) -> Dict[str, Any]:
        """
        Process municipalities by selection string (like local_runner)
        
        Args:
            selection: Municipality selection ('all', '1,2,3', 'toronto,ottawa', etc.)
            sequential: Whether to process sequentially
            
        Returns:
            Processing results
        """
        municipality_ids = self.registry.parse_municipality_selection(selection)
        
        if not municipality_ids:
            return {
                'success': False,
                'error': f"No valid municipalities found for selection: {selection}"
            }
        
        valid_ids = self.registry.validate_municipalities(municipality_ids)
        
        if not valid_ids:
            return {
                'success': False,
                'error': "No active municipalities found in selection"
            }
        
        return self.batch_coordinator.process_municipalities(
            valid_ids,
            sequential=sequential
        )
    
    def list_municipalities_info(self) -> Dict[str, Any]:
        """Get formatted information about all municipalities"""
        municipalities = self.registry.get_all_municipalities(active_only=True)
        summary = self.registry.get_summary()
        
        return {
            'total_active': len(municipalities),
            'total_all': summary['total_municipalities'],
            'municipalities': [
                {
                    'id': m.id,
                    'name': m.name,
                    'scraper_module': m.scraper_module,
                    'estimated_pages': m.estimated_pages,
                    'estimated_pdfs': m.estimated_pdfs,
                    'active': m.active
                }
                for m in municipalities
            ],
            'summary': summary
        }
    
    def get_output_files(self, limit: int = 10) -> Dict[str, Any]:
        """Get information about recent output files"""
        output_summary = self.output_manager.get_output_summary()
        recent_files = self.output_manager.get_recent_results(limit=limit)
        
        return {
            'output_directory': output_summary['output_directory'],
            'total_files': output_summary['results_count'],
            'total_size_mb': output_summary['total_size_mb'],
            'recent_files': recent_files
        }
    
    def export_results_for_node(self, municipality_ids: List[int] = None) -> str:
        """
        Export recent results in format suitable for Node.js processing
        
        Args:
            municipality_ids: Optional list of specific municipality IDs to export
            
        Returns:
            Path to exported file
        """
        if municipality_ids:
            # Get specific municipality files
            result_files = []
            for municipality_id in municipality_ids:
                files = self.output_manager.get_recent_results(municipality_id, limit=1)
                result_files.extend(files)
        else:
            # Get all recent files
            result_files = self.output_manager.get_recent_results(limit=50)
        
        if not result_files:
            raise ValueError("No result files found to export")
        
        return self.output_manager.export_for_node_processing(result_files)


# Global manager instance
_manager_instance: Optional[EnhancedScraperManager] = None
_manager_lock = threading.Lock()


def get_enhanced_manager(
    max_concurrent_jobs: int = 5,
    output_dir: str = "scraper_output",
    progress_callback: Callable[[str, Dict[str, Any]], None] = None
) -> EnhancedScraperManager:
    """Get or create the global enhanced manager instance"""
    global _manager_instance
    
    with _manager_lock:
        if _manager_instance is None:
            _manager_instance = EnhancedScraperManager(
                max_concurrent_jobs=max_concurrent_jobs,
                output_dir=output_dir,
                progress_callback=progress_callback
            )
    
    return _manager_instance


def shutdown_manager():
    """Shutdown the global manager instance"""
    global _manager_instance
    
    with _manager_lock:
        if _manager_instance:
            # Note: This is synchronous, in a real app you'd want to handle this properly
            # asyncio.create_task(_manager_instance.shutdown())
            _manager_instance = None
