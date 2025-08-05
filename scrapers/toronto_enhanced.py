"""
Toronto Enhanced Scraper
Demonstrates the new enhanced scraper architecture with all production features
"""

import asyncio
import re
from typing import List, Dict, Any, Optional
from urllib.parse import urljoin, urlparse
import os
from pathlib import Path
from bs4 import BeautifulSoup

from .enhanced_base import EnhancedScraper, ScrapingProgress
from .logging_system import get_logger, LogLevel, EventType
from .data_validation import validate_document
from .config_manager import get_config_manager


class TorontoEnhancedScraper(EnhancedScraper):
    """Enhanced Toronto municipality scraper with full production features"""
    
    def __init__(
        self,
        municipality_id: int,
        base_url: str = "https://www.toronto.ca",
        search_url: str = "https://www.toronto.ca/legdocs/bylaws/",
        **kwargs
    ):
        # Load configuration
        config_manager = get_config_manager()
        scraper_config = config_manager.get_effective_config("toronto_enhanced", municipality_id)
        
        # Update resource limits and retry config from configuration
        from .enhanced_base import ResourceLimits, RetryConfig
        
        resource_limits = ResourceLimits(
            max_concurrent_requests=scraper_config.get('max_concurrent_requests', 10),
            max_memory_mb=scraper_config.get('max_memory_mb', 512),
            request_timeout_seconds=scraper_config.get('request_timeout_seconds', 30),
            rate_limit_requests_per_second=scraper_config.get('rate_limit_requests_per_second', 2.0),
            max_response_size_mb=scraper_config.get('max_response_size_mb', 100)
        )
        
        retry_config = RetryConfig(
            max_retries=scraper_config.get('max_retries', 3),
            base_delay=scraper_config.get('base_delay', 1.0),
            max_delay=scraper_config.get('max_delay', 60.0),
            exponential_base=scraper_config.get('exponential_base', 2.0),
            backoff_strategy=scraper_config.get('backoff_strategy', 'exponential')
        )
        
        # Set up structured logger
        logger = get_logger(
            name=f"toronto_scraper_{municipality_id}",
            log_level=getattr(LogLevel, scraper_config.get('log_level', 'INFO')),
            log_file=f"logs/toronto_scraper_{municipality_id}.log"
        )
        
        super().__init__(
            municipality_id=municipality_id,
            base_url=base_url,
            search_url=search_url,
            retry_config=retry_config,
            resource_limits=resource_limits,
            logger=logger,
            **kwargs
        )
        
        # Toronto-specific configuration
        self.scraper_config = scraper_config
        self.municipal_code_url = "https://www.toronto.ca/legdocs/bylaws/lawmcode.htm"
        self.year_range = scraper_config.get('year_range', [2022, 2023, 2024])
        self.enable_municipal_code = scraper_config.get('enable_municipal_code', True)
        self.enable_year_directories = scraper_config.get('enable_year_directories', True)
        
        # Performance tracking
        self.pages_processed = 0
        self.documents_validated = 0
        self.validation_failures = 0
        
        self.logger.info(
            "Toronto enhanced scraper initialized",
            {
                'municipality_id': municipality_id,
                'base_url': base_url,
                'search_url': search_url,
                'year_range': self.year_range,
                'municipal_code_enabled': self.enable_municipal_code
            },
            municipality_id=municipality_id,
            scraper_name="toronto_enhanced"
        )
    
    async def find_pdf_links_async(self, html_content: bytes, page_url: str) -> List[Dict[str, Any]]:
        """Extract PDF links from HTML content using Toronto's patterns"""
        start_time = asyncio.get_event_loop().time()
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            pdf_links = []
            
            self.logger.debug(
                f"Extracting PDF links from page: {page_url}",
                {'page_url': page_url, 'content_size': len(html_content)},
                municipality_id=self.municipality_id,
                scraper_name="toronto_enhanced"
            )
            
            # Strategy 1: Direct PDF links
            for link in soup.find_all('a', href=True):
                href = link['href']
                if href.endswith('.pdf'):
                    full_url = urljoin(self.base_url, href)
                    link_text = link.get_text(strip=True)
                    filename = os.path.basename(urlparse(full_url).path)
                    
                    # Create document data
                    doc_data = {
                        'url': full_url,
                        'filename': self.sanitize_filename(filename),
                        'title': link_text or filename,
                        'source_page': page_url,
                        'link_type': 'direct_pdf',
                        'discovered_at': asyncio.get_event_loop().time()
                    }
                    
                    pdf_links.append(doc_data)
            
            # Strategy 2: Municipal code chapter links
            if 'municode' in page_url or 'lawmcode' in page_url:
                for link in soup.find_all('a', href=True):
                    href = link['href']
                    if '/municode/1184_' in href and href.endswith('.pdf'):
                        full_url = urljoin(self.base_url, href)
                        link_text = link.get_text(strip=True)
                        filename = os.path.basename(urlparse(full_url).path)
                        
                        doc_data = {
                            'url': full_url,
                            'filename': self.sanitize_filename(filename),
                            'title': f"Municipal Code - {link_text}",
                            'source_page': page_url,
                            'link_type': 'municipal_code',
                            'chapter': self._extract_chapter_number(href),
                            'discovered_at': asyncio.get_event_loop().time()
                        }
                        
                        pdf_links.append(doc_data)
            
            # Strategy 3: Year directory bylaw links
            if '/bylaws/' in page_url and any(year in page_url for year in map(str, self.year_range)):
                for link in soup.find_all('a', href=True):
                    href = link['href']
                    if href.endswith('.pdf') and '/bylaws/' in href:
                        full_url = urljoin(self.base_url, href)
                        link_text = link.get_text(strip=True)
                        filename = os.path.basename(urlparse(full_url).path)
                        
                        doc_data = {
                            'url': full_url,
                            'filename': self.sanitize_filename(filename),
                            'title': link_text or filename,
                            'source_page': page_url,
                            'link_type': 'year_directory',
                            'year': self._extract_year_from_url(href),
                            'bylaw_number': self._extract_bylaw_number(filename),
                            'discovered_at': asyncio.get_event_loop().time()
                        }
                        
                        pdf_links.append(doc_data)
            
            # Validate documents if enabled
            if self.scraper_config.get('validate_documents', True):
                validated_links = []
                for doc_data in pdf_links:
                    try:
                        validation_result = await validate_document(doc_data)
                        self.documents_validated += 1
                        
                        if validation_result.is_valid or validation_result.score >= 0.5:
                            # Add validation metadata
                            doc_data['validation'] = {
                                'is_valid': validation_result.is_valid,
                                'score': validation_result.score,
                                'issues_count': len(validation_result.issues)
                            }
                            validated_links.append(doc_data)
                        else:
                            self.validation_failures += 1
                            self.logger.warning(
                                f"Document failed validation: {doc_data['url']}",
                                {
                                    'validation_score': validation_result.score,
                                    'issues': [issue.to_dict() for issue in validation_result.issues[:3]]  # First 3 issues
                                },
                                municipality_id=self.municipality_id,
                                scraper_name="toronto_enhanced"
                            )
                    except Exception as validation_error:
                        self.logger.warning(
                            f"Validation error for document: {doc_data['url']}",
                            {'error': str(validation_error)},
                            municipality_id=self.municipality_id,
                            scraper_name="toronto_enhanced"
                        )
                        # Include document even if validation fails
                        validated_links.append(doc_data)
                
                pdf_links = validated_links
            
            # Record performance metrics
            duration = asyncio.get_event_loop().time() - start_time
            self.performance_monitor.record_metric('pdf_extraction_duration', duration * 1000)  # Convert to ms
            self.performance_monitor.record_metric('pdfs_found_per_page', len(pdf_links))
            
            self.logger.info(
                f"Extracted {len(pdf_links)} PDF links from page",
                {
                    'page_url': page_url,
                    'pdfs_found': len(pdf_links),
                    'extraction_time_ms': duration * 1000,
                    'documents_validated': self.documents_validated,
                    'validation_failures': self.validation_failures
                },
                municipality_id=self.municipality_id,
                scraper_name="toronto_enhanced"
            )
            
            return pdf_links
            
        except Exception as e:
            self.logger.error(
                f"Error extracting PDF links from page: {page_url}",
                error=e,
                data={'page_url': page_url},
                municipality_id=self.municipality_id,
                scraper_name="toronto_enhanced"
            )
            return []
    
    async def handle_pagination_async(self, soup: BeautifulSoup, current_url: str) -> Optional[str]:
        """Handle navigation between different sections (no traditional pagination for Toronto)"""
        # Toronto doesn't use traditional pagination, but we track section navigation
        self.logger.debug(
            f"Checking for navigation from: {current_url}",
            {'current_url': current_url},
            municipality_id=self.municipality_id,
            scraper_name="toronto_enhanced"
        )
        
        # No pagination needed for Toronto's structure
        return None
    
    async def scrape_municipal_code_async(self) -> List[Dict[str, Any]]:
        """Scrape municipal code PDFs"""
        if not self.enable_municipal_code:
            return []
        
        self.logger.info(
            "Scraping municipal code documents",
            {'municipal_code_url': self.municipal_code_url},
            municipality_id=self.municipality_id,
            scraper_name="toronto_enhanced"
        )
        
        self._update_progress(current_stage="scraping_municipal_code")
        
        html_content = await self.fetch_page_async(self.municipal_code_url)
        if not html_content:
            self.logger.warning(
                "Failed to fetch municipal code page",
                {'url': self.municipal_code_url},
                municipality_id=self.municipality_id,
                scraper_name="toronto_enhanced"
            )
            return []
        
        return await self.find_pdf_links_async(html_content, self.municipal_code_url)
    
    async def scrape_year_directory_async(self, year: str) -> List[Dict[str, Any]]:
        """Scrape bylaws from a specific year directory"""
        year_url = f"https://www.toronto.ca/legdocs/bylaws/{year}/"
        
        self.logger.info(
            f"Scraping {year} bylaw directory",
            {'year': year, 'year_url': year_url},
            municipality_id=self.municipality_id,
            scraper_name="toronto_enhanced"
        )
        
        self._update_progress(current_stage=f"scraping_year_{year}")
        
        html_content = await self.fetch_page_async(year_url)
        if not html_content:
            self.logger.warning(
                f"Failed to fetch {year} directory",
                {'year': year, 'url': year_url},
                municipality_id=self.municipality_id,
                scraper_name="toronto_enhanced"
            )
            return []
        
        return await self.find_pdf_links_async(html_content, year_url)
    
    async def run_scrape_async(self) -> Dict[str, Any]:
        """Enhanced scraping with Toronto's dual strategy"""
        start_time = asyncio.get_event_loop().time()
        
        self.logger.info(
            "Starting Toronto enhanced scrape",
            {
                'municipality_id': self.municipality_id,
                'strategies': {
                    'municipal_code': self.enable_municipal_code,
                    'year_directories': self.enable_year_directories
                },
                'year_range': self.year_range
            },
            municipality_id=self.municipality_id,
            scraper_name="toronto_enhanced"
        )
        
        all_pdfs = []
        
        try:
            # Estimate total pages for progress tracking
            estimated_pages = 1  # Municipal code page
            if self.enable_year_directories:
                estimated_pages += len(self.year_range)
            
            self._update_progress(
                total_pages=estimated_pages,
                current_stage="initializing"
            )
            
            # Strategy 1: Municipal Code
            if self.enable_municipal_code:
                self.logger.info(
                    "Starting municipal code scraping",
                    municipality_id=self.municipality_id,
                    scraper_name="toronto_enhanced"
                )
                
                municipal_code_pdfs = await self.scrape_municipal_code_async()
                all_pdfs.extend(municipal_code_pdfs)
                self.pages_processed += 1
                
                self._update_progress(
                    processed_pages=self.pages_processed,
                    total_documents=len(all_pdfs)
                )
                
                self.logger.info(
                    f"Municipal code scraping completed",
                    {'documents_found': len(municipal_code_pdfs)},
                    municipality_id=self.municipality_id,
                    scraper_name="toronto_enhanced"
                )
            
            # Strategy 2: Year-based directories
            if self.enable_year_directories:
                for year in self.year_range:
                    if self._cancellation_token.is_set():
                        break
                    
                    year_pdfs = await self.scrape_year_directory_async(str(year))
                    all_pdfs.extend(year_pdfs)
                    self.pages_processed += 1
                    
                    self._update_progress(
                        processed_pages=self.pages_processed,
                        total_documents=len(all_pdfs)
                    )
                    
                    self.logger.info(
                        f"{year} directory scraping completed",
                        {'year': year, 'documents_found': len(year_pdfs)},
                        municipality_id=self.municipality_id,
                        scraper_name="toronto_enhanced"
                    )
                    
                    # Respectful delay between years
                    await asyncio.sleep(1 / self.resource_limits.rate_limit_requests_per_second)
            
            # Remove duplicates based on URL
            unique_pdfs = []
            seen_urls = set()
            duplicate_count = 0
            
            for pdf in all_pdfs:
                if pdf['url'] not in seen_urls:
                    unique_pdfs.append(pdf)
                    seen_urls.add(pdf['url'])
                else:
                    duplicate_count += 1
            
            self.documents_found = unique_pdfs
            
            # Calculate final metrics
            total_time = asyncio.get_event_loop().time() - start_time
            self.performance_monitor.record_metric('total_scrape_time', total_time * 1000)
            
            summary = {
                'municipality_id': self.municipality_id,
                'scraper_name': 'toronto_enhanced',
                'documents_found': len(unique_pdfs),
                'duplicates_removed': duplicate_count,
                'pages_processed': self.pages_processed,
                'documents_validated': self.documents_validated,
                'validation_failures': self.validation_failures,
                'scrape_time_seconds': total_time,
                'average_time_per_page': total_time / max(self.pages_processed, 1),
                'errors': self.errors,
                'strategies_used': {
                    'municipal_code': self.enable_municipal_code,
                    'year_directories': self.enable_year_directories
                },
                'performance_metrics': self.performance_monitor.get_summary(),
                'resource_usage': await self._get_resource_usage_summary()
            }
            
            self._update_progress(
                current_stage="completed",
                processed_pages=self.pages_processed,
                total_documents=len(unique_pdfs)
            )
            
            self.logger.info(
                "Toronto enhanced scrape completed successfully",
                summary,
                municipality_id=self.municipality_id,
                scraper_name="toronto_enhanced"
            )
            
            return summary
            
        except Exception as e:
            self.logger.error(
                "Toronto enhanced scrape failed",
                error=e,
                data={
                    'pages_processed': self.pages_processed,
                    'documents_found': len(all_pdfs)
                },
                municipality_id=self.municipality_id,
                scraper_name="toronto_enhanced"
            )
            raise
    
    def _extract_chapter_number(self, href: str) -> Optional[str]:
        """Extract municipal code chapter number from URL"""
        match = re.search(r'1184_([A-Z0-9]+)', href)
        return match.group(1) if match else None
    
    def _extract_year_from_url(self, href: str) -> Optional[int]:
        """Extract year from bylaw URL"""
        match = re.search(r'/bylaws/(\d{4})/', href)
        return int(match.group(1)) if match else None
    
    def _extract_bylaw_number(self, filename: str) -> Optional[str]:
        """Extract bylaw number from filename"""
        # Common Toronto bylaw number patterns
        patterns = [
            r'\b(\d{4}-\d+)\b',  # 2024-123
            r'\b(\d+-\d{4})\b',  # 123-2024
            r'\bBylaw[_\s]*(\d+[-_]\d+)\b',  # Bylaw 123-2024
        ]
        
        for pattern in patterns:
            match = re.search(pattern, filename, re.IGNORECASE)
            if match:
                return match.group(1)
        
        return None
    
    async def _get_resource_usage_summary(self) -> Dict[str, Any]:
        """Get summary of resource usage during scraping"""
        try:
            import psutil
            process = psutil.Process()
            
            return {
                'memory_mb': process.memory_info().rss / 1024 / 1024,
                'cpu_percent': process.cpu_percent(),
                'requests_made': self.session_stats['requests_made'],
                'bytes_downloaded': self.session_stats['bytes_downloaded'],
                'cache_hits': self.session_stats.get('cache_hits', 0),
                'cache_misses': self.session_stats.get('cache_misses', 0)
            }
        except ImportError:
            return {'psutil_not_available': True}
        except Exception as e:
            return {'resource_error': str(e)}
    
    def sanitize_filename(self, filename: str) -> str:
        """Enhanced filename sanitization with Toronto-specific patterns"""
        # Remove or replace invalid characters
        filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
        
        # Handle Toronto-specific patterns
        filename = re.sub(r'\s+', '_', filename)  # Replace spaces with underscores
        filename = re.sub(r'[()\[\]{}]', '', filename)  # Remove brackets
        filename = re.sub(r'[^a-zA-Z0-9._-]', '', filename)  # Keep only safe characters
        
        # Ensure it ends with .pdf
        if not filename.lower().endswith('.pdf'):
            filename += '.pdf'
        
        # Ensure reasonable length
        if len(filename) > 255:
            base_name = filename[:-4]  # Remove .pdf
            filename = base_name[:251] + '.pdf'  # Keep .pdf extension
        
        return filename
