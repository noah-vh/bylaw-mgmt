"""
Base V2 Scraper - Simplified and efficient base for all municipality scrapers

Enhanced with local progress reporting for offline operation.
All Redis/SSE dependencies have been removed for local-only operation.
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Dict, Optional, Set
import requests
from bs4 import BeautifulSoup
import time
import os
import re
from urllib.parse import urljoin, urlparse
import logging


class BaseScraperV2(ABC):
    """Enhanced base class for v2 municipality scrapers - offline only"""
    
    def __init__(self, municipality_id: int, municipality_name: str, base_url: str, search_url: str, 
                 job_id: str = None, enable_progress_reporting: bool = True):
        self.municipality_id = municipality_id
        self.municipality_name = municipality_name
        self.base_url = base_url
        self.search_url = search_url
        self.job_id = job_id
        
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        self.documents_found = []
        self.errors = []
        self.processed_urls = set()  # Track processed URLs to avoid duplicates
        self.logger = self._setup_logger()
        
        # Local progress reporting (no Redis)
        self.enable_progress_reporting = enable_progress_reporting
        self.progress_entries = []
        
        # Additional tracking for enhanced progress reporting
        self.estimated_total_pages = 0
        self.current_page_number = 0
        self.total_pages_to_process = []
        
    def _setup_logger(self):
        """Set up logging for the scraper"""
        logger = logging.getLogger(f"scraper.{self.municipality_name.lower().replace(' ', '_')}")
        logger.setLevel(logging.INFO)
        return logger
    
    def _report_progress(self, message: str, current: int = None, total: int = None) -> None:
        """Report progress locally (no Redis)"""
        if self.enable_progress_reporting:
            entry = {
                'timestamp': datetime.utcnow().isoformat(),
                'message': message,
                'current': current,
                'total': total,
                'municipality_id': self.municipality_id
            }
            self.progress_entries.append(entry)
            
            if current is not None and total is not None:
                self.logger.info(f"{message} ({current}/{total})")
            else:
                self.logger.info(message)
    
    def _report_stage_change(self, stage: str, message: str = None) -> None:
        """Report a stage change locally"""
        if self.enable_progress_reporting:
            stage_message = message or f"Stage: {stage}"
            self._report_progress(stage_message)
    
    def _report_page_visit(self, page_url: str, page_number: int, total_pages: int, 
                          pdfs_found: int = 0, response_time_ms: int = None) -> None:
        """Report visiting a page locally"""
        if self.enable_progress_reporting:
            message = f"Visited page {page_number}/{total_pages}: {pdfs_found} PDFs found"
            if response_time_ms:
                message += f" ({response_time_ms}ms)"
            self._report_progress(message, page_number, total_pages)
    
    def _report_pdf_discovery(self, pdf_url: str, pdf_title: str, source_page: str,
                             bylaw_number: str = None, document_date: str = None) -> None:
        """Report PDF discovery locally"""
        if self.enable_progress_reporting:
            message = f"Found PDF: {pdf_title}"
            if bylaw_number:
                message += f" (Bylaw {bylaw_number})"
            self._report_progress(message)
    
    def _report_error(self, error_message: str, url: str = None, recoverable: bool = True) -> None:
        """Report an error locally"""
        if self.enable_progress_reporting:
            full_message = error_message
            if url:
                full_message += f" at {url}"
            self._report_progress(f"ERROR: {full_message}")
        
    def fetch_page(self, url: str, timeout: int = 30) -> Optional[requests.Response]:
        """Fetch a webpage with error handling and retry logic"""
        max_retries = 3
        retry_delay = 1
        start_time = time.time()
        
        for attempt in range(max_retries):
            try:
                response = self.session.get(url, timeout=timeout)
                response.raise_for_status()
                
                # Calculate response time and report if successful
                response_time_ms = int((time.time() - start_time) * 1000)
                return response
                
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    self.logger.warning(f"Attempt {attempt + 1} failed for {url}: {e}. Retrying...")
                    time.sleep(retry_delay * (attempt + 1))
                else:
                    error_msg = f"Failed to fetch {url} after {max_retries} attempts: {e}"
                    self.logger.error(error_msg)
                    self.errors.append(f"Error fetching {url}: {e}")
                    self._report_error(error_msg, url, recoverable=True)
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
                
                # Extract title
                title = self.extract_title(link, href)
                filename = self.extract_filename(full_url)
                
                pdf_info = {
                    'url': full_url,
                    'filename': filename,
                    'title': title,
                    'source_page': page_url
                }
                
                # Try to extract additional metadata
                metadata = self.extract_metadata(link, soup)
                if metadata:
                    pdf_info.update(metadata)
                
                pdf_links.append(pdf_info)
                
                # Report PDF discovery
                self._report_pdf_discovery(
                    pdf_url=full_url,
                    pdf_title=title,
                    source_page=page_url,
                    bylaw_number=metadata.get('bylaw_number') if metadata else None,
                    document_date=metadata.get('document_date') if metadata else None
                )
                
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
        
        # Try to find bylaw number
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
        date_match = re.search(r'(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|'
                              r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})',
                              parent_text)
        if date_match:
            metadata['document_date'] = date_match.group(1)
            
        return metadata
    
    def scrape_single_page(self, url: str, page_number: int = None, total_pages: int = None) -> List[Dict]:
        """Scrape PDFs from a single page"""
        self.logger.info(f"Scraping page: {url}")
        
        start_time = time.time()
        response = self.fetch_page(url)
        if not response:
            return []
        
        response_time_ms = int((time.time() - start_time) * 1000)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Extract PDFs using base method
        pdfs = self.extract_pdf_links(soup, url)
        
        # Allow subclasses to find additional PDFs
        additional_pdfs = self.find_additional_pdfs(soup, url)
        if additional_pdfs:
            for pdf in additional_pdfs:
                if pdf['url'] not in self.processed_urls:
                    pdfs.append(pdf)
                    self.processed_urls.add(pdf['url'])
                    # Report additional PDF discoveries
                    self._report_pdf_discovery(
                        pdf_url=pdf['url'],
                        pdf_title=pdf.get('title', 'Unknown PDF'),
                        source_page=url,
                        bylaw_number=pdf.get('bylaw_number'),
                        document_date=pdf.get('document_date')
                    )
        
        # Report page visit with progress information
        if page_number is not None and total_pages is not None:
            self._report_page_visit(url, page_number, total_pages, len(pdfs), response_time_ms)
        
        self.logger.info(f"Found {len(pdfs)} PDFs on page: {url}")
        return pdfs
    
    def find_additional_pdfs(self, soup: BeautifulSoup, page_url: str) -> List[Dict]:
        """Override in subclasses to implement custom PDF finding logic"""
        return []
    
    def get_pagination_urls(self, soup: BeautifulSoup, current_url: str) -> List[str]:
        """Override in subclasses to implement pagination"""
        return []
    
    def get_category_urls(self) -> List[str]:
        """Override in subclasses to provide category/section URLs"""
        return []
    
    def run_scrape(self) -> Dict:
        """Main execution method with enhanced progress tracking"""
        self.logger.info(f"Starting scrape for {self.municipality_name} (ID: {self.municipality_id})")
        start_time = time.time()
        
        # Initialize progress reporting
        self._report_stage_change("INITIALIZING", f"Initializing scrape for {self.municipality_name}")
        
        all_pdfs = []
        urls_to_process = [self.search_url]
        
        # Stage: Fetching Categories
        self._report_stage_change("FETCHING_CATEGORIES", "Identifying URLs to process")
        
        # Add category URLs if defined
        category_urls = self.get_category_urls()
        if category_urls:
            urls_to_process.extend(category_urls)
            self.logger.info(f"Found {len(category_urls)} category URLs to process")
        
        # Estimate total pages for better progress reporting
        self.estimated_total_pages = len(urls_to_process)
        self.total_pages_to_process = urls_to_process.copy()
        
        # Stage: Scraping Pages
        self._report_stage_change("SCRAPING_PAGES", f"Beginning to scrape {len(urls_to_process)} main URLs")
        
        # Process all URLs
        for url_index, url in enumerate(urls_to_process):
            if url in self.processed_urls:
                continue
            
            self.current_page_number = url_index + 1
            self.logger.info(f"Processing URL {self.current_page_number}/{len(urls_to_process)}: {url}")
            
            # Scrape the page with progress information
            pdfs = self.scrape_single_page(url, self.current_page_number, len(urls_to_process))
            all_pdfs.extend(pdfs)
            
            # Handle pagination
            response = self.fetch_page(url)
            if response:
                soup = BeautifulSoup(response.content, 'html.parser')
                pagination_urls = self.get_pagination_urls(soup, url)
                
                if pagination_urls:
                    self.logger.info(f"Found {len(pagination_urls)} pagination URLs for {url}")
                    # Update total pages estimate
                    additional_pages = len(pagination_urls)
                    self.estimated_total_pages += additional_pages
                    
                    for page_index, page_url in enumerate(pagination_urls):
                        if page_url not in self.processed_urls:
                            page_number = self.current_page_number + page_index + 1
                            page_pdfs = self.scrape_single_page(page_url, page_number, 
                                                              self.estimated_total_pages)
                            all_pdfs.extend(page_pdfs)
                            time.sleep(0.5)  # Be respectful
            
            # Report progress after each main URL
            self._report_progress(f"Completed URL {self.current_page_number}/{len(urls_to_process)}", 
                                self.current_page_number, len(urls_to_process))
            
            time.sleep(0.5)  # Be respectful between different sections
        
        # Stage: Validating Links
        self._report_stage_change("VALIDATING_LINKS", f"Validating {len(all_pdfs)} discovered PDFs")
        
        # Stage: Extracting Metadata (already done during scraping, but report completion)
        self._report_stage_change("EXTRACTING_METADATA", "Finalizing metadata extraction")
        
        # Stage: Finalizing
        self._report_stage_change("FINALIZING", "Completing scrape operation")
        
        # Store results
        self.documents_found = all_pdfs
        
        # Log summary
        elapsed_time = time.time() - start_time
        self.logger.info(f"Scraping completed for {self.municipality_name}")
        self.logger.info(f"Found {len(all_pdfs)} PDFs in {elapsed_time:.2f} seconds")
        if self.errors:
            self.logger.warning(f"Encountered {len(self.errors)} errors")
        
        return {
            'municipality_id': self.municipality_id,
            'municipality_name': self.municipality_name,
            'documents_found': len(self.documents_found),
            'documents': self.documents_found,
            'errors': self.errors,
            'scrape_date': datetime.utcnow().isoformat(),
            'elapsed_time': elapsed_time,
            'progress_reporting_enabled': self.enable_progress_reporting,
            'progress_entries': self.progress_entries,
            'total_pages_visited': getattr(self, 'current_page_number', 0),
            'offline_mode': True,
            'redis_dependencies_removed': True
        }