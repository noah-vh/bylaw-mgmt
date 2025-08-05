"""
Mississauga By-laws PDF Scraper - New Implementation
Based on analysis: Pattern B - Detail Page Navigation
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
import time
from urllib.parse import urljoin, urlparse
from .base_supabase import BaseSupabaseScraper

class MississaugaScraper(BaseSupabaseScraper):
    """Mississauga municipality scraper - two-step detail page navigation"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.mississauga.ca"
        search_url = "https://www.mississauga.ca/council/by-laws/"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract detail page links from the main bylaws page"""
        soup = BeautifulSoup(html_content, 'html.parser')
        detail_links = []
        
        # Look for publication detail page links
        for link in soup.find_all('a', href=True):
            href = link['href']
            if '/publication/' in href:
                full_url = urljoin(self.base_url, href)
                link_text = link.get_text(strip=True)
                
                detail_links.append({
                    'url': full_url,
                    'filename': 'detail_page.html',
                    'title': link_text
                })
        
        return detail_links
    
    def handle_pagination(self, soup: BeautifulSoup) -> Optional[str]:
        """Handle pagination on main bylaws page"""
        # Look for pagination links
        next_link = soup.find('a', {'class': 'next'})
        if next_link and next_link.get('href'):
            return urljoin(self.base_url, next_link['href'])
        
        return None
    
    def extract_pdf_from_detail_page(self, detail_url: str) -> Optional[Dict]:
        """Extract PDF link from a bylaw detail page"""
        print(f"📄 Checking detail page: {detail_url}")
        
        response = self.fetch_page(detail_url)
        if not response:
            print(f"❌ Failed to fetch detail page: {detail_url}")
            return None
        
        if response.status_code == 404:
            print(f"⚠️  Detail page not found (404): {detail_url}")
            return None
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Look for PDF download links
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.endswith('.pdf') and '/wp-content/uploads/' in href:
                full_url = urljoin(self.base_url, href)
                link_text = link.get_text(strip=True)
                filename = os.path.basename(urlparse(full_url).path)
                
                print(f"✓ Found PDF: {filename}")
                return {
                    'url': full_url,
                    'filename': filename,
                    'title': link_text or filename,
                    'source_page': detail_url
                }
        
        print(f"❌ No PDF found on detail page: {detail_url}")
        return None
    
    def scrape_all_detail_pages(self) -> List[Dict]:
        """Scrape all bylaw detail pages to find PDFs"""
        pdf_links = []
        
        # First, get the main bylaws page
        print("🔍 Fetching main bylaws page...")
        response = self.fetch_page(self.search_url)
        if not response:
            print("❌ Failed to fetch main bylaws page")
            return pdf_links
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Find all detail page links
        detail_urls = []
        for link in soup.find_all('a', href=True):
            href = link['href']
            if '/publication/' in href and href not in detail_urls:
                detail_urls.append(urljoin(self.base_url, href))
        
        print(f"📋 Found {len(detail_urls)} detail pages to check")
        
        # Process each detail page
        for i, detail_url in enumerate(detail_urls):
            print(f"📄 Processing detail page {i+1}/{len(detail_urls)}")
            
            pdf_info = self.extract_pdf_from_detail_page(detail_url)
            if pdf_info:
                pdf_links.append(pdf_info)
            
            # Add delay to be respectful
            time.sleep(1)
        
        return pdf_links
    
    def try_direct_pdf_patterns(self) -> List[Dict]:
        """Try to access PDFs using known URL patterns"""
        pdf_links = []
        
        # Common bylaw names from analysis
        common_bylaws = [
            "accessible-parking-by-law-0010-2016",
            "animal-care-and-control-by-law-0098-2004",
            "business-licensing-by-law-0001-2006",
            "noise-by-law-0018-2018",
            "parking-by-law-0230-2021",
            "property-standards-by-law-0159-2007",
            "sign-by-law-0225-2007",
            "traffic-by-law-0555-2000",
            "waste-collection-by-law-0395-2016",
            "zoning-by-law-0225-2007"
        ]
        
        # Try different date patterns for each bylaw
        date_patterns = [
            "2024/08/21145710",
            "2024/07/30140212", 
            "2024/06/30140212",
            "2023/12/15120000",
            "2023/09/15120000",
            "2022/01/01120000",
            "2021/06/01120000",
            "2020/07/06104036"
        ]
        
        print("🎯 Trying direct PDF access patterns...")
        
        for bylaw_name in common_bylaws:
            for date_pattern in date_patterns[:3]:  # Try first 3 date patterns
                # Extract filename from bylaw name
                filename_parts = bylaw_name.split('-')
                if len(filename_parts) >= 4:
                    # Convert to proper filename format
                    filename = f"{' '.join(filename_parts[:-3]).title()}-By-law-{filename_parts[-2]}-{filename_parts[-1]}.pdf"
                    
                    pdf_url = f"https://www.mississauga.ca/wp-content/uploads/{date_pattern}/{filename}"
                    
                    response = self.fetch_page(pdf_url)
                    if response and response.status_code == 200:
                        pdf_links.append({
                            'url': pdf_url,
                            'filename': filename,
                            'title': f"Mississauga {filename}"
                        })
                        print(f"✓ Found direct PDF: {filename}")
                        break  # Found this bylaw, move to next
        
        return pdf_links
    
    def run_scrape(self) -> Dict:
        """Enhanced scraping with two-step navigation"""
        print(f"🚀 Starting Mississauga scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Detail page navigation (primary approach)
        print("🔍 Scraping via detail page navigation...")
        detail_pdfs = self.scrape_all_detail_pages()
        all_pdfs.extend(detail_pdfs)
        print(f"✓ Found {len(detail_pdfs)} PDFs via detail pages")
        
        # Strategy 2: Direct URL pattern attempts (fallback)
        print("🎯 Trying direct URL patterns...")
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