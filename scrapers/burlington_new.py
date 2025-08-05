"""
Burlington By-laws PDF Scraper - New Implementation
Based on analysis: Pattern B - Organized Directory Structure
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from urllib.parse import urljoin, urlparse, quote
from .base_supabase import BaseSupabaseScraper

class BurlingtonScraper(BaseSupabaseScraper):
    """Burlington municipality scraper - organized directory structure approach"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.burlington.ca"
        search_url = "https://www.burlington.ca/en/by-laws-and-animal-services/by-laws.aspx"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract PDF links from page content"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # Look for PDF links in the bylaw resources structure
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.endswith('.pdf') and '/by-laws-and-animal-services/resources/' in href:
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
    
    def scrape_recent_bylaws_by_year(self, start_year: int = 2016, end_year: int = 2024) -> List[Dict]:
        """Scrape recent bylaws using year-based directory structure"""
        pdf_links = []
        
        for year in range(start_year, end_year + 1):
            print(f"📅 Scraping {year} bylaws...")
            year_count = 0
            
            # Try sequential numbers for each year
            for num in range(1, 100):  # Try first 100 numbers per year
                bylaw_url = f"https://www.burlington.ca/en/by-laws-and-animal-services/resources/By-laws/By-law-Search/{year}-By-laws/{num:03d}-{year}-By-law.pdf"
                
                response = self.fetch_page(bylaw_url)
                if response and response.status_code == 200:
                    filename = f"{num:03d}-{year}-By-law.pdf"
                    pdf_links.append({
                        'url': bylaw_url,
                        'filename': filename,
                        'title': f"Burlington By-law {num:03d}-{year}"
                    })
                    year_count += 1
                elif response and response.status_code == 404:
                    # If we hit multiple 404s in a row, likely no more bylaws for this year
                    # Try a few more numbers in case there are gaps
                    continue
            
            print(f"✓ Found {year_count} bylaws for {year}")
        
        return pdf_links
    
    def scrape_older_bylaws(self, start_year: int = 2010, end_year: int = 2015) -> List[Dict]:
        """Scrape older bylaws using root directory structure"""
        pdf_links = []
        
        print(f"📚 Scraping older bylaws ({start_year}-{end_year})...")
        
        for year in range(start_year, end_year + 1):
            year_count = 0
            
            # Try sequential numbers for each year
            for num in range(1, 100):  # Try first 100 numbers per year
                # Format: 020-2010 By-law.pdf
                bylaw_url = f"https://www.burlington.ca/en/by-laws-and-animal-services/resources/By-laws/By-law-Search/{num:03d}-{year}%20By-law.pdf"
                
                response = self.fetch_page(bylaw_url)
                if response and response.status_code == 200:
                    filename = f"{num:03d}-{year} By-law.pdf"
                    pdf_links.append({
                        'url': bylaw_url,
                        'filename': filename,
                        'title': f"Burlington By-law {num:03d}-{year}"
                    })
                    year_count += 1
                elif response and response.status_code == 404:
                    continue
            
            print(f"✓ Found {year_count} older bylaws for {year}")
        
        return pdf_links
    
    def try_direct_pdf_patterns(self) -> List[Dict]:
        """Try to access PDFs using known URL patterns"""
        pdf_links = []
        
        # Known working files from analysis
        known_files = [
            {
                "path": "2024-By-laws/045-2024-By-law.pdf",
                "title": "Burlington By-law 045-2024"
            },
            {
                "path": "2023-By-laws/071-2023-By-law.pdf",
                "title": "Burlington By-law 071-2023"
            },
            {
                "path": "2022-By-laws/083-2022-By-law.pdf",
                "title": "Burlington By-law 083-2022"
            },
            {
                "path": "2021-By-laws/065-2021-By-law.pdf",
                "title": "Burlington By-law 065-2021"
            },
            {
                "path": "2015-By-laws/072-2015-By-law.pdf",
                "title": "Burlington By-law 072-2015"
            },
            {
                "path": "020-2010%20By-law.pdf",
                "title": "Burlington By-law 020-2010"
            }
        ]
        
        print("🎯 Trying known PDF patterns...")
        
        for file_info in known_files:
            pdf_url = f"https://www.burlington.ca/en/by-laws-and-animal-services/resources/By-laws/By-law-Search/{file_info['path']}"
            response = self.fetch_page(pdf_url)
            if response and response.status_code == 200:
                filename = os.path.basename(urlparse(pdf_url).path)
                pdf_links.append({
                    'url': pdf_url,
                    'filename': filename,
                    'title': file_info['title']
                })
                print(f"✓ Found: {file_info['title']}")
        
        return pdf_links
    
    def scrape_zoning_bylaws(self) -> List[Dict]:
        """Scrape zoning bylaws from the planning department"""
        pdf_links = []
        
        print("🏗️ Scraping zoning bylaws...")
        
        # Zoning bylaws are in a different location
        zoning_pages = [
            "https://www.burlington.ca/en/planning-and-development/zoning-by-law-amendments.aspx",
            "https://www.burlington.ca/en/planning-and-development/zoning-by-law.aspx"
        ]
        
        for page_url in zoning_pages:
            response = self.fetch_page(page_url)
            if response:
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Look for zoning PDF links
                for link in soup.find_all('a', href=True):
                    href = link['href']
                    if href.endswith('.pdf') and ('zoning' in href.lower() or 'Zoning' in href):
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
        """Enhanced scraping with organized directory structure approach"""
        print(f"🚀 Starting Burlington scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Try direct patterns first
        print("🎯 Trying direct PDF patterns...")
        direct_pdfs = self.try_direct_pdf_patterns()
        all_pdfs.extend(direct_pdfs)
        print(f"✓ Found {len(direct_pdfs)} PDFs via direct patterns")
        
        # Strategy 2: Scrape recent bylaws (2020-2024)
        print("📅 Scraping recent bylaws (2020-2024)...")
        recent_pdfs = self.scrape_recent_bylaws_by_year(2020, 2024)
        all_pdfs.extend(recent_pdfs)
        print(f"✓ Found {len(recent_pdfs)} recent bylaws")
        
        # Strategy 3: Scrape older bylaws (2015-2019)
        print("📚 Scraping older bylaws (2015-2019)...")
        older_pdfs = self.scrape_older_bylaws(2015, 2019)
        all_pdfs.extend(older_pdfs)
        print(f"✓ Found {len(older_pdfs)} older bylaws")
        
        # Strategy 4: Scrape zoning bylaws
        print("🏗️ Scraping zoning bylaws...")
        zoning_pdfs = self.scrape_zoning_bylaws()
        all_pdfs.extend(zoning_pdfs)
        print(f"✓ Found {len(zoning_pdfs)} zoning bylaws")
        
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