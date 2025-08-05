"""
Supabase-Integrated Base Scraper - Enhanced base for all municipality scrapers
Replaces Redis dependencies with direct Supabase integration and file-based progress tracking
"""

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import List, Dict, Optional, Set
import requests
from bs4 import BeautifulSoup
import time
import os
import re
from urllib.parse import urljoin, urlparse
import logging

from .supabase_client import get_supabase_client


class BaseSupabaseScraper(ABC):
    """Enhanced base class for municipality scrapers with Supabase integration"""
    
    def __init__(self, municipality_id: int, municipality_name: str, base_url: str, search_url: str, 
                 job_id: Optional[str] = None, enable_progress_reporting: bool = True):
        self.municipality_id = municipality_id
        self.municipality_name = municipality_name
        self.base_url = base_url
        self.search_url = search_url
        self.job_id = job_id
        
        # Get Supabase client
        self.supabase_client = get_supabase_client()
        
        # HTTP session setup
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        
        # Tracking variables
        self.documents_found = []
        self.documents_saved = 0
        self.errors = []
        self.processed_urls = set()
        self.logger = self._setup_logger()
        
        # Progress tracking
        self.enable_progress_reporting = enable_progress_reporting
        self.estimated_total_pages = 0
        self.current_page_number = 0
        self.start_time = None
        
    def _setup_logger(self):
        """Set up logging for the scraper"""
        logger = logging.getLogger(f"scraper.{self.municipality_name.lower().replace(' ', '_')}")
        logger.setLevel(logging.INFO)
        
        # Add handler if not already present
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    def _report_progress(self, message: str, progress_percent: Optional[int] = None) -> None:
        """Report progress to Supabase and file system"""
        if not self.enable_progress_reporting or not self.job_id:
            return
            
        try:
            # Calculate progress if not provided
            if progress_percent is None and self.estimated_total_pages > 0:
                progress_percent = min(100, int((self.current_page_number / self.estimated_total_pages) * 100))
            elif progress_percent is None:
                progress_percent = 0
            
            # Update job progress in Supabase
            success = self.supabase_client.update_job_progress(
                job_id=self.job_id,
                progress=progress_percent,
                message=message,
                status='running'
            )
            
            if success:
                self.logger.info(f"Progress {progress_percent}%: {message}")
            else:
                self.logger.warning(f"Failed to update progress in database: {message}")
                
        except Exception as e:
            self.logger.error(f"Error reporting progress: {e}")
    
    def _report_error(self, error_message: str, url: Optional[str] = None, critical: bool = False) -> None:
        """Report an error"""
        full_message = error_message
        if url:
            full_message += f" at {url}"
        
        self.errors.append(full_message)
        self.logger.error(full_message)
        
        if self.job_id:
            # Update job with error (but don't fail unless critical)
            error_progress_message = f"Error: {error_message}"
            if not critical:
                error_progress_message += " (continuing...)"
            
            self._report_progress(error_progress_message)
    
    def _save_document(self, pdf_info: Dict) -> bool:
        """Save document to Supabase database"""
        try:
            doc_id = self.supabase_client.save_document(
                municipality_id=self.municipality_id,
                title=pdf_info['title'],
                url=pdf_info['url'],
                filename=pdf_info['filename'],
                file_size=pdf_info.get('file_size'),
                content_hash=pdf_info.get('content_hash'),
                storage_path=pdf_info.get('storage_path')
            )
            
            if doc_id:
                self.documents_saved += 1
                self.logger.info(f"Saved document {doc_id}: {pdf_info['title']}")
                return True
            else:
                self.logger.warning(f"Failed to save document: {pdf_info['title']}")
                return False
                
        except Exception as e:
            self.logger.error(f"Error saving document {pdf_info['title']}: {e}")
            return False
    
    def fetch_page(self, url: str, timeout: int = 30) -> Optional[requests.Response]:
        """Fetch a webpage with error handling and retry logic"""
        max_retries = 3
        retry_delay = 1
        
        for attempt in range(max_retries):
            try:
                response = self.session.get(url, timeout=timeout)
                response.raise_for_status()
                return response
                
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    self.logger.warning(f"Attempt {attempt + 1} failed for {url}: {e}. Retrying...")
                    time.sleep(retry_delay * (attempt + 1))
                else:
                    error_msg = f"Failed to fetch {url} after {max_retries} attempts: {e}"
                    self._report_error(error_msg, url)
                    return None
    
    def extract_pdf_links(self, soup: BeautifulSoup, page_url: str) -> List[Dict]:
        """Extract all PDF links from a page"""
        pdf_links = []
        
        # Find all links
        for link in soup.find_all('a', href=True):
            href = link['href']
            
            # Check if it's a PDF link
            if self.is_pdf_link(href):
                full_url = urljoin(page_url, href)
                
                # Skip if already processed
                if full_url in self.processed_urls:
                    continue
                    
                self.processed_urls.add(full_url)
                
                # Extract title and metadata
                title = self.extract_title(link, href)
                filename = self.extract_filename(full_url)
                metadata = self.extract_metadata(link, soup)
                
                pdf_info = {
                    'url': full_url,
                    'filename': filename,
                    'title': title,
                    'source_page': page_url,
                    **metadata
                }
                
                pdf_links.append(pdf_info)
                
        return pdf_links
    
    def is_pdf_link(self, href: str) -> bool:
        """Check if a link is a PDF"""
        if not href:
            return False
            
        # Direct PDF link
        if href.lower().endswith('.pdf'):
            return True
            
        # Common PDF URL patterns
        pdf_patterns = [
            r'/download/.*pdf',
            r'/attachment/.*pdf',
            r'/file/.*pdf',
            r'/documents?/.*pdf',
            r'/bylaws?/.*pdf',
            r'[?&]format=pdf',
            r'[?&]type=pdf'
        ]
        
        for pattern in pdf_patterns:
            if re.search(pattern, href, re.IGNORECASE):
                return True
                
        return False
    
    def extract_title(self, link_element, href: str) -> str:
        """Extract title from link element"""
        # Try link text first
        title = link_element.get_text(strip=True)
        if title and len(title) > 3:
            return title
            
        # Try title attribute
        if link_element.get('title'):
            return link_element['title'].strip()
            
        # Try aria-label
        if link_element.get('aria-label'):
            return link_element['aria-label'].strip()
            
        # Fall back to filename
        return os.path.basename(urlparse(href).path).replace('.pdf', '').replace('-', ' ').title()
    
    def extract_filename(self, url: str) -> str:
        """Extract filename from URL"""
        filename = os.path.basename(urlparse(url).path)
        
        # Ensure it has .pdf extension
        if not filename.endswith('.pdf'):
            filename = f"{filename}.pdf"
            
        # Sanitize filename
        filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
        
        return filename
    
    def extract_metadata(self, link_element, soup: BeautifulSoup) -> Dict:
        """Extract additional metadata from the page context"""
        metadata = {}
        
        # Try to find bylaw number from parent elements
        parent_text = ""
        parent = link_element.parent
        if parent:
            parent_text = parent.get_text()
            
        # Look for bylaw number patterns
        bylaw_match = re.search(r'(?:by-?law|bylaw)\s*(?:no\.?|number|#)?\s*(\d{1,4}[-\s]?\d{1,4})', 
                               parent_text, re.IGNORECASE)
        if bylaw_match:
            metadata['bylaw_number'] = bylaw_match.group(1)
            
        # Look for date patterns
        date_match = re.search(r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})', parent_text)
        if date_match:
            metadata['document_date'] = date_match.group(1)
            
        return metadata
    
    def scrape_single_page(self, url: str, page_number: int, total_pages: int) -> List[Dict]:
        """Scrape a single page for PDFs"""
        self.logger.info(f"Scraping page {page_number}/{total_pages}: {url}")
        
        response = self.fetch_page(url)
        if not response:
            return []
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Extract basic PDF links
        pdf_links = self.extract_pdf_links(soup, url)
        
        # Add municipality-specific additional PDFs
        additional_pdfs = self.find_additional_pdfs(soup, url)
        if additional_pdfs:
            pdf_links.extend(additional_pdfs)
        
        # Report progress
        self._report_progress(f"Processed page {page_number}/{total_pages}: found {len(pdf_links)} PDFs")
        
        return pdf_links
    
    def run_scrape(self) -> Dict:
        """Main scraping execution method with Supabase integration"""
        self.start_time = datetime.now(timezone.utc)
        self.logger.info(f"Starting scrape for {self.municipality_name} (ID: {self.municipality_id})")
        
        # Create job if not provided
        if not self.job_id and self.enable_progress_reporting:
            try:
                self.job_id = self.supabase_client.create_scraper_job(
                    municipality_id=self.municipality_id,
                    scraper_name=self.__class__.__name__.lower()
                )
                self.logger.info(f"Created job {self.job_id}")
            except Exception as e:
                self.logger.error(f"Failed to create job: {e}")
                # Continue without job tracking
        
        # Update municipality status
        self.supabase_client.update_municipality_status(
            municipality_id=self.municipality_id,
            status='running'
        )
        
        try:
            # Initialize progress
            self._report_progress("Initializing scrape", 0)
            
            # Get URLs to process
            urls_to_process = [self.search_url]
            category_urls = self.get_category_urls()
            if category_urls:
                urls_to_process.extend(category_urls)
            
            self.estimated_total_pages = len(urls_to_process)
            self.logger.info(f"Processing {len(urls_to_process)} URLs")
            
            # Process all URLs
            all_pdfs = []
            for url_index, url in enumerate(urls_to_process):
                if url in self.processed_urls:
                    continue
                
                self.current_page_number = url_index + 1
                
                # Scrape the page
                pdfs = self.scrape_single_page(url, self.current_page_number, len(urls_to_process))
                
                # Save documents to database
                for pdf_info in pdfs:
                    if self._save_document(pdf_info):
                        all_pdfs.append(pdf_info)
                
                # Handle pagination if needed
                response = self.fetch_page(url)
                if response:
                    soup = BeautifulSoup(response.content, 'html.parser')
                    pagination_urls = self.get_pagination_urls(soup, url)
                    
                    if pagination_urls:
                        self.logger.info(f"Found {len(pagination_urls)} pagination URLs")
                        # Process pagination pages
                        for page_url in pagination_urls:
                            if page_url not in self.processed_urls:
                                page_pdfs = self.scrape_single_page(page_url, 
                                                                  self.current_page_number, 
                                                                  len(urls_to_process))
                                for pdf_info in page_pdfs:
                                    if self._save_document(pdf_info):
                                        all_pdfs.append(pdf_info)
            
            # Calculate final results
            documents_found = len(all_pdfs)
            documents_new = self.documents_saved
            
            # Log results to database
            status = 'success' if documents_found > 0 else 'partial'
            duration_seconds = (datetime.now(timezone.utc) - self.start_time).total_seconds()
            
            self.supabase_client.log_scrape_result(
                municipality_id=self.municipality_id,
                status=status,
                documents_found=documents_found,
                documents_new=documents_new,
                job_id=self.job_id,
                duration_seconds=duration_seconds
            )
            
            # Update municipality status
            self.supabase_client.update_municipality_status(
                municipality_id=self.municipality_id,
                status='active',
                last_run=self.start_time.isoformat()
            )
            
            # Complete job
            if self.job_id:
                result_data = {
                    'documents_found': documents_found,
                    'documents_new': documents_new,
                    'duration_seconds': duration_seconds,
                    'errors': self.errors
                }
                self.supabase_client.complete_job(
                    job_id=self.job_id,
                    success=True,
                    result_data=result_data
                )
            
            self.logger.info(f"Scrape completed: {documents_found} documents found, {documents_new} saved")
            
            return {
                'municipality_id': self.municipality_id,
                'municipality_name': self.municipality_name,
                'status': 'success',
                'documents_found': documents_found,
                'documents_new': documents_new,
                'errors': self.errors,
                'duration_seconds': duration_seconds
            }
            
        except Exception as e:
            error_message = f"Scrape failed for {self.municipality_name}: {e}"
            self.logger.error(error_message)
            
            # Log error result
            if self.start_time:
                duration_seconds = (datetime.now(timezone.utc) - self.start_time).total_seconds()
            else:
                duration_seconds = 0
                
            self.supabase_client.log_scrape_result(
                municipality_id=self.municipality_id,
                status='error',
                documents_found=len(all_pdfs) if 'all_pdfs' in locals() else 0,
                documents_new=self.documents_saved,
                job_id=self.job_id,
                error_message=str(e),
                duration_seconds=duration_seconds
            )
            
            # Update municipality status
            self.supabase_client.update_municipality_status(
                municipality_id=self.municipality_id,
                status='error'
            )
            
            # Fail job
            if self.job_id:
                self.supabase_client.complete_job(
                    job_id=self.job_id,
                    success=False,
                    error_message=error_message
                )
            
            return {
                'municipality_id': self.municipality_id,
                'municipality_name': self.municipality_name,
                'status': 'error',
                'error': str(e),
                'documents_found': 0,
                'documents_new': 0,
                'duration_seconds': duration_seconds
            }
    
    # Abstract methods that subclasses must implement
    @abstractmethod
    def get_category_urls(self) -> List[str]:
        """Return list of category URLs to scrape (in addition to search_url)"""
        return []
    
    def find_additional_pdfs(self, soup: BeautifulSoup, page_url: str) -> List[Dict]:
        """Find additional PDFs using municipality-specific logic"""
        return []
    
    def get_pagination_urls(self, soup: BeautifulSoup, current_url: str) -> List[str]:
        """Find pagination URLs on the current page"""
        return []