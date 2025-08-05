"""
Pickering By-laws PDF Scraper - New Implementation
Based on analysis: Pattern B - Predictable Media Folder Pattern
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from urllib.parse import urljoin, urlparse
from .base_supabase import BaseSupabaseScraper

class PickeringScraper(BaseSupabaseScraper):
    """Pickering municipality scraper - predictable media folder pattern"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.pickering.ca"
        search_url = "https://www.pickering.ca/property-roads-safety/property-standards-and-by-laws/by-laws/"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract PDF links from page content"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # Look for PDF links in the media folder structure
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.endswith('.pdf') and '/media/' in href:
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
    
    def scrape_main_bylaw_table(self) -> List[Dict]:
        """Scrape the main bylaw table"""
        pdf_links = []
        
        print("📋 Scraping main bylaw table...")
        response = self.fetch_page(self.search_url)
        if not response:
            print("❌ Failed to fetch main bylaw page")
            return pdf_links
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Look for the bylaw table
        tables = soup.find_all('table')
        for table in tables:
            # Check if this is the bylaws table
            headers = table.find_all(['th', 'td'])
            header_text = ' '.join([h.get_text(strip=True) for h in headers[:5]])
            
            if any(keyword in header_text.lower() for keyword in ['bylaw', 'by-law', 'number', 'title']):
                print("✓ Found bylaw table")
                
                # Extract PDF links from this table
                for row in table.find_all('tr'):
                    for cell in row.find_all(['td', 'th']):
                        for link in cell.find_all('a', href=True):
                            href = link['href']
                            if href.endswith('.pdf') and '/media/' in href:
                                full_url = urljoin(self.base_url, href)
                                link_text = link.get_text(strip=True)
                                filename = os.path.basename(urlparse(full_url).path)
                                
                                # Try to extract bylaw number from the row
                                row_text = row.get_text(strip=True)
                                bylaw_number = self.extract_bylaw_number(row_text)
                                
                                pdf_links.append({
                                    'url': full_url,
                                    'filename': filename,
                                    'title': link_text or f"Pickering Bylaw {bylaw_number}" if bylaw_number else filename,
                                    'bylaw_number': bylaw_number
                                })
        
        return pdf_links
    
    def extract_bylaw_number(self, text: str) -> Optional[str]:
        """Extract bylaw number from text"""
        # Look for patterns like "6649/06", "1887/84", etc.
        patterns = [
            r'(\d{4}/\d{2})',
            r'(\d{3,4}-\d{2})',
            r'By-law\s+(\d+)',
            r'(\d+/\d+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        
        return None
    
    def try_direct_pdf_patterns(self) -> List[Dict]:
        """Try to access PDFs using known URL patterns"""
        pdf_links = []
        
        # Known working files from analysis
        known_files = [
            {
                "media_id": "naol45v2",
                "filename": "b6649_06bodyrubparlour.pdf",
                "title": "Body Rub Parlour By-law 6649/06"
            },
            {
                "media_id": "ffmdsrx5",
                "filename": "b1887_84businesslicensing-acc.pdf",
                "title": "Business Licensing By-law 1887/84"
            },
            {
                "media_id": "riwjjos0",
                "filename": "b5621_00carnival.pdf",
                "title": "Carnival By-law 5621/00"
            },
            {
                "media_id": "nswfjvff",
                "filename": "traffic-and-parking-by-law-6604-05-post-8098-24.pdf",
                "title": "Traffic and Parking By-law 6604/05"
            },
            {
                "media_id": "dfplhxaj",
                "filename": "responsiblepetbylaw-acc.pdf",
                "title": "Responsible Pet Ownership By-law"
            }
        ]
        
        print("🎯 Trying known PDF patterns...")
        
        for file_info in known_files:
            pdf_url = f"https://www.pickering.ca/media/{file_info['media_id']}/{file_info['filename']}"
            response = self.fetch_page(pdf_url)
            if response and response.status_code == 200:
                pdf_links.append({
                    'url': pdf_url,
                    'filename': file_info['filename'],
                    'title': file_info['title']
                })
                print(f"✓ Found: {file_info['title']}")
        
        return pdf_links
    
    def scrape_additional_pages(self) -> List[Dict]:
        """Scrape additional pages that might have bylaw links"""
        pdf_links = []
        
        # Additional pages to check
        additional_pages = [
            "https://www.pickering.ca/property-roads-safety/property-standards-and-by-laws/",
            "https://www.pickering.ca/property-roads-safety/property-standards-and-by-laws/property-standards/",
            "https://www.pickering.ca/government/municipal-law-enforcement/"
        ]
        
        for page_url in additional_pages:
            print(f"📄 Scraping additional page: {page_url}")
            response = self.fetch_page(page_url)
            if response:
                page_pdfs = self.find_pdf_links(response.text)
                pdf_links.extend(page_pdfs)
                print(f"✓ Found {len(page_pdfs)} PDFs on additional page")
        
        return pdf_links
    
    def run_scrape(self) -> Dict:
        """Enhanced scraping with media folder pattern approach"""
        print(f"🚀 Starting Pickering scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Scrape main bylaw table
        print("📋 Scraping main bylaw table...")
        table_pdfs = self.scrape_main_bylaw_table()
        all_pdfs.extend(table_pdfs)
        print(f"✓ Found {len(table_pdfs)} PDFs from main table")
        
        # Strategy 2: Try direct patterns
        print("🎯 Trying direct PDF patterns...")
        direct_pdfs = self.try_direct_pdf_patterns()
        all_pdfs.extend(direct_pdfs)
        print(f"✓ Found {len(direct_pdfs)} PDFs via direct patterns")
        
        # Strategy 3: Scrape additional pages
        print("📄 Scraping additional pages...")
        additional_pdfs = self.scrape_additional_pages()
        all_pdfs.extend(additional_pdfs)
        print(f"✓ Found {len(additional_pdfs)} PDFs from additional pages")
        
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