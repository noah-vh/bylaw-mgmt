"""
Richmond Hill By-laws PDF Scraper - New Implementation
Based on analysis: Pattern C - Structured Directory-Based
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from urllib.parse import urljoin, urlparse
from .base_supabase import BaseSupabaseScraper

class RichmondHillScraper(BaseSupabaseScraper):
    """Richmond Hill municipality scraper - structured directory approach"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.richmondhill.ca"
        search_url = "https://www.richmondhill.ca/en/our-services/By-laws.aspx"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract PDF links from page content"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # Look for PDF links in the shared-content/resources structure
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.endswith('.pdf') and '/shared-content/resources/' in href:
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
        # Look for pagination controls
        next_link = soup.find('a', {'class': 'next'})
        if next_link and next_link.get('href'):
            return urljoin(self.base_url, next_link['href'])
        
        return None
    
    def scrape_bylaw_service_pages(self) -> List[Dict]:
        """Scrape main bylaw service pages"""
        pdf_links = []
        
        # Main service pages to check
        service_pages = [
            self.search_url,
            "https://www.richmondhill.ca/en/living-here/Property-Standards.aspx",
            "https://www.richmondhill.ca/en/our-services/Grass-and-Weeds.aspx",
            "https://www.richmondhill.ca/en/our-services/Noise-Control.aspx",
            "https://www.richmondhill.ca/en/our-services/Business-Licensing.aspx",
            "https://www.richmondhill.ca/en/development-and-construction/Development-Charges.aspx"
        ]
        
        for page_url in service_pages:
            print(f"📋 Scraping service page: {page_url}")
            response = self.fetch_page(page_url)
            if response:
                page_pdfs = self.find_pdf_links(response.text)
                pdf_links.extend(page_pdfs)
                print(f"✓ Found {len(page_pdfs)} PDFs on page")
        
        return pdf_links
    
    def try_direct_pdf_patterns(self) -> List[Dict]:
        """Try to access PDFs using known URL patterns"""
        pdf_links = []
        
        # Known working files from analysis
        known_files = [
            {
                "path": "documents/143-sign-bylaw.pdf",
                "title": "Sign Bylaw 143"
            },
            {
                "path": "documents/Community-Standards-By-laws/112-18-Cannabis-By-law.pdf",
                "title": "Cannabis By-law 112-18"
            },
            {
                "path": "documents/Development-Charges/By-law-45-19.pdf",
                "title": "Development Charges By-law 45-19"
            },
            {
                "path": "Administrative-Penalty-Bylaw-Consolidated-Office-Use-Only-June-28-2023.pdf",
                "title": "Administrative Penalty Bylaw (Consolidated 2023)"
            },
            {
                "path": "documents/Appendix-B-Yonge-Bernard-KDA-Zoning-Bylaw.pdf",
                "title": "Zoning Bylaw - Yonge Bernard KDA"
            }
        ]
        
        print("🎯 Trying known PDF patterns...")
        
        for file_info in known_files:
            if file_info["path"].startswith("documents/"):
                pdf_url = f"https://www.richmondhill.ca/en/shared-content/resources/{file_info['path']}"
            else:
                pdf_url = f"https://www.richmondhill.ca/en/shared-content/resources/{file_info['path']}"
            
            response = self.fetch_page(pdf_url)
            if response and response.status_code == 200:
                filename = os.path.basename(urlparse(pdf_url).path)
                pdf_links.append({
                    'url': pdf_url,
                    'filename': filename,
                    'title': file_info['title']
                })
                print(f"✓ Found: {file_info['title']}")
        
        # Try systematic patterns
        base_paths = [
            "documents/",
            "documents/Community-Standards-By-laws/",
            "documents/Development-Charges/",
            "documents/Business-Services/",
            "documents/Property-Standards/"
        ]
        
        # Common bylaw patterns
        patterns = [
            "{:03d}-{}-bylaw.pdf",
            "{:03d}-{:02d}-{}-By-law.pdf",
            "By-law-{:03d}-{}.pdf",
            "{}-By-law-{:03d}-{}.pdf"
        ]
        
        for base_path in base_paths:
            for pattern in patterns[:2]:  # Try first 2 patterns per base path
                for year in [2023, 2024]:
                    for num in range(1, 21):  # Try first 20 numbers
                        try:
                            if "{:03d}-{}-bylaw.pdf" in pattern:
                                filename = pattern.format(num, year)
                            elif "{:03d}-{:02d}-{}-By-law.pdf" in pattern:
                                filename = pattern.format(num, year % 100, year)
                            elif "By-law-{:03d}-{}.pdf" in pattern:
                                filename = pattern.format(num, year)
                            else:
                                continue
                            
                            pdf_url = f"https://www.richmondhill.ca/en/shared-content/resources/{base_path}{filename}"
                            response = self.fetch_page(pdf_url)
                            if response and response.status_code == 200:
                                pdf_links.append({
                                    'url': pdf_url,
                                    'filename': filename,
                                    'title': f"Richmond Hill {filename}"
                                })
                                print(f"✓ Found pattern match: {filename}")
                        except:
                            continue
        
        return pdf_links
    
    def run_scrape(self) -> Dict:
        """Enhanced scraping with structured directory approach"""
        print(f"🚀 Starting Richmond Hill scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Scrape main service pages
        print("📋 Scraping main service pages...")
        service_pdfs = self.scrape_bylaw_service_pages()
        all_pdfs.extend(service_pdfs)
        print(f"✓ Found {len(service_pdfs)} PDFs from service pages")
        
        # Strategy 2: Try direct patterns
        print("🎯 Trying direct PDF patterns...")
        direct_pdfs = self.try_direct_pdf_patterns()
        all_pdfs.extend(direct_pdfs)
        print(f"✓ Found {len(direct_pdfs)} PDFs via direct patterns")
        
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