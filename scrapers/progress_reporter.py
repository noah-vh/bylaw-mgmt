"""
Progress Reporter for V2 Scrapers - Redis Pub/Sub Integration

This module provides granular progress reporting for scrapers using Redis pub/sub
to enable real-time monitoring and updates in the bylaw portal system.
"""

import os
import json
import time
import logging
from typing import Dict, Any, Optional, List, Union
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None


class ScrapingStage(Enum):
    """Enumeration of scraping stages for detailed progress tracking"""
    INITIALIZING = "initializing"
    FETCHING_CATEGORIES = "fetching_categories"
    SCRAPING_PAGES = "scraping_pages"
    DISCOVERING_PDFS = "discovering_pdfs"
    VALIDATING_LINKS = "validating_links"
    EXTRACTING_METADATA = "extracting_metadata"
    FINALIZING = "finalizing"


@dataclass
class ProgressUpdate:
    """Data structure for progress updates"""
    municipality_id: int
    municipality_name: str
    stage: ScrapingStage
    progress_percent: float
    current_count: int
    total_count: int
    message: str
    timestamp: str
    metadata: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        data = asdict(self)
        data['stage'] = self.stage.value
        return data


@dataclass
class PageVisitUpdate:
    """Update for individual page visits"""
    municipality_id: int
    page_url: str
    page_number: int
    total_pages: int
    pdfs_found: int
    timestamp: str
    response_time_ms: Optional[int] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)


@dataclass
class PDFDiscoveryUpdate:
    """Update for PDF discoveries"""
    municipality_id: int
    pdf_url: str
    pdf_title: str
    source_page: str
    bylaw_number: Optional[str]
    document_date: Optional[str]
    timestamp: str
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)


class ProgressReporter:
    """Enhanced progress reporter with Redis pub/sub integration"""
    
    def __init__(self, municipality_id: int, municipality_name: str, job_id: str = None):
        self.municipality_id = municipality_id
        self.municipality_name = municipality_name
        self.job_id = job_id or f"scraper_{municipality_id}_{int(time.time())}"
        
        # Initialize Redis if available
        self.redis_client = None
        self.redis_available = False
        
        if REDIS_AVAILABLE:
            self._init_redis()
        
        # Set up logging
        self.logger = logging.getLogger(f"progress_reporter.{municipality_name.lower().replace(' ', '_')}")
        self.logger.setLevel(logging.INFO)
        
        # Progress tracking
        self.start_time = time.time()
        self.current_stage = None
        self.stage_start_times = {}
        self.total_pages_visited = 0
        self.total_pdfs_found = 0
        self.total_errors = 0
        
        # Redis channel configuration
        self.progress_channel = f"bylaw:updates:municipality:{municipality_id}"
        self.global_channel = "bylaw:updates:global"
        
    def _init_redis(self):
        """Initialize Redis connection"""
        try:
            redis_url = os.getenv('REDIS_URL')
            if redis_url:
                self.redis_client = redis.from_url(redis_url, decode_responses=True)
                # Test connection
                self.redis_client.ping()
                self.redis_available = True
                self.logger.info("Redis connection established for progress reporting")
            else:
                self.logger.warning("REDIS_URL not found in environment variables")
        except Exception as e:
            self.logger.warning(f"Failed to connect to Redis: {e}")
            self.redis_available = False
    
    def start_scraping(self, estimated_pages: int = None, estimated_pdfs: int = None) -> None:
        """Initialize scraping progress tracking"""
        self.current_stage = ScrapingStage.INITIALIZING
        self.stage_start_times[self.current_stage] = time.time()
        
        update = ProgressUpdate(
            municipality_id=self.municipality_id,
            municipality_name=self.municipality_name,
            stage=ScrapingStage.INITIALIZING,
            progress_percent=0.0,
            current_count=0,
            total_count=estimated_pages or 0,
            message=f"Starting scrape for {self.municipality_name}",
            timestamp=datetime.utcnow().isoformat(),
            metadata={
                'job_id': self.job_id,
                'estimated_pages': estimated_pages,
                'estimated_pdfs': estimated_pdfs,
                'start_time': self.start_time
            }
        )
        
        self._publish_progress_update(update)
        self.logger.info(f"Started scraping for {self.municipality_name}")
    
    def report_stage_change(self, new_stage: ScrapingStage, message: str = None) -> None:
        """Report a change in scraping stage"""
        old_stage = self.current_stage
        self.current_stage = new_stage
        self.stage_start_times[new_stage] = time.time()
        
        # Calculate stage duration if we had a previous stage
        stage_duration = None
        if old_stage and old_stage in self.stage_start_times:
            stage_duration = time.time() - self.stage_start_times[old_stage]
        
        update = ProgressUpdate(
            municipality_id=self.municipality_id,
            municipality_name=self.municipality_name,
            stage=new_stage,
            progress_percent=self._calculate_stage_progress(new_stage),
            current_count=0,
            total_count=0,
            message=message or f"Started {new_stage.value}",
            timestamp=datetime.utcnow().isoformat(),
            metadata={
                'job_id': self.job_id,
                'previous_stage': old_stage.value if old_stage else None,
                'stage_duration_seconds': stage_duration,
                'total_pages_visited': self.total_pages_visited,
                'total_pdfs_found': self.total_pdfs_found
            }
        )
        
        self._publish_stage_change_event(old_stage, new_stage, update)
        self.logger.info(f"Stage changed: {old_stage} -> {new_stage}")
    
    def report_page_visit(self, page_url: str, page_number: int, total_pages: int, 
                         pdfs_found: int = 0, response_time_ms: int = None) -> None:
        """Report visiting a specific page during scraping"""
        self.total_pages_visited += 1
        
        page_update = PageVisitUpdate(
            municipality_id=self.municipality_id,
            page_url=page_url,
            page_number=page_number,
            total_pages=total_pages,
            pdfs_found=pdfs_found,
            timestamp=datetime.utcnow().isoformat(),
            response_time_ms=response_time_ms
        )
        
        # Calculate progress based on pages visited
        progress_percent = (page_number / total_pages * 100) if total_pages > 0 else 0
        
        progress_update = ProgressUpdate(
            municipality_id=self.municipality_id,
            municipality_name=self.municipality_name,
            stage=self.current_stage or ScrapingStage.SCRAPING_PAGES,
            progress_percent=progress_percent,
            current_count=page_number,
            total_count=total_pages,
            message=f"Visited page {page_number}/{total_pages}: {pdfs_found} PDFs found",
            timestamp=datetime.utcnow().isoformat(),
            metadata={
                'job_id': self.job_id,
                'page_url': page_url,
                'response_time_ms': response_time_ms,
                'cumulative_pdfs': self.total_pdfs_found + pdfs_found
            }
        )
        
        self._publish_page_visit_event(page_update)
        self._publish_progress_update(progress_update)
    
    def report_pdf_discovery(self, pdf_url: str, pdf_title: str, source_page: str,
                           bylaw_number: str = None, document_date: str = None) -> None:
        """Report discovery of a PDF document"""
        self.total_pdfs_found += 1
        
        pdf_update = PDFDiscoveryUpdate(
            municipality_id=self.municipality_id,
            pdf_url=pdf_url,
            pdf_title=pdf_title,
            source_page=source_page,
            bylaw_number=bylaw_number,
            document_date=document_date,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self._publish_pdf_discovery_event(pdf_update)
        self.logger.debug(f"PDF discovered: {pdf_title} from {source_page}")
    
    def report_progress_update(self, current: int, total: int, message: str = None) -> None:
        """Report generic progress update for current stage"""
        progress_percent = (current / total * 100) if total > 0 else 0
        
        update = ProgressUpdate(
            municipality_id=self.municipality_id,
            municipality_name=self.municipality_name,
            stage=self.current_stage or ScrapingStage.SCRAPING_PAGES,
            progress_percent=progress_percent,
            current_count=current,
            total_count=total,
            message=message or f"Processing {current}/{total}",
            timestamp=datetime.utcnow().isoformat(),
            metadata={
                'job_id': self.job_id,
                'total_pages_visited': self.total_pages_visited,
                'total_pdfs_found': self.total_pdfs_found
            }
        )
        
        self._publish_progress_update(update)
    
    def report_error(self, error_message: str, url: str = None, recoverable: bool = True) -> None:
        """Report an error during scraping"""
        self.total_errors += 1
        
        error_event = {
            'type': 'scraping_error',
            'timestamp': datetime.utcnow().isoformat(),
            'municipalityId': self.municipality_id,
            'jobId': self.job_id,
            'phase': 'scraping',
            'data': {
                'municipalityId': self.municipality_id,
                'jobId': self.job_id,
                'phase': 'scraping',
                'error': error_message,
                'url': url,
                'recoverable': recoverable,
                'total_errors': self.total_errors,
                'stage': self.current_stage.value if self.current_stage else 'unknown'
            }
        }
        
        self._publish_event(error_event)
        self.logger.error(f"Scraping error: {error_message}")
    
    def complete_scraping(self, total_pdfs_found: int, errors: List[str] = None) -> None:
        """Mark scraping as completed and provide final summary"""
        elapsed_time = time.time() - self.start_time
        
        completion_event = {
            'type': 'scraping_complete',
            'timestamp': datetime.utcnow().isoformat(),
            'municipalityId': self.municipality_id,
            'jobId': self.job_id,
            'phase': 'scraping',
            'data': {
                'municipalityId': self.municipality_id,
                'jobId': self.job_id,
                'result': {
                    'success': True,
                    'total_pdfs_found': total_pdfs_found,
                    'total_pages_visited': self.total_pages_visited,
                    'total_errors': self.total_errors,
                    'elapsed_time_seconds': elapsed_time,
                    'errors': errors or []
                },
                'summary': {
                    'documentsFound': total_pdfs_found,
                    'pagesVisited': self.total_pages_visited,
                    'errorCount': self.total_errors,
                    'duration': elapsed_time
                }
            }
        }
        
        self._publish_event(completion_event)
        self.logger.info(f"Scraping completed: {total_pdfs_found} PDFs found in {elapsed_time:.2f}s")
    
    def _calculate_stage_progress(self, stage: ScrapingStage) -> float:
        """Calculate approximate progress percentage based on stage"""
        stage_progress_map = {
            ScrapingStage.INITIALIZING: 5.0,
            ScrapingStage.FETCHING_CATEGORIES: 15.0,
            ScrapingStage.SCRAPING_PAGES: 50.0,
            ScrapingStage.DISCOVERING_PDFS: 75.0,
            ScrapingStage.VALIDATING_LINKS: 85.0,
            ScrapingStage.EXTRACTING_METADATA: 95.0,
            ScrapingStage.FINALIZING: 100.0
        }
        return stage_progress_map.get(stage, 0.0)
    
    def _publish_progress_update(self, update: ProgressUpdate) -> None:
        """Publish a progress update event"""
        event = {
            'type': 'status_update',
            'timestamp': update.timestamp,
            'municipalityId': self.municipality_id,
            'jobId': self.job_id,
            'phase': 'scraping',
            'data': {
                'municipalityId': self.municipality_id,
                'status': self._create_municipality_status(update),
                'changes': [update.message]
            }
        }
        
        self._publish_event(event)
    
    def _publish_stage_change_event(self, old_stage: ScrapingStage, new_stage: ScrapingStage, 
                                  update: ProgressUpdate) -> None:
        """Publish a stage change event"""
        event = {
            'type': 'phase_change',
            'timestamp': update.timestamp,
            'municipalityId': self.municipality_id,
            'jobId': self.job_id,
            'phase': 'scraping',
            'data': {
                'municipalityId': self.municipality_id,
                'fromPhase': 'scraping',
                'toPhase': 'scraping',
                'phaseStatus': {
                    'phase': 'scraping',
                    'status': 'running',
                    'progress': update.progress_percent,
                    'current': update.current_count,
                    'total': update.total_count,
                    'message': update.message,
                    'startTime': datetime.utcnow().isoformat(),
                    'metadata': {
                        'scraping_stage': new_stage.value,
                        'previous_stage': old_stage.value if old_stage else None
                    }
                }
            }
        }
        
        self._publish_event(event)
    
    def _publish_page_visit_event(self, page_update: PageVisitUpdate) -> None:
        """Publish a page visit event"""
        event = {
            'type': 'page_visit',
            'timestamp': page_update.timestamp,
            'municipalityId': self.municipality_id,
            'jobId': self.job_id,
            'data': page_update.to_dict()
        }
        
        self._publish_event(event)
    
    def _publish_pdf_discovery_event(self, pdf_update: PDFDiscoveryUpdate) -> None:
        """Publish a PDF discovery event"""
        event = {
            'type': 'pdf_discovered',
            'timestamp': pdf_update.timestamp,
            'municipalityId': self.municipality_id,
            'jobId': self.job_id,
            'data': pdf_update.to_dict()
        }
        
        self._publish_event(event)
    
    def _publish_event(self, event: Dict[str, Any]) -> None:
        """Publish an event to Redis pub/sub channels"""
        if not self.redis_available or not self.redis_client:
            # Fall back to logging if Redis is not available
            self.logger.debug(f"Event (Redis unavailable): {json.dumps(event, indent=2)}")
            return
        
        try:
            event_json = json.dumps(event)
            
            # Publish to municipality-specific channel
            self.redis_client.publish(self.progress_channel, event_json)
            
            # Also publish to global channel for dashboard updates
            self.redis_client.publish(self.global_channel, event_json)
            
        except Exception as e:
            self.logger.error(f"Failed to publish event to Redis: {e}")
    
    def _create_municipality_status(self, update: ProgressUpdate) -> Dict[str, Any]:
        """Create municipality status object for progress updates"""
        return {
            'municipalityId': self.municipality_id,
            'municipalityName': self.municipality_name,
            'overallStatus': 'running',
            'overallProgress': update.progress_percent,
            'currentPhase': 'scraping',
            'phases': [{
                'phase': 'scraping',
                'status': 'running',
                'progress': update.progress_percent,
                'current': update.current_count,
                'total': update.total_count,
                'message': update.message,
                'startTime': datetime.utcnow().isoformat(),
                'metadata': update.metadata
            }],
            'activeJobs': [{
                'id': self.job_id,
                'type': 'scraper',
                'status': 'running',
                'phase': 'scraping',
                'progress': update.progress_percent,
                'municipalityId': self.municipality_id,
                'startTime': datetime.fromtimestamp(self.start_time).isoformat(),
                'message': update.message
            }],
            'completedJobs': [],
            'lastUpdate': update.timestamp,
            'isAutomated': True,
            'priority': 'normal'
        }
    
    def cleanup(self) -> None:
        """Clean up resources"""
        if self.redis_client:
            try:
                self.redis_client.close()
            except Exception as e:
                self.logger.warning(f"Error closing Redis connection: {e}")


# Convenience function for scrapers to create a progress reporter
def create_progress_reporter(municipality_id: int, municipality_name: str, job_id: str = None) -> ProgressReporter:
    """Factory function to create a progress reporter instance"""
    return ProgressReporter(municipality_id, municipality_name, job_id)