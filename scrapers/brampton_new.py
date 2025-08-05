"""
Brampton By-laws PDF Scraper - New Implementation
Based on analysis: Pattern A - Direct PDF Links (Multi-pattern)
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from urllib.parse import urljoin, urlparse
from .base_supabase import BaseSupabaseScraper

class BramptonScraper(BaseSupabaseScraper):
    """Brampton municipality scraper - multi-pattern approach"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.brampton.ca"
        search_url = "https://www.brampton.ca/EN/City-Hall/Bylaws/Pages/Welcome.aspx"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract PDF links from the main bylaws page"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # Look for direct PDF links on the main page
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
        """No pagination needed for Brampton's direct approach"""
        return None
    
    def scrape_archive_bylaws(self, start_year: int = 2020, end_year: int = 2024) -> List[Dict]:
        """Scrape bylaws from the archive using year-based iteration"""
        pdf_links = []
        
        for year in range(start_year, end_year + 1):
            print(f"📅 Scraping {year} archive bylaws...")
            year_count = 0
            
            # Try sequential numbers for each year
            for num in range(1, 300):  # Adjust range based on expected volume
                bylaw_url = f"https://www.brampton.ca/EN/City-Hall/Bylaws/Archive/{num:03d}-{year}.pdf"
                
                # Check if PDF exists
                response = self.fetch_page(bylaw_url)
                if response and response.status_code == 200:
                    filename = f"{num:03d}-{year}.pdf"
                    pdf_links.append({
                        'url': bylaw_url,
                        'filename': filename,
                        'title': f"Bylaw {num:03d}-{year}"
                    })
                    year_count += 1
                elif response and response.status_code == 404:
                    # If we hit multiple 404s in a row, likely no more bylaws for this year
                    break
            
            print(f"✓ Found {year_count} archive bylaws for {year}")
        
        return pdf_links
    
    def scrape_current_bylaws(self) -> List[Dict]:
        """Scrape current bylaws from the All Bylaws directory"""
        pdf_links = []
        
        # Try to access the current bylaws page
        current_url = "https://www.brampton.ca/EN/City-Hall/Bylaws/Pages/All-Bylaws.aspx"
        response = self.fetch_page(current_url)
        
        if response:
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Look for PDF links in the current bylaws section
            for link in soup.find_all('a', href=True):
                href = link['href']
                if 'All%20Bylaws' in href and href.endswith('.pdf'):
                    full_url = urljoin(self.base_url, href)
                    link_text = link.get_text(strip=True)
                    filename = os.path.basename(urlparse(full_url).path)
                    
                    pdf_links.append({
                        'url': full_url,
                        'filename': filename,
                        'title': link_text or filename
                    })
        
        return pdf_links
    
    def scrape_traffic_bylaws(self) -> List[Dict]:
        """Scrape traffic bylaws with known pattern"""
        pdf_links = []
        
        # Base traffic bylaw number
        base_num = "9393"
        
        # Try common suffixes
        suffixes = ["TXT", "S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10"]
        
        for suffix in suffixes:
            traffic_url = f"https://www.brampton.ca/EN/City-Hall/Bylaws/Traffic%20ByLaws/{base_num}{suffix}.pdf"
            
            response = self.fetch_page(traffic_url)
            if response and response.status_code == 200:
                filename = f"{base_num}{suffix}.pdf"
                pdf_links.append({
                    'url': traffic_url,
                    'filename': filename,
                    'title': f"Traffic Bylaw {base_num}{suffix}"
                })
        
        return pdf_links
    
    def run_scrape(self) -> Dict:
        """Enhanced scraping with multi-pattern approach"""
        print(f"🚀 Starting Brampton scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Current bylaws from main page
        print("📋 Scraping current bylaws...")
        current_pdfs = self.scrape_current_bylaws()
        all_pdfs.extend(current_pdfs)
        print(f"✓ Found {len(current_pdfs)} current bylaws")
        
        # Strategy 2: Archive bylaws (year-based)
        print("📚 Scraping archive bylaws...")
        archive_pdfs = self.scrape_archive_bylaws()
        all_pdfs.extend(archive_pdfs)
        print(f"✓ Found {len(archive_pdfs)} archive bylaws")
        
        # Strategy 3: Traffic bylaws
        print("🚦 Scraping traffic bylaws...")
        traffic_pdfs = self.scrape_traffic_bylaws()
        all_pdfs.extend(traffic_pdfs)
        print(f"✓ Found {len(traffic_pdfs)} traffic bylaws")
        
        print(f"📊 Total PDFs found: {len(all_pdfs)}")
        
        # Store documents found
        self.documents_found = all_pdfs
        
        return self.get_scrape_summary()