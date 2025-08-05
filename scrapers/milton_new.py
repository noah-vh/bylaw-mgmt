"""
Milton By-laws PDF Scraper - New Implementation
Based on analysis: Pattern B - Direct Links with Consistent Structure
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from urllib.parse import urljoin, urlparse
from .base_supabase import BaseSupabaseScraper

class MiltonScraper(BaseSupabaseScraper):
    """Milton municipality scraper - direct links with consistent structure"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.milton.ca"
        search_url = "https://www.milton.ca/en/town-hall/frequently-requested-by-laws.aspx"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract PDF links from page content"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # Look for PDF links in the town-hall resources structure
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.endswith('.pdf') and '/town-hall/resources/' in href:
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
    
    def scrape_frequently_requested_bylaws(self) -> List[Dict]:
        """Scrape the frequently requested bylaws page"""
        pdf_links = []
        
        print("📋 Scraping frequently requested bylaws page...")
        response = self.fetch_page(self.search_url)
        if not response:
            print("❌ Failed to fetch frequently requested bylaws page")
            return pdf_links
        
        page_pdfs = self.find_pdf_links(response.text)
        pdf_links.extend(page_pdfs)
        
        return pdf_links
    
    def scrape_main_bylaw_pages(self) -> List[Dict]:
        """Scrape additional bylaw pages"""
        pdf_links = []
        
        # Additional pages to check
        additional_pages = [
            "https://www.milton.ca/en/town-hall/by-laws.aspx",
            "https://www.milton.ca/en/town-hall/by-law-enforcement.aspx"
        ]
        
        for page_url in additional_pages:
            print(f"📄 Scraping additional page: {page_url}")
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
                "path": "Accessible_Bylaws/090-2004-Animal-Control--Consolidated.pdf",
                "title": "Animal Control By-law 090-2004 (Consolidated)"
            },
            {
                "path": "Accessible_Bylaws/088--2023-Regulate-and-Prohibit-the-Sale-and-Discharge-of-Fireworks-and-Repeal-By-law-037-2009.pdf",
                "title": "Fireworks Regulation By-law 088-2023"
            },
            {
                "path": "BY-LAW-064-2024.pdf",
                "title": "Milton By-law 064-2024"
            },
            {
                "path": "Accessible_Bylaws/042-2020-Community-Standards-By-law.pdf",
                "title": "Community Standards By-law 042-2020"
            },
            {
                "path": "Accessible_Bylaws/User-Fees-By-law-062-2024.pdf",
                "title": "User Fees By-law 062-2024"
            }
        ]
        
        print("🎯 Trying known PDF patterns...")
        
        for file_info in known_files:
            pdf_url = f"https://www.milton.ca/en/town-hall/resources/{file_info['path']}"
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
        patterns = [
            # Standard format
            {"base": "BY-LAW-{:03d}-{}.pdf", "years": [2023, 2024], "range": (1, 100)},
            
            # Accessible format
            {"base": "Accessible_Bylaws/{:03d}-{}-{}.pdf", "years": [2020, 2021, 2022, 2023, 2024], "range": (1, 100)},
        ]
        
        for pattern_info in patterns:
            base_pattern = pattern_info["base"]
            years = pattern_info["years"]
            start, end = pattern_info["range"]
            
            # Test a sample of each pattern
            for year in years:
                for num in range(start, min(start + 10, end)):  # Test first 10 of each pattern
                    try:
                        if "BY-LAW-{:03d}-{}.pdf" in base_pattern:
                            filename = base_pattern.format(num, year)
                        elif "Accessible_Bylaws/{:03d}-{}-{}.pdf" in base_pattern:
                            # Try common bylaw types
                            bylaw_types = ["Animal-Control", "Community-Standards", "Parking", "Noise", "Property"]
                            filename = base_pattern.format(num, year, bylaw_types[num % len(bylaw_types)])
                        else:
                            continue
                        
                        pdf_url = f"https://www.milton.ca/en/town-hall/resources/{filename}"
                        response = self.fetch_page(pdf_url)
                        if response and response.status_code == 200:
                            pdf_links.append({
                                'url': pdf_url,
                                'filename': filename,
                                'title': f"Milton {filename}"
                            })
                            print(f"✓ Found pattern match: {filename}")
                    except:
                        continue
        
        return pdf_links
    
    def run_scrape(self) -> Dict:
        """Enhanced scraping with direct links approach"""
        print(f"🚀 Starting Milton scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Scrape frequently requested bylaws
        print("📋 Scraping frequently requested bylaws...")
        freq_pdfs = self.scrape_frequently_requested_bylaws()
        all_pdfs.extend(freq_pdfs)
        print(f"✓ Found {len(freq_pdfs)} PDFs from frequently requested page")
        
        # Strategy 2: Scrape additional pages
        print("📄 Scraping additional bylaw pages...")
        additional_pdfs = self.scrape_main_bylaw_pages()
        all_pdfs.extend(additional_pdfs)
        print(f"✓ Found {len(additional_pdfs)} PDFs from additional pages")
        
        # Strategy 3: Try direct patterns
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