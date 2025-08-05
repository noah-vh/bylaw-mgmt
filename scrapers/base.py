from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Dict, Optional
import requests
from bs4 import BeautifulSoup
import time
import os
from urllib.parse import urljoin, urlparse

class BaseScraper(ABC):
    """Base class for all municipality scrapers"""
    
    def __init__(self, municipality_id: int, base_url: str, search_url: str):
        self.municipality_id = municipality_id
        self.base_url = base_url
        self.search_url = search_url
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        self.documents_found = []
        self.errors = []
        self.progress_callback = None  # For progress reporting
        
    def fetch_page(self, url: str, timeout: int = 30) -> Optional[requests.Response]:
        """Fetch a webpage with error handling"""
        try:
            response = self.session.get(url, timeout=timeout)
            response.raise_for_status()
            return response
        except requests.RequestException as e:
            self.errors.append(f"Error fetching {url}: {e}")
            return None
    
    def sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for safe saving"""
        import re
        # Remove or replace invalid characters
        filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
        # Ensure it ends with .pdf
        if not filename.endswith('.pdf'):
            filename += '.pdf'
        return filename
    
    @abstractmethod
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """
        Extract PDF links from HTML content
        Must return list of dicts with keys: url, filename, title
        """
        pass
    
    @abstractmethod
    def handle_pagination(self, soup: BeautifulSoup) -> Optional[str]:
        """
        Handle pagination and return next page URL if exists
        """
        pass
    
    def scrape_all_pages(self) -> List[Dict]:
        """Scrape PDFs from all pages"""
        all_pdfs = []
        current_url = self.search_url
        page_num = 1
        
        while current_url:
            print(f"📄 Fetching page {page_num} for municipality {self.municipality_id}...")
            if self.progress_callback:
                self.progress_callback(40 + min(page_num * 5, 20), f"Fetching page {page_num}...")
            
            response = self.fetch_page(current_url)
            
            if not response:
                break
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Find PDFs on current page
            pdfs = self.find_pdf_links(response.content)
            
            if pdfs:
                print(f"✓ Found {len(pdfs)} PDFs on page {page_num}")
                all_pdfs.extend(pdfs)
                if self.progress_callback:
                    self.progress_callback(40 + min(page_num * 5, 20), f"Found {len(all_pdfs)} documents so far...")
            else:
                print(f"⚠️  No PDFs found on page {page_num}")
            
            # Check for next page
            next_url = self.handle_pagination(soup)
            
            if next_url and next_url != current_url:
                current_url = next_url
                page_num += 1
                time.sleep(1)  # Be respectful to the server
            else:
                break
        
        return all_pdfs
    
    def scrape_secondary_sources(self, secondary_sources: List) -> List[Dict]:
        """Scrape PDFs from secondary sources"""
        all_pdfs = []
        
        for source in secondary_sources:
            if not source.is_active:
                continue
                
            print(f"🔍 Scraping secondary source: {source.title}")
            print(f"    URL: {source.url}")
            
            response = self.fetch_page(source.url)
            if not response:
                print(f"❌ Failed to fetch secondary source: {source.title}")
                continue
            
            # Use the same PDF finding logic
            pdfs = self.find_pdf_links(response.content)
            
            if pdfs:
                # Mark these as coming from secondary source
                for pdf in pdfs:
                    pdf['source_type'] = 'secondary'
                    pdf['source_title'] = source.title
                    pdf['source_category'] = source.category
                
                print(f"✓ Found {len(pdfs)} PDFs from secondary source: {source.title}")
                all_pdfs.extend(pdfs)
            else:
                print(f"⚠️  No PDFs found in secondary source: {source.title}")
            
            time.sleep(1)  # Be respectful to the server
        
        return all_pdfs
    
    def scrape_specific_bylaws(self, specific_bylaws: List) -> List[Dict]:
        """Attempt to scrape specific bylaws"""
        all_pdfs = []
        
        for bylaw in specific_bylaws:
            if not bylaw.is_active:
                continue
                
            print(f"🎯 Looking for specific bylaw: {bylaw.bylaw_number} - {bylaw.title}")
            
            # If we have an expected URL, try it directly
            if bylaw.expected_url:
                print(f"    Trying expected URL: {bylaw.expected_url}")
                response = self.fetch_page(bylaw.expected_url)
                
                if response and response.headers.get('content-type', '').startswith('application/pdf'):
                    # Direct PDF link
                    filename = f"{bylaw.bylaw_number}.pdf"
                    all_pdfs.append({
                        'url': bylaw.expected_url,
                        'filename': filename,
                        'title': f"{bylaw.bylaw_number} - {bylaw.title}",
                        'source_type': 'specific_bylaw',
                        'bylaw_number': bylaw.bylaw_number,
                        'priority': bylaw.priority
                    })
                    print(f"✓ Found specific bylaw PDF: {bylaw.bylaw_number}")
                elif response:
                    # Page that might contain the PDF
                    pdfs = self.find_pdf_links(response.content)
                    for pdf in pdfs:
                        # Filter for this specific bylaw
                        if (bylaw.bylaw_number.lower() in pdf['title'].lower() or 
                            bylaw.bylaw_number.lower() in pdf['filename'].lower()):
                            pdf['source_type'] = 'specific_bylaw'
                            pdf['bylaw_number'] = bylaw.bylaw_number
                            pdf['priority'] = bylaw.priority
                            all_pdfs.append(pdf)
                            print(f"✓ Found specific bylaw PDF: {bylaw.bylaw_number}")
            
            time.sleep(0.5)  # Be respectful to the server
        
        return all_pdfs
    
    def get_scrape_summary(self) -> Dict:
        """Get summary of scraping results"""
        return {
            'municipality_id': self.municipality_id,
            'documents_found': len(self.documents_found),
            'errors': self.errors,
            'scrape_date': datetime.utcnow()
        }
    
    def run_scrape(self) -> Dict:
        """Main execution method"""
        print(f"🚀 Starting scrape for municipality {self.municipality_id}")
        print("="*50)
        
        # Scrape all pages
        print("🔍 Searching for PDFs...")
        if self.progress_callback:
            self.progress_callback(40, "Searching for documents...")
        
        all_pdfs = self.scrape_all_pages()
        
        if not all_pdfs:
            print("❌ No PDFs found. The website structure might have changed.")
            return self.get_scrape_summary()
        
        print(f"📊 Total PDFs found: {len(all_pdfs)}")
        
        # Store documents found
        self.documents_found = all_pdfs
        
        # Print summary
        summary = self.get_scrape_summary()
        print("\n" + "="*50)
        print("📈 Scrape Summary:")
        print(f"✓ Documents found: {summary['documents_found']}")
        print(f"✗ Errors: {len(summary['errors'])}")
        
        if summary['errors']:
            print("\n⚠️  Errors encountered:")
            for error in summary['errors']:
                print(f"  - {error}")
        
        print("\n✅ Scraping completed!")
        return summary