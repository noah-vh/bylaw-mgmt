"""
Toronto By-laws PDF Scraper - New Implementation
Based on analysis: Pattern A - Direct PDF Links
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from urllib.parse import urljoin, urlparse
from .base_supabase import BaseSupabaseScraper

class TorontoScraper(BaseSupabaseScraper):
    """Toronto municipality scraper - dual strategy for municipal code and individual bylaws"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.toronto.ca"
        search_url = "https://www.toronto.ca/legdocs/bylaws/"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract PDF links using Toronto's dual pattern approach"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # Strategy 1: Look for direct PDF links (municipal code pattern)
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
        
        # Strategy 2: Look for year-based directory links
        for link in soup.find_all('a', href=True):
            href = link['href']
            # Look for year directories (2020-2024)
            if re.search(r'/bylaws/202[0-4]/', href):
                full_url = urljoin(self.base_url, href)
                link_text = link.get_text(strip=True)
                
                pdf_links.append({
                    'url': full_url,
                    'filename': 'directory_listing.html',
                    'title': f"Bylaw Directory - {link_text}"
                })
        
        return pdf_links
    
    def handle_pagination(self, soup: BeautifulSoup) -> Optional[str]:
        """Handle navigation to year-based directories"""
        # Look for year links to process multiple years
        year_links = soup.find_all('a', href=re.compile(r'/bylaws/202[0-4]/'))
        
        # For now, return None as we'll handle multiple years in the main scraping logic
        return None
    
    def scrape_municipal_code(self) -> List[Dict]:
        """Scrape municipal code PDFs directly"""
        pdf_links = []
        
        # Target the municipal code page
        municipal_code_url = "https://www.toronto.ca/legdocs/bylaws/lawmcode.htm"
        response = self.fetch_page(municipal_code_url)
        
        if response:
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Look for chapter links
            for link in soup.find_all('a', href=True):
                href = link['href']
                if '/municode/1184_' in href and href.endswith('.pdf'):
                    full_url = urljoin(self.base_url, href)
                    link_text = link.get_text(strip=True)
                    filename = os.path.basename(urlparse(full_url).path)
                    
                    pdf_links.append({
                        'url': full_url,
                        'filename': filename,
                        'title': f"Municipal Code - {link_text}"
                    })
        
        return pdf_links
    
    def scrape_year_directory(self, year: str) -> List[Dict]:
        """Scrape bylaws from a specific year directory"""
        pdf_links = []
        
        year_url = f"https://www.toronto.ca/legdocs/bylaws/{year}/"
        response = self.fetch_page(year_url)
        
        if response:
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Look for bylaw PDF links
            for link in soup.find_all('a', href=True):
                href = link['href']
                if href.endswith('.pdf') and '/bylaws/' in href:
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
        """Enhanced scraping with dual strategy"""
        print(f"🚀 Starting Toronto scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Municipal Code
        print("🏛️ Scraping Municipal Code...")
        municipal_code_pdfs = self.scrape_municipal_code()
        all_pdfs.extend(municipal_code_pdfs)
        print(f"✓ Found {len(municipal_code_pdfs)} municipal code PDFs")
        
        # Strategy 2: Year-based directories (2022-2024)
        for year in ['2022', '2023', '2024']:
            print(f"📅 Scraping {year} bylaws...")
            year_pdfs = self.scrape_year_directory(year)
            all_pdfs.extend(year_pdfs)
            print(f"✓ Found {len(year_pdfs)} PDFs for {year}")
        
        print(f"📊 Total PDFs found: {len(all_pdfs)}")
        
        # Store documents found
        self.documents_found = all_pdfs
        
        return self.get_scrape_summary()