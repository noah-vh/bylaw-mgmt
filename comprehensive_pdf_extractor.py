#!/usr/bin/env python3
"""
Comprehensive PDF Link Extractor for Municipality Websites

This module provides a robust function to extract PDF document links from municipality websites
with advanced filtering, error handling, and bylaw-specific content detection.
"""

import requests
import time
import logging
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse, parse_qs
from urllib.robotparser import RobotFileParser
from bs4 import BeautifulSoup
import re
import os
from dataclasses import dataclass
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


@dataclass
class PDFDocument:
    """Data class for PDF document information"""
    url: str
    title: str
    filename: str
    found_on_page: str
    is_bylaw_related: bool
    relevance_score: float
    file_size: Optional[int] = None
    last_modified: Optional[str] = None
    content_type: Optional[str] = None


class MunicipalityPDFExtractor:
    """
    Comprehensive PDF extractor for municipality websites with advanced features:
    - Respects robots.txt
    - Handles pagination and multiple page types
    - Filters for bylaw-related content
    - Provides relevance scoring
    - Robust error handling and retry logic
    """
    
    def __init__(self, 
                 request_delay: float = 2.0,
                 max_retries: int = 3,
                 timeout: int = 30,
                 max_pages: int = 5,
                 max_depth: int = 2,
                 respect_robots: bool = True):
        """
        Initialize the PDF extractor
        
        Args:
            request_delay: Delay between requests in seconds
            max_retries: Maximum number of retries for failed requests
            timeout: Request timeout in seconds
            max_pages: Maximum number of pages to scrape
            max_depth: Maximum depth for following links
            respect_robots: Whether to respect robots.txt
        """
        self.request_delay = request_delay
        self.max_retries = max_retries
        self.timeout = timeout
        self.max_pages = max_pages
        self.max_depth = max_depth
        self.respect_robots = respect_robots
        
        # Setup logging
        self.logger = logging.getLogger(__name__)
        
        # Initialize session with retry strategy
        self.session = self._create_session()
        
        # Bylaw-related keywords for content filtering
        self.bylaw_keywords = {
            'high_priority': [
                'bylaw', 'by-law', 'ordinance', 'regulation', 'zoning',
                'adu', 'accessory dwelling', 'housing', 'residential'
            ],
            'medium_priority': [
                'municipal', 'policy', 'code', 'rules', 'law', 'statute',
                'planning', 'development', 'building', 'land use'
            ],
            'low_priority': [
                'council', 'meeting', 'agenda', 'minutes', 'public',
                'community', 'services', 'infrastructure'
            ]
        }
        
        # PDF detection patterns
        self.pdf_patterns = [
            r'\.pdf$',
            r'\.pdf\?',
            r'\.pdf#',
            r'/pdf/',
            r'filetype:pdf',
            r'format=pdf',
            r'type=pdf'
        ]
        
        # Common municipality page types to explore
        self.page_types = [
            'bylaw', 'regulation', 'ordinance', 'zoning', 'planning',
            'development', 'housing', 'policy', 'governance', 'council'
        ]
    
    def _create_session(self) -> requests.Session:
        """Create a requests session with retry strategy and proper headers"""
        session = requests.Session()
        
        # Setup retry strategy
        retry_strategy = Retry(
            total=self.max_retries,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            respect_retry_after_header=True
        )
        
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        # Set proper headers
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (compatible; MunicipalityBylawScraper/1.0; +https://github.com/bylaws)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        
        return session
    
    def _can_fetch(self, url: str, user_agent: str = '*') -> bool:
        """Check if we can fetch the URL according to robots.txt"""
        if not self.respect_robots:
            return True
        
        try:
            parsed_url = urlparse(url)
            robots_url = f"{parsed_url.scheme}://{parsed_url.netloc}/robots.txt"
            
            rp = RobotFileParser()
            rp.set_url(robots_url)
            rp.read()
            
            return rp.can_fetch(user_agent, url)
        except Exception as e:
            self.logger.warning(f"Could not check robots.txt for {url}: {e}")
            return True
    
    def _is_pdf_link(self, url: str, link_text: str = "", content_type: str = "") -> bool:
        """
        Comprehensive PDF detection using multiple methods
        
        Args:
            url: The URL to check
            link_text: Text content of the link
            content_type: HTTP content-type header if available
            
        Returns:
            True if the link appears to point to a PDF
        """
        # Check content-type header first (most reliable)
        if content_type and 'application/pdf' in content_type.lower():
            return True
        
        # Check URL patterns
        url_lower = url.lower()
        for pattern in self.pdf_patterns:
            if re.search(pattern, url_lower):
                return True
        
        # Check link text
        text_lower = link_text.lower()
        pdf_indicators = [
            'pdf', '.pdf', 'adobe', 'acrobat', 'download pdf',
            'view pdf', 'open pdf', 'pdf document', 'pdf file'
        ]
        
        for indicator in pdf_indicators:
            if indicator in text_lower:
                return True
        
        return False
    
    def _calculate_relevance_score(self, url: str, title: str, context: str = "") -> float:
        """
        Calculate relevance score for bylaw-related content
        
        Args:
            url: The PDF URL
            title: The link title/text
            context: Additional context from the page
            
        Returns:
            Relevance score between 0.0 and 1.0
        """
        combined_text = f"{url} {title} {context}".lower()
        score = 0.0
        
        # High priority keywords (0.4 points each, max 0.6)
        high_matches = sum(1 for keyword in self.bylaw_keywords['high_priority'] 
                          if keyword in combined_text)
        score += min(high_matches * 0.4, 0.6)
        
        # Medium priority keywords (0.2 points each, max 0.3)
        medium_matches = sum(1 for keyword in self.bylaw_keywords['medium_priority'] 
                           if keyword in combined_text)
        score += min(medium_matches * 0.2, 0.3)
        
        # Low priority keywords (0.1 points each, max 0.1)
        low_matches = sum(1 for keyword in self.bylaw_keywords['low_priority'] 
                         if keyword in combined_text)
        score += min(low_matches * 0.1, 0.1)
        
        return min(score, 1.0)
    
    def _is_bylaw_related(self, url: str, title: str, context: str = "") -> bool:
        """Check if content is bylaw-related based on relevance score"""
        return self._calculate_relevance_score(url, title, context) > 0.2
    
    def _extract_title(self, link, soup) -> str:
        """Extract meaningful title from link element"""
        # Try different title sources in order of preference
        title_sources = [
            lambda: link.get('title', '').strip(),
            lambda: link.get_text(strip=True),
            lambda: link.get('aria-label', '').strip(),
            lambda: link.get('alt', '').strip(),
        ]
        
        for source in title_sources:
            try:
                title = source()
                if title and len(title) > 3:
                    return title
            except:
                continue
        
        # Try to get context from parent elements
        try:
            parent = link.parent
            if parent and parent.name in ['td', 'li', 'div']:
                parent_text = parent.get_text(strip=True)
                if parent_text and len(parent_text) < 200:
                    return parent_text
        except:
            pass
        
        return "Untitled Document"
    
    def _get_file_info(self, url: str) -> Tuple[Optional[int], Optional[str], Optional[str]]:
        """Get file size, last modified date, and content type via HEAD request"""
        try:
            response = self.session.head(url, timeout=10, allow_redirects=True)
            
            file_size = None
            last_modified = None
            content_type = None
            
            if 'content-length' in response.headers:
                try:
                    file_size = int(response.headers['content-length'])
                except ValueError:
                    pass
            
            if 'last-modified' in response.headers:
                last_modified = response.headers['last-modified']
            
            if 'content-type' in response.headers:
                content_type = response.headers['content-type']
            
            return file_size, last_modified, content_type
            
        except Exception as e:
            self.logger.debug(f"Could not get file info for {url}: {e}")
            return None, None, None
    
    def _should_explore_url(self, url: str, link_text: str, current_domain: str) -> bool:
        """Determine if a URL should be explored for more PDFs"""
        parsed_url = urlparse(url)
        
        # Stay within the same domain
        if parsed_url.netloc != current_domain:
            return False
        
        # Check if URL or link text suggests bylaw-related content
        combined_text = f"{url} {link_text}".lower()
        
        # Look for relevant page types
        for page_type in self.page_types:
            if page_type in combined_text:
                return True
        
        # Avoid common non-relevant paths
        avoid_paths = [
            'contact', 'about', 'news', 'events', 'calendar',
            'staff', 'directory', 'social', 'media', 'photo',
            'image', 'css', 'js', 'javascript', 'admin'
        ]
        
        return not any(avoid in combined_text for avoid in avoid_paths)
    
    def extract_pdf_links(self, 
                         municipality_url: str, 
                         municipality_name: str = "") -> List[PDFDocument]:
        """
        Extract PDF links from a municipality website
        
        Args:
            municipality_url: The base URL of the municipality website
            municipality_name: Name of the municipality (for logging)
            
        Returns:
            List of PDFDocument objects containing extracted PDF information
        """
        self.logger.info(f"Starting PDF extraction for {municipality_name or municipality_url}")
        
        pdf_documents = []
        visited_urls = set()
        urls_to_visit = [(municipality_url, 0)]  # (url, depth)
        
        parsed_base = urlparse(municipality_url)
        base_domain = parsed_base.netloc
        
        # Check robots.txt
        if not self._can_fetch(municipality_url):
            self.logger.warning(f"Robots.txt disallows crawling {municipality_url}")
            return pdf_documents
        
        page_count = 0
        
        while urls_to_visit and page_count < self.max_pages:
            try:
                current_url, depth = urls_to_visit.pop(0)
                
                # Skip if already visited or too deep
                if current_url in visited_urls or depth > self.max_depth:
                    continue
                
                visited_urls.add(current_url)
                page_count += 1
                
                self.logger.info(f"Scanning page {page_count}/{self.max_pages}: {current_url}")
                
                # Fetch the page
                response = self.session.get(current_url, timeout=self.timeout)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Extract page context for relevance scoring
                page_title = soup.find('title')
                page_title_text = page_title.get_text() if page_title else ""
                
                # Find all links
                links = soup.find_all('a', href=True)
                
                for link in links:
                    try:
                        href = link['href'].strip()
                        if not href:
                            continue
                        
                        # Convert relative URLs to absolute
                        full_url = urljoin(current_url, href)
                        
                        # Extract link text and title
                        link_text = self._extract_title(link, soup)
                        
                        # Check if it's a PDF
                        if self._is_pdf_link(full_url, link_text):
                            # Avoid duplicates
                            if any(doc.url == full_url for doc in pdf_documents):
                                continue
                            
                            # Get additional file information
                            file_size, last_modified, content_type = self._get_file_info(full_url)
                            
                            # Calculate relevance score
                            relevance_score = self._calculate_relevance_score(
                                full_url, link_text, page_title_text
                            )
                            
                            is_bylaw_related = relevance_score > 0.2
                            
                            # Create PDF document object
                            pdf_doc = PDFDocument(
                                url=full_url,
                                title=link_text,
                                filename=os.path.basename(urlparse(full_url).path) or 'document.pdf',
                                found_on_page=current_url,
                                is_bylaw_related=is_bylaw_related,
                                relevance_score=relevance_score,
                                file_size=file_size,
                                last_modified=last_modified,
                                content_type=content_type
                            )
                            
                            pdf_documents.append(pdf_doc)
                            
                            # Log the discovery
                            relevance_indicator = "🏛️ " if is_bylaw_related else "📄 "
                            self.logger.info(f"  {relevance_indicator}Found PDF: {link_text[:60]}... "
                                           f"(relevance: {relevance_score:.2f})")
                        
                        # Consider exploring this URL if it might contain more PDFs
                        elif (depth < self.max_depth and 
                              len(urls_to_visit) < 20 and  # Limit queue size
                              self._should_explore_url(full_url, link_text, base_domain) and
                              full_url not in visited_urls):
                            urls_to_visit.append((full_url, depth + 1))
                    
                    except Exception as e:
                        self.logger.debug(f"Error processing link {href}: {e}")
                        continue
                
                # Respectful delay between requests
                if urls_to_visit:
                    time.sleep(self.request_delay)
                
            except requests.RequestException as e:
                self.logger.error(f"Request failed for {current_url}: {e}")
                continue
            except Exception as e:
                self.logger.error(f"Unexpected error processing {current_url}: {e}")
                continue
        
        # Sort by relevance score (highest first)
        pdf_documents.sort(key=lambda x: x.relevance_score, reverse=True)
        
        self.logger.info(f"Extraction complete. Found {len(pdf_documents)} PDFs "
                        f"({sum(1 for doc in pdf_documents if doc.is_bylaw_related)} bylaw-related)")
        
        return pdf_documents


def extract_municipality_pdf_links(municipality_url: str, 
                                 municipality_name: str = "",
                                 **kwargs) -> List[Dict]:
    """
    Convenience function to extract PDF links from a municipality website
    
    Args:
        municipality_url: The municipality website URL
        municipality_name: Name of the municipality (optional, for logging)
        **kwargs: Additional arguments passed to MunicipalityPDFExtractor
        
    Returns:
        List of dictionaries containing PDF information with keys:
        - url: PDF URL
        - title: Document title
        - filename: PDF filename
        - found_on_page: URL where the PDF link was found
        - is_bylaw_related: Boolean indicating bylaw relevance
        - relevance_score: Float between 0.0 and 1.0
        - file_size: File size in bytes (if available)
        - last_modified: Last modified date string (if available)
        - content_type: MIME content type (if available)
    """
    # Setup logging if not already configured
    if not logging.getLogger().handlers:
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s'
        )
    
    extractor = MunicipalityPDFExtractor(**kwargs)
    pdf_documents = extractor.extract_pdf_links(municipality_url, municipality_name)
    
    # Convert to dictionary format for easier use
    return [
        {
            'url': doc.url,
            'title': doc.title,
            'filename': doc.filename,
            'found_on_page': doc.found_on_page,
            'is_bylaw_related': doc.is_bylaw_related,
            'relevance_score': doc.relevance_score,
            'file_size': doc.file_size,
            'last_modified': doc.last_modified,
            'content_type': doc.content_type
        }
        for doc in pdf_documents
    ]


# Example usage and testing
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Extract PDF links from municipality websites")
    parser.add_argument("url", help="Municipality website URL")
    parser.add_argument("--name", "-n", help="Municipality name")
    parser.add_argument("--max-pages", "-p", type=int, default=5, 
                       help="Maximum pages to scan")
    parser.add_argument("--delay", "-d", type=float, default=2.0,
                       help="Delay between requests (seconds)")
    parser.add_argument("--verbose", "-v", action="store_true",
                       help="Enable verbose logging")
    
    args = parser.parse_args()
    
    # Setup logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    try:
        print(f"🚀 Extracting PDF links from: {args.url}")
        print("=" * 60)
        
        pdf_links = extract_municipality_pdf_links(
            municipality_url=args.url,
            municipality_name=args.name or "Unknown Municipality",
            max_pages=args.max_pages,
            request_delay=args.delay
        )
        
        print(f"\n📊 RESULTS")
        print("=" * 60)
        print(f"Total PDFs found: {len(pdf_links)}")
        
        bylaw_related = [pdf for pdf in pdf_links if pdf['is_bylaw_related']]
        print(f"Bylaw-related PDFs: {len(bylaw_related)}")
        
        if pdf_links:
            print(f"\n📋 Top 10 Results (by relevance):")
            print("-" * 60)
            
            for i, pdf in enumerate(pdf_links[:10], 1):
                relevance_indicator = "🏛️ " if pdf['is_bylaw_related'] else "📄 "
                size_info = f" ({pdf['file_size']} bytes)" if pdf['file_size'] else ""
                
                print(f"{i:2d}. {relevance_indicator}{pdf['title'][:50]}...")
                print(f"    URL: {pdf['url']}")
                print(f"    Relevance: {pdf['relevance_score']:.2f}{size_info}")
                print()
        
        print(f"✅ Extraction completed successfully!")
        
    except KeyboardInterrupt:
        print("\n⏹️  Extraction stopped by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        raise