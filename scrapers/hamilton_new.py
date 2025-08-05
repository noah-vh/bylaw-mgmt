"""
Hamilton By-laws PDF Scraper - New Implementation
Based on analysis: Pattern C - Structured Directory with Search Interface
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
import json
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse
from .base_supabase import BaseSupabaseScraper

class HamiltonScraper(BaseSupabaseScraper):
    """Hamilton municipality scraper - structured directory approach"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.hamilton.ca"
        search_url = "https://www.hamilton.ca/city-council/by-laws-enforcement/search-by-laws"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract PDF links from the search results page"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # Look for direct PDF links on the page
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.endswith('.pdf'):
                full_url = urljoin(self.base_url, href)
                link_text = link.get_text(strip=True)
                filename = os.path.basename(urlparse(full_url).path)
                
                pdf_links.append({
                    'url': full_url,
                    'filename': filename,
                    'title': link_text or filename
                })
        
        return pdf_links
    
    def handle_pagination(self, soup: BeautifulSoup) -> Optional[str]:
        """Handle pagination in search results"""
        # Look for "Next" or numbered pagination links
        next_link = soup.find('a', {'class': 'next'})
        if next_link and next_link.get('href'):
            return urljoin(self.base_url, next_link['href'])
        
        return None
    
    def generate_monthly_urls(self, start_year: int = 2020, end_year: int = 2024) -> List[str]:
        """Generate URLs for monthly directories"""
        urls = []
        
        current_date = datetime(start_year, 1, 1)
        end_date = datetime(end_year, 12, 31)
        
        while current_date <= end_date:
            year_month = current_date.strftime("%Y-%m")
            directory_url = f"https://www.hamilton.ca/sites/default/files/{year_month}/"
            urls.append(directory_url)
            
            # Move to next month
            if current_date.month == 12:
                current_date = current_date.replace(year=current_date.year + 1, month=1)
            else:
                current_date = current_date.replace(month=current_date.month + 1)
        
        return urls
    
    def scrape_directory_listing(self, directory_url: str) -> List[Dict]:
        """Scrape PDF files from a directory listing"""
        pdf_links = []
        
        response = self.fetch_page(directory_url)
        if not response:
            return pdf_links
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Look for PDF links in directory listing
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.endswith('.pdf'):
                full_url = urljoin(directory_url, href)
                filename = os.path.basename(urlparse(full_url).path)
                link_text = link.get_text(strip=True)
                
                pdf_links.append({
                    'url': full_url,
                    'filename': filename,
                    'title': link_text or filename
                })
        
        return pdf_links
    
    def try_direct_pdf_access(self, year_month: str) -> List[Dict]:
        """Try to access PDFs directly using common naming patterns"""
        pdf_links = []
        base_url = f"https://www.hamilton.ca/sites/default/files/{year_month}/"
        
        # Common patterns for Hamilton bylaws
        patterns = [
            # YY-XXX format
            [f"{year_month[-2:]}-{i:03d}.pdf" for i in range(1, 200)],
            # YY-XX format  
            [f"{year_month[-2:]}-{i:02d}.pdf" for i in range(1, 100)],
            # Draft bylaw patterns
            [f"Draft-Bylaw-{i:03d}-{year_month}.pdf" for i in range(1, 50)],
            # Consolidation patterns
            [f"{year_month[-2:]}-{i:03d}-OfficeConsolidation.pdf" for i in range(1, 100)]
        ]
        
        # Test a sample of each pattern
        for pattern_group in patterns:
            for filename in pattern_group[:10]:  # Test first 10 of each pattern
                pdf_url = urljoin(base_url, filename)
                
                response = self.fetch_page(pdf_url)
                if response and response.status_code == 200:
                    pdf_links.append({
                        'url': pdf_url,
                        'filename': filename,
                        'title': f"Hamilton Bylaw - {filename}"
                    })
        
        return pdf_links
    
    def search_bylaws_ajax(self, search_term: str = "bylaw") -> List[Dict]:
        """Use the AJAX search interface to find bylaws"""
        pdf_links = []
        
        # AJAX search endpoint (discovered from analysis)
        search_url = "https://www.hamilton.ca/city-council/by-laws-enforcement/search-by-laws"
        
        # Try to get the search results page
        response = self.fetch_page(search_url)
        if not response:
            return pdf_links
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Look for search results or PDF links
        for link in soup.find_all('a', href=True):
            href = link['href']
            if 'sites/default/files' in href and href.endswith('.pdf'):
                full_url = urljoin(self.base_url, href)
                link_text = link.get_text(strip=True)
                filename = os.path.basename(urlparse(full_url).path)
                
                pdf_links.append({
                    'url': full_url,
                    'filename': filename,
                    'title': link_text or filename
                })
        
        return pdf_links
    
    def run_scrape(self) -> Dict:
        """Enhanced scraping with structured directory approach"""
        print(f"🚀 Starting Hamilton scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Search interface
        print("🔍 Searching via AJAX interface...")
        search_pdfs = self.search_bylaws_ajax()
        all_pdfs.extend(search_pdfs)
        print(f"✓ Found {len(search_pdfs)} PDFs via search")
        
        # Strategy 2: Directory structure exploration
        print("📁 Exploring directory structure...")
        monthly_urls = self.generate_monthly_urls(2022, 2024)
        
        directory_count = 0
        for directory_url in monthly_urls[:12]:  # Sample first 12 months
            print(f"📅 Checking {directory_url.split('/')[-2]}...")
            directory_pdfs = self.scrape_directory_listing(directory_url)
            all_pdfs.extend(directory_pdfs)
            directory_count += len(directory_pdfs)
        
        print(f"✓ Found {directory_count} PDFs via directory exploration")
        
        # Strategy 3: Direct URL pattern attempts
        print("🎯 Trying direct URL patterns...")
        pattern_count = 0
        
        # Try recent months with direct patterns
        recent_months = ["2024-03", "2024-02", "2024-01", "2023-12"]
        for month in recent_months:
            month_pdfs = self.try_direct_pdf_access(month)
            all_pdfs.extend(month_pdfs)
            pattern_count += len(month_pdfs)
        
        print(f"✓ Found {pattern_count} PDFs via direct patterns")
        
        # Remove duplicates based on URL
        unique_pdfs = []
        seen_urls = set()
        for pdf in all_pdfs:
            if pdf['url'] not in seen_urls:
                unique_pdfs.append(pdf)
                seen_urls.add(pdf['url'])
        
        print(f"📊 Total unique PDFs found: {len(unique_pdfs)}")
        
        # Store documents found
        self.documents_found = unique_pdfs
        
        return self.get_scrape_summary()