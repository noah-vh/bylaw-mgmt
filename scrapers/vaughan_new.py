"""
Vaughan By-laws PDF Scraper - New Implementation
Based on analysis: Pattern A - Direct PDF Links
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse, quote
from .base_supabase import BaseSupabaseScraper

class VaughanScraper(BaseSupabaseScraper):
    """Vaughan municipality scraper - direct PDF links approach"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.vaughan.ca"
        search_url = "https://www.vaughan.ca/residential/by-laws-and-enforcement/by-law-library"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract PDF links from page content"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # Look for direct PDF links
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.endswith('.pdf') and '/sites/default/files/' in href:
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
        """Handle pagination if present"""
        # Look for pagination links
        next_link = soup.find('a', {'class': 'next'})
        if next_link and next_link.get('href'):
            return urljoin(self.base_url, next_link['href'])
        
        return None
    
    def generate_date_folders(self, start_year: int = 2019, end_year: int = 2024) -> List[str]:
        """Generate date-based folder URLs"""
        folders = []
        
        for year in range(start_year, end_year + 1):
            for month in range(1, 13):
                folder_name = f"{year:04d}-{month:02d}"
                folder_url = f"https://www.vaughan.ca/sites/default/files/{folder_name}/"
                folders.append(folder_url)
        
        return folders
    
    def scrape_directory_listing(self, directory_url: str) -> List[Dict]:
        """Scrape PDF files from a directory listing"""
        pdf_links = []
        
        print(f"📁 Checking directory: {directory_url}")
        response = self.fetch_page(directory_url)
        
        if not response or response.status_code != 200:
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
    
    def try_direct_pdf_patterns(self) -> List[Dict]:
        """Try to access PDFs using known naming patterns"""
        pdf_links = []
        
        # Common bylaw patterns from analysis
        patterns = [
            # Standard format: number-year
            {"pattern": "{:03d}-{}.pdf", "years": [2023, 2024], "range": (1, 250)},
            {"pattern": "{:02d}-{}.pdf", "years": [2023, 2024], "range": (1, 100)},
            
            # Consolidated format
            {"pattern": "{:03d}-{} (Consolidated).pdf", "years": [2018, 2019, 2020, 2021, 2022], "range": (1, 200)},
            
            # By-law prefix format
            {"pattern": "By-law {:03d}-{}.pdf", "years": [2023, 2024], "range": (1, 100)},
        ]
        
        # Date folders to try
        date_folders = ["2023-03", "2023-12", "2024-03", "2024-06"]
        
        print("🎯 Trying direct PDF patterns...")
        
        for date_folder in date_folders:
            base_url = f"https://www.vaughan.ca/sites/default/files/{date_folder}/"
            
            for pattern_info in patterns:
                pattern = pattern_info["pattern"]
                years = pattern_info["years"]
                start, end = pattern_info["range"]
                
                # Test a sample of each pattern
                for year in years:
                    for num in range(start, min(start + 10, end)):  # Test first 10 of each pattern
                        filename = pattern.format(num, year)
                        pdf_url = urljoin(base_url, quote(filename))
                        
                        response = self.fetch_page(pdf_url)
                        if response and response.status_code == 200:
                            pdf_links.append({
                                'url': pdf_url,
                                'filename': filename,
                                'title': f"Vaughan {filename}"
                            })
                            print(f"✓ Found: {filename}")
        
        # Try some known specific files
        known_files = [
            "City of Vaughan Comprehensive Zoning By-law 001-2021 FINAL.pdf",
            "140-2018 (Consolidated).pdf",
            "221-2023.pdf",
            "046-2024.pdf",
            "By-law 010-2023.pdf",
            "122-2022 (Consolidated).pdf"
        ]
        
        for filename in known_files:
            # Try in root files directory
            pdf_url = f"https://www.vaughan.ca/sites/default/files/{quote(filename)}"
            response = self.fetch_page(pdf_url)
            if response and response.status_code == 200:
                pdf_links.append({
                    'url': pdf_url,
                    'filename': filename,
                    'title': f"Vaughan {filename}"
                })
                print(f"✓ Found known file: {filename}")
        
        return pdf_links
    
    def scrape_main_pages(self) -> List[Dict]:
        """Scrape the main bylaw library pages"""
        pdf_links = []
        
        # Main pages to check
        pages = [
            self.search_url,
            "https://www.vaughan.ca/residential/by-laws-and-enforcement/property-by-laws"
        ]
        
        for page_url in pages:
            print(f"📋 Scraping page: {page_url}")
            response = self.fetch_page(page_url)
            if response:
                page_pdfs = self.find_pdf_links(response.text)
                pdf_links.extend(page_pdfs)
                print(f"✓ Found {len(page_pdfs)} PDFs on page")
        
        return pdf_links
    
    def run_scrape(self) -> Dict:
        """Enhanced scraping with direct PDF links approach"""
        print(f"🚀 Starting Vaughan scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Scrape main pages
        print("📋 Scraping main bylaw pages...")
        main_pdfs = self.scrape_main_pages()
        all_pdfs.extend(main_pdfs)
        print(f"✓ Found {len(main_pdfs)} PDFs from main pages")
        
        # Strategy 2: Try direct patterns
        print("🎯 Trying direct PDF patterns...")
        direct_pdfs = self.try_direct_pdf_patterns()
        all_pdfs.extend(direct_pdfs)
        print(f"✓ Found {len(direct_pdfs)} PDFs via direct patterns")
        
        # Strategy 3: Explore date-based directories (sample)
        print("📁 Exploring date-based directories...")
        date_folders = self.generate_date_folders(2023, 2024)
        directory_count = 0
        
        # Check a sample of date folders
        for folder_url in date_folders[:6]:  # Sample first 6 folders
            folder_pdfs = self.scrape_directory_listing(folder_url)
            all_pdfs.extend(folder_pdfs)
            directory_count += len(folder_pdfs)
        
        print(f"✓ Found {directory_count} PDFs from directory exploration")
        
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