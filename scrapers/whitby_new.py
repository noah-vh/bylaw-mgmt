"""
Whitby By-laws PDF Scraper - New Implementation
Based on analysis: Pattern B - Database-Driven with Unique Identifiers
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
import json
from urllib.parse import urljoin, urlparse
from .base_supabase import BaseSupabaseScraper

class WhitbyScraper(BaseSupabaseScraper):
    """Whitby municipality scraper - database-driven with unique identifiers"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.whitby.ca"
        search_url = "https://www.whitby.ca/modules/bylaws/bylaw/search"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract PDF links from page content"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # Look for bylaw download links
        for link in soup.find_all('a', href=True):
            href = link['href']
            if '/Modules/Bylaws/Bylaw/Download/' in href:
                full_url = urljoin(self.base_url, href)
                link_text = link.get_text(strip=True)
                
                # Extract GUID from URL
                guid = href.split('/')[-1]
                filename = f"bylaw_{guid}.pdf"
                
                pdf_links.append({
                    'url': full_url,
                    'filename': filename,
                    'title': link_text or filename,
                    'guid': guid
                })
        
        return pdf_links
    
    def handle_pagination(self, soup: BeautifulSoup) -> Optional[str]:
        """Handle pagination if present"""
        # Look for pagination controls
        next_link = soup.find('a', {'class': 'next'})
        if next_link and next_link.get('href'):
            return urljoin(self.base_url, next_link['href'])
        
        return None
    
    def scrape_main_bylaw_pages(self) -> List[Dict]:
        """Scrape main bylaw pages for any direct links"""
        pdf_links = []
        
        # Main pages to check
        main_pages = [
            "https://www.whitby.ca/en/town-hall/by-laws.aspx",
            self.search_url
        ]
        
        for page_url in main_pages:
            print(f"📄 Scraping main page: {page_url}")
            response = self.fetch_page(page_url)
            if response:
                page_pdfs = self.find_pdf_links(response.text)
                pdf_links.extend(page_pdfs)
                print(f"✓ Found {len(page_pdfs)} PDFs on main page")
        
        return pdf_links
    
    def try_direct_pdf_patterns(self) -> List[Dict]:
        """Try to access PDFs using known GUID patterns"""
        pdf_links = []
        
        # Known working files from analysis
        known_files = [
            {
                "guid": "c01bce32-5f68-4e82-be8b-c11a86178ede",
                "title": "Noise By-law 6917-14"
            },
            {
                "guid": "67fcc688-1dbd-4569-a65c-f88565f15a32",
                "title": "Site Alteration By-law 7425-18"
            },
            {
                "guid": "c19d9132-4c19-41b3-9620-1e3fc337a470",
                "title": "Signing Authority By-law 7127-16"
            }
        ]
        
        print("🎯 Trying known GUID patterns...")
        
        for file_info in known_files:
            pdf_url = f"https://www.whitby.ca/Modules/Bylaws/Bylaw/Download/{file_info['guid']}"
            response = self.fetch_page(pdf_url)
            if response and response.status_code == 200:
                pdf_links.append({
                    'url': pdf_url,
                    'filename': f"bylaw_{file_info['guid']}.pdf",
                    'title': file_info['title'],
                    'guid': file_info['guid']
                })
                print(f"✓ Found: {file_info['title']}")
        
        return pdf_links
    
    def try_bylaw_details_pages(self) -> List[Dict]:
        """Try to access known bylaw details pages"""
        pdf_links = []
        
        # Known details page GUIDs
        known_details = [
            {
                "details_guid": "dd6cb39d-0b53-4008-8653-dc637e18d953",
                "title": "Noise By-law 6917-14"
            },
            {
                "details_guid": "8f1e0a67-899b-4884-87d4-27a7a91d5203",
                "title": "Site Alteration By-law 7425-18"
            },
            {
                "details_guid": "0aab3f46-f174-4654-8790-ce2db71f5a19",
                "title": "Signing Authority By-law 7127-16"
            }
        ]
        
        print("📋 Trying known details pages...")
        
        for details_info in known_details:
            details_url = f"https://www.whitby.ca/Modules/Bylaws/Bylaw/Details/{details_info['details_guid']}"
            response = self.fetch_page(details_url)
            if response and response.status_code == 200:
                # Extract PDF download links from the details page
                detail_pdfs = self.find_pdf_links(response.text)
                for pdf in detail_pdfs:
                    pdf['title'] = details_info['title']
                pdf_links.extend(detail_pdfs)
                print(f"✓ Found details for: {details_info['title']}")
        
        return pdf_links
    
    def search_bylaws_by_category(self) -> List[Dict]:
        """Attempt to search bylaws by common categories"""
        pdf_links = []
        
        # Common bylaw categories/keywords
        categories = [
            "noise", "site", "alteration", "signing", "authority", "traffic", 
            "parking", "tree", "property", "standards", "animal", "business",
            "licensing", "zoning", "development", "fire", "safety"
        ]
        
        print("🔍 Attempting category-based searches...")
        
        # Try to access the search page and look for any category links
        response = self.fetch_page(self.search_url)
        if response:
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Look for category links or search results
            for link in soup.find_all('a', href=True):
                href = link['href']
                if '/Modules/Bylaws/Bylaw/Details/' in href:
                    details_url = urljoin(self.base_url, href)
                    link_text = link.get_text(strip=True)
                    
                    # Visit the details page to get the PDF
                    details_response = self.fetch_page(details_url)
                    if details_response:
                        detail_pdfs = self.find_pdf_links(details_response.text)
                        for pdf in detail_pdfs:
                            pdf['title'] = link_text
                        pdf_links.extend(detail_pdfs)
                        print(f"✓ Found bylaw via search: {link_text}")
        
        return pdf_links
    
    def run_scrape(self) -> Dict:
        """Enhanced scraping with database-driven approach"""
        print(f"🚀 Starting Whitby scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Scrape main pages
        print("📄 Scraping main bylaw pages...")
        main_pdfs = self.scrape_main_bylaw_pages()
        all_pdfs.extend(main_pdfs)
        print(f"✓ Found {len(main_pdfs)} PDFs from main pages")
        
        # Strategy 2: Try direct GUID patterns
        print("🎯 Trying direct GUID patterns...")
        direct_pdfs = self.try_direct_pdf_patterns()
        all_pdfs.extend(direct_pdfs)
        print(f"✓ Found {len(direct_pdfs)} PDFs via direct patterns")
        
        # Strategy 3: Try details pages
        print("📋 Trying known details pages...")
        details_pdfs = self.try_bylaw_details_pages()
        all_pdfs.extend(details_pdfs)
        print(f"✓ Found {len(details_pdfs)} PDFs via details pages")
        
        # Strategy 4: Search by category
        print("🔍 Attempting category-based searches...")
        search_pdfs = self.search_bylaws_by_category()
        all_pdfs.extend(search_pdfs)
        print(f"✓ Found {len(search_pdfs)} PDFs via category searches")
        
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