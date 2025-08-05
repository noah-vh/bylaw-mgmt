"""
Enhanced Base Scraper with Production Features
Provides async support, robust error handling, and performance optimization
"""

import asyncio
import aiohttp
import aiofiles
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any, Callable, AsyncGenerator, Union
import time
import logging
import hashlib
import json
import traceback
from urllib.parse import urljoin, urlparse
from dataclasses import dataclass, field
from enum import Enum
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from collections import defaultdict
import weakref
import gc
from pathlib import Path

# Third-party imports
try:
    from bs4 import BeautifulSoup
    import validators
except ImportError as e:
    logging.error(f"Required dependencies not installed: {e}")
    raise


class ScrapingStatus(Enum):
    """Enumeration of scraping status states"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


class LogLevel(Enum):
    """Logging levels for scraper events"""
    DEBUG = logging.DEBUG
    INFO = logging.INFO
    WARNING = logging.WARNING
    ERROR = logging.ERROR
    CRITICAL = logging.CRITICAL


@dataclass
class ScrapingProgress:
    """Progress tracking for scraping operations"""
    total_pages: int = 0
    processed_pages: int = 0
    total_documents: int = 0
    processed_documents: int = 0
    errors: int = 0
    start_time: datetime = field(default_factory=datetime.utcnow)
    current_stage: str = "initializing"
    
    @property
    def progress_percentage(self) -> float:
        """Calculate overall progress percentage"""
        if self.total_pages == 0:
            return 0.0
        return (self.processed_pages / self.total_pages) * 100
    
    @property
    def elapsed_time(self) -> timedelta:
        """Calculate elapsed time since start"""
        return datetime.utcnow() - self.start_time
    
    @property
    def estimated_time_remaining(self) -> Optional[timedelta]:
        """Estimate remaining time based on current progress"""
        if self.processed_pages == 0 or self.total_pages == 0:
            return None
        
        avg_time_per_page = self.elapsed_time.total_seconds() / self.processed_pages
        remaining_pages = self.total_pages - self.processed_pages
        return timedelta(seconds=avg_time_per_page * remaining_pages)


@dataclass
class RetryConfig:
    """Configuration for retry logic"""
    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0
    jitter: bool = True
    backoff_strategy: str = "exponential"  # 'exponential', 'linear', 'fixed'
    
    def calculate_delay(self, attempt: int) -> float:
        """Calculate delay for retry attempt"""
        if self.backoff_strategy == "exponential":
            delay = self.base_delay * (self.exponential_base ** attempt)
        elif self.backoff_strategy == "linear":
            delay = self.base_delay * attempt
        else:  # fixed
            delay = self.base_delay
        
        delay = min(delay, self.max_delay)
        
        if self.jitter:
            import random
            delay *= (0.5 + random.random() * 0.5)  # Add 0-50% jitter
        
        return delay


@dataclass
class ResourceLimits:
    """Resource management configuration"""
    max_concurrent_requests: int = 10
    max_memory_mb: int = 512
    max_processing_time_seconds: int = 3600  # 1 hour
    request_timeout_seconds: int = 30
    rate_limit_requests_per_second: float = 2.0
    max_response_size_mb: int = 100


class PerformanceMonitor:
    """Monitor and track scraper performance metrics"""
    
    def __init__(self):
        self.metrics = defaultdict(list)
        self._lock = threading.Lock()
    
    def record_metric(self, name: str, value: float, timestamp: datetime = None):
        """Record a performance metric"""
        with self._lock:
            self.metrics[name].append({
                'value': value,
                'timestamp': timestamp or datetime.utcnow()
            })
    
    def get_average(self, name: str, time_window: timedelta = None) -> Optional[float]:
        """Get average value for a metric"""
        with self._lock:
            values = self.metrics.get(name, [])
            if not values:
                return None
            
            if time_window:
                cutoff = datetime.utcnow() - time_window
                values = [v for v in values if v['timestamp'] >= cutoff]
            
            if not values:
                return None
            
            return sum(v['value'] for v in values) / len(values)
    
    def get_summary(self) -> Dict[str, Any]:
        """Get performance summary"""
        with self._lock:
            summary = {}
            for name, values in self.metrics.items():
                if values:
                    summary[name] = {
                        'count': len(values),
                        'average': sum(v['value'] for v in values) / len(values),
                        'min': min(v['value'] for v in values),
                        'max': max(v['value'] for v in values),
                        'latest': values[-1]['value']
                    }
            return summary


class EnhancedScraper(ABC):
    """Enhanced base scraper with production features"""
    
    def __init__(
        self,
        municipality_id: int,
        base_url: str,
        search_url: str,
        retry_config: RetryConfig = None,
        resource_limits: ResourceLimits = None,
        progress_callback: Callable[[ScrapingProgress], None] = None,
        logger: logging.Logger = None
    ):
        self.municipality_id = municipality_id
        self.base_url = base_url
        self.search_url = search_url
        self.retry_config = retry_config or RetryConfig()
        self.resource_limits = resource_limits or ResourceLimits()
        self.progress_callback = progress_callback
        
        # Set up logging
        self.logger = logger or self._setup_logger()
        
        # Initialize tracking
        self.progress = ScrapingProgress()
        self.performance_monitor = PerformanceMonitor()
        self.status = ScrapingStatus.PENDING
        self.documents_found = []
        self.errors = []
        self.session_stats = {
            'requests_made': 0,
            'bytes_downloaded': 0,
            'cache_hits': 0,
            'cache_misses': 0
        }
        
        # Resource management
        self._semaphore = asyncio.Semaphore(self.resource_limits.max_concurrent_requests)
        self._rate_limiter = self._create_rate_limiter()
        self._memory_tracker = weakref.WeakSet()
        self._cancellation_token = asyncio.Event()
        
        # Session management
        self._session: Optional[aiohttp.ClientSession] = None
        
        self.logger.info(f"Initialized enhanced scraper for municipality {municipality_id}")
    
    def _setup_logger(self) -> logging.Logger:
        """Set up logger for the scraper"""
        logger = logging.getLogger(f"scraper.municipality_{self.municipality_id}")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    def _create_rate_limiter(self) -> asyncio.Semaphore:
        """Create rate limiter based on configuration"""
        # This is a simplified rate limiter - in production, consider using
        # more sophisticated rate limiting libraries
        return asyncio.Semaphore(int(self.resource_limits.rate_limit_requests_per_second))
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session"""
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(
                total=self.resource_limits.request_timeout_seconds
            )
            
            headers = {
                'User-Agent': (
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                    '(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                )
            }
            
            connector = aiohttp.TCPConnector(
                limit=self.resource_limits.max_concurrent_requests,
                limit_per_host=min(5, self.resource_limits.max_concurrent_requests),
                enable_cleanup_closed=True
            )
            
            self._session = aiohttp.ClientSession(
                timeout=timeout,
                headers=headers,
                connector=connector
            )
        
        return self._session
    
    async def _check_memory_usage(self) -> bool:
        """Check if memory usage is within limits"""
        try:
            import psutil
            process = psutil.Process()
            memory_mb = process.memory_info().rss / 1024 / 1024
            
            if memory_mb > self.resource_limits.max_memory_mb:
                self.logger.warning(f"Memory usage ({memory_mb:.1f}MB) exceeds limit ({self.resource_limits.max_memory_mb}MB)")
                gc.collect()  # Force garbage collection
                return False
            
            return True
        except ImportError:
            # psutil not available, skip memory check
            return True
        except Exception as e:
            self.logger.warning(f"Error checking memory usage: {e}")
            return True
    
    async def _rate_limited_request(
        self,
        method: str,
        url: str,
        **kwargs
    ) -> Optional[aiohttp.ClientResponse]:
        """Make rate-limited HTTP request with retry logic"""
        async with self._semaphore:
            await self._rate_limiter.acquire()
            
            for attempt in range(self.retry_config.max_retries + 1):
                if self._cancellation_token.is_set():
                    raise asyncio.CancelledError("Scraping was cancelled")
                
                try:
                    session = await self._get_session()
                    start_time = time.time()
                    
                    async with session.request(method, url, **kwargs) as response:
                        # Check response size
                        content_length = response.headers.get('content-length')
                        if content_length:
                            size_mb = int(content_length) / 1024 / 1024
                            if size_mb > self.resource_limits.max_response_size_mb:
                                raise ValueError(f"Response size ({size_mb:.1f}MB) exceeds limit")
                        
                        # Record metrics
                        request_time = time.time() - start_time
                        self.performance_monitor.record_metric('request_duration', request_time)
                        self.session_stats['requests_made'] += 1
                        
                        if response.status == 200:
                            return response
                        elif response.status in [429, 503, 504]:  # Rate limited or server error
                            if attempt < self.retry_config.max_retries:
                                delay = self.retry_config.calculate_delay(attempt)
                                self.logger.warning(
                                    f"Request failed with status {response.status}, "
                                    f"retrying in {delay:.1f}s (attempt {attempt + 1}/{self.retry_config.max_retries})"
                                )
                                await asyncio.sleep(delay)
                                continue
                        
                        response.raise_for_status()
                        
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    if attempt < self.retry_config.max_retries:
                        delay = self.retry_config.calculate_delay(attempt)
                        self.logger.warning(
                            f"Request error: {e}, retrying in {delay:.1f}s "
                            f"(attempt {attempt + 1}/{self.retry_config.max_retries})"
                        )
                        await asyncio.sleep(delay)
                        continue
                    else:
                        self.logger.error(f"Request failed after {self.retry_config.max_retries} retries: {e}")
                        self.errors.append(f"Request failed for {url}: {e}")
                        return None
            
            return None
    
    async def fetch_page_async(self, url: str) -> Optional[bytes]:
        """Fetch a webpage asynchronously with error handling"""
        try:
            response = await self._rate_limited_request('GET', url)
            if response:
                content = await response.read()
                self.session_stats['bytes_downloaded'] += len(content)
                return content
        except Exception as e:
            self.logger.error(f"Error fetching {url}: {e}")
            self.errors.append(f"Error fetching {url}: {e}")
        
        return None
    
    def _update_progress(self, **kwargs):
        """Update progress and notify callback"""
        for key, value in kwargs.items():
            if hasattr(self.progress, key):
                setattr(self.progress, key, value)
        
        if self.progress_callback:
            try:
                self.progress_callback(self.progress)
            except Exception as e:
                self.logger.warning(f"Error in progress callback: {e}")
    
    @abstractmethod
    async def find_pdf_links_async(self, html_content: bytes, page_url: str) -> List[Dict[str, Any]]:
        """Extract PDF links from HTML content asynchronously"""
        pass
    
    @abstractmethod
    async def handle_pagination_async(self, soup: BeautifulSoup, current_url: str) -> Optional[str]:
        """Handle pagination and return next page URL if exists"""
        pass
    
    async def validate_document(self, doc_data: Dict[str, Any]) -> bool:
        """Validate document data quality"""
        required_fields = ['url', 'filename', 'title']
        
        # Check required fields
        for field in required_fields:
            if not doc_data.get(field):
                self.logger.warning(f"Document missing required field: {field}")
                return False
        
        # Validate URL
        if not validators.url(doc_data['url']):
            self.logger.warning(f"Invalid URL: {doc_data['url']}")
            return False
        
        # Check filename
        filename = doc_data['filename']
        if not filename.endswith('.pdf'):
            self.logger.warning(f"Non-PDF file: {filename}")
            return False
        
        # Validate title length
        if len(doc_data['title']) < 3:
            self.logger.warning(f"Title too short: {doc_data['title']}")
            return False
        
        return True
    
    async def scrape_all_pages_async(self) -> List[Dict[str, Any]]:
        """Scrape PDFs from all pages asynchronously"""
        all_pdfs = []
        current_url = self.search_url
        page_num = 1
        processed_urls = set()
        
        self._update_progress(current_stage="discovering_pages")
        
        while current_url and not self._cancellation_token.is_set():
            if current_url in processed_urls:
                self.logger.warning(f"Circular reference detected: {current_url}")
                break
            
            processed_urls.add(current_url)
            
            self.logger.info(f"Fetching page {page_num}: {current_url}")
            self._update_progress(
                processed_pages=page_num - 1,
                current_stage=f"processing_page_{page_num}"
            )
            
            # Check memory usage
            if not await self._check_memory_usage():
                self.logger.warning("Memory limit exceeded, stopping scrape")
                break
            
            html_content = await self.fetch_page_async(current_url)
            if not html_content:
                self.logger.warning(f"Failed to fetch page {page_num}")
                break
            
            try:
                soup = BeautifulSoup(html_content, 'html.parser')
                
                # Find PDFs on current page
                pdfs = await self.find_pdf_links_async(html_content, current_url)
                
                # Validate documents
                valid_pdfs = []
                for pdf in pdfs:
                    if await self.validate_document(pdf):
                        valid_pdfs.append(pdf)
                    else:
                        self.errors.append(f"Invalid document data: {pdf}")
                
                if valid_pdfs:
                    self.logger.info(f"Found {len(valid_pdfs)} valid PDFs on page {page_num}")
                    all_pdfs.extend(valid_pdfs)
                else:
                    self.logger.warning(f"No valid PDFs found on page {page_num}")
                
                self._update_progress(
                    processed_pages=page_num,
                    total_documents=len(all_pdfs)
                )
                
                # Check for next page
                next_url = await self.handle_pagination_async(soup, current_url)
                
                if next_url and next_url != current_url:
                    current_url = next_url
                    page_num += 1
                    # Be respectful to the server
                    await asyncio.sleep(1 / self.resource_limits.rate_limit_requests_per_second)
                else:
                    break
                    
            except Exception as e:
                self.logger.error(f"Error processing page {page_num}: {e}")
                self.errors.append(f"Error processing page {page_num}: {e}")
                break
        
        self._update_progress(
            total_pages=page_num,
            processed_pages=page_num,
            current_stage="completed"
        )
        
        return all_pdfs
    
    async def run_scrape_async(self) -> Dict[str, Any]:
        """Main async execution method"""
        start_time = time.time()
        self.status = ScrapingStatus.RUNNING
        
        try:
            self.logger.info(f"Starting async scrape for municipality {self.municipality_id}")
            
            # Scrape all pages
            self.logger.info("Searching for PDFs...")
            all_pdfs = await self.scrape_all_pages_async()
            
            if not all_pdfs:
                self.logger.warning("No PDFs found. The website structure might have changed.")
                self.status = ScrapingStatus.COMPLETED
                return self.get_scrape_summary()
            
            # Remove duplicates based on URL
            unique_pdfs = []
            seen_urls = set()
            for pdf in all_pdfs:
                if pdf['url'] not in seen_urls:
                    unique_pdfs.append(pdf)
                    seen_urls.add(pdf['url'])
                else:
                    self.logger.debug(f"Duplicate URL removed: {pdf['url']}")
            
            self.logger.info(f"Total unique PDFs found: {len(unique_pdfs)}")
            
            # Store documents found
            self.documents_found = unique_pdfs
            self.status = ScrapingStatus.COMPLETED
            
            # Record final metrics
            total_time = time.time() - start_time
            self.performance_monitor.record_metric('total_scrape_time', total_time)
            
            summary = self.get_scrape_summary()
            self.logger.info(f"Scraping completed successfully: {summary}")
            
            return summary
            
        except asyncio.CancelledError:
            self.logger.info("Scraping was cancelled")
            self.status = ScrapingStatus.CANCELLED
            raise
        except Exception as e:
            self.logger.error(f"Scraping failed: {e}")
            self.logger.error(traceback.format_exc())
            self.status = ScrapingStatus.FAILED
            self.errors.append(f"Scraping failed: {e}")
            return self.get_scrape_summary()
        finally:
            await self.cleanup()
    
    def cancel_scraping(self):
        """Cancel the scraping operation"""
        self.logger.info("Cancelling scraping operation")
        self._cancellation_token.set()
    
    async def cleanup(self):
        """Clean up resources"""
        try:
            if self._session and not self._session.closed:
                await self._session.close()
            
            # Clear memory references
            self._memory_tracker.clear()
            gc.collect()
            
            self.logger.info("Cleanup completed")
        except Exception as e:
            self.logger.warning(f"Error during cleanup: {e}")
    
    def get_scrape_summary(self) -> Dict[str, Any]:
        """Get comprehensive summary of scraping results"""
        return {
            'municipality_id': self.municipality_id,
            'status': self.status.value,
            'documents_found': len(self.documents_found),
            'errors': self.errors,
            'scrape_date': datetime.utcnow().isoformat(),
            'progress': {
                'total_pages': self.progress.total_pages,
                'processed_pages': self.progress.processed_pages,
                'progress_percentage': self.progress.progress_percentage,
                'elapsed_time': str(self.progress.elapsed_time),
                'current_stage': self.progress.current_stage
            },
            'performance': self.performance_monitor.get_summary(),
            'session_stats': self.session_stats
        }
    
    def __del__(self):
        """Destructor to ensure cleanup"""
        try:
            if hasattr(self, '_session') and self._session and not self._session.closed:
                # Can't await in __del__, so we'll just close synchronously
                # This is not ideal but better than leaving connections open
                loop = None
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        loop.create_task(self._session.close())
                    else:
                        loop.run_until_complete(self._session.close())
                except RuntimeError:
                    # Event loop is closed or not available
                    pass
        except Exception:
            # Ignore errors in destructor
            pass
