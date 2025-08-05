"""
Markham By-laws PDF Scraper - New Implementation
Based on analysis: Pattern C - Hybrid Pattern (Mixed Organization)
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from urllib.parse import urljoin, urlparse, quote
from .base_supabase import BaseSupabaseScraper

class MarkhamScraper(BaseSupabaseScraper):
    """Markham municipality scraper - hybrid pattern approach"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.markham.ca"
        search_url = "https://www.markham.ca/about-city-markham/city-hall/bylaws"
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
    
    def discover_category_pages(self) -> List[str]:
        """Discover all category pages from the main bylaws page"""
        category_urls = []
        
        print("🔍 Discovering category pages...")
        response = self.fetch_page(self.search_url)
        if not response:
            return category_urls
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Look for category links on the main page
        for link in soup.find_all('a', href=True):
            href = link['href']
            link_text = link.get_text(strip=True).lower()
            
            # Identify bylaw-related category pages
            if any(keyword in link_text for keyword in [
                'bylaw', 'by-law', 'zoning', 'animal', 'tree', 'property', 
                'parking', 'noise', 'sign', 'business', 'development'
            ]):
                if 'markham.ca' in href or href.startswith('/'):
                    full_url = urljoin(self.base_url, href)
                    if full_url not in category_urls:
                        category_urls.append(full_url)
        
        # Add known category pages
        known_categories = [
            "/permits-licenses-taxes/business-licenses",
            "/permits-licenses-taxes/bylaws-off-leash-areas",
            "/residents/animal-services",
            "/residents/property-standards",
            "/residents/tree-preservation",
            "/residents/noise-control",
            "/development/development-charges",
            "/development/zoning"
        ]
        
        for category in known_categories:
            full_url = urljoin(self.base_url, category)
            if full_url not in category_urls:
                category_urls.append(full_url)
        
        return category_urls
    
    def scrape_category_page(self, category_url: str) -> List[Dict]:
        """Scrape PDFs from a specific category page"""
        pdf_links = []
        
        print(f"📂 Scraping category: {category_url}")
        response = self.fetch_page(category_url)
        if not response:
            return pdf_links
        
        category_pdfs = self.find_pdf_links(response.text)
        pdf_links.extend(category_pdfs)
        
        # Look for sub-pages on this category page
        soup = BeautifulSoup(response.content, 'html.parser')
        subpage_links = []
        
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.startswith('/') and 'markham.ca' not in href:
                full_url = urljoin(self.base_url, href)
                link_text = link.get_text(strip=True).lower()
                
                # Check if it's a relevant sub-page
                if any(keyword in link_text for keyword in [
                    'bylaw', 'by-law', 'regulation', 'policy', 'standard'
                ]):
                    subpage_links.append(full_url)
        
        # Scrape sub-pages (limit to avoid infinite recursion)
        for subpage_url in subpage_links[:5]:  # Limit to 5 sub-pages per category
            if subpage_url != category_url:  # Avoid circular references
                print(f"📄 Checking sub-page: {subpage_url}")
                response = self.fetch_page(subpage_url)
                if response:
                    subpage_pdfs = self.find_pdf_links(response.text)
                    pdf_links.extend(subpage_pdfs)
        
        return pdf_links
    
    def try_direct_pdf_patterns(self) -> List[Dict]:
        """Try to access PDFs using known URL patterns"""
        pdf_links = []
        
        # Known working files from analysis
        known_files = [
            {
                "path": "about-city-markham/by-laws/rows-4-5/2018-135%2B-%2BConsolidated%20(2).pdf",
                "title": "Cannabis By-law (2018-135)"
            },
            {
                "path": "2025-01/By-law-2023-164.pdf",
                "title": "Tree Preservation By-law (2023-164)"
            },
            {
                "path": "Bylaw-142-95.pdf",
                "title": "Deck By-law (142-95)"
            },
            {
                "path": "permits-licenses-taxes/bylaws-off-leash-areas/Attachment%20H%20-%20Animal%20Protection%20and%20Servcies%20By%20law%202018-91.pdf",
                "title": "Animal Protection By-law (2018-91)"
            }
        ]
        
        print("🎯 Trying known PDF patterns...")
        
        for file_info in known_files:
            pdf_url = f"https://www.markham.ca/sites/default/files/{file_info['path']}"
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
            # Date-based patterns
            {"base": "2024-{:02d}", "months": range(1, 13)},
            {"base": "2023-{:02d}", "months": range(1, 13)},
            
            # Simple bylaw patterns
            {"base": "Bylaw-{:03d}-{}", "years": [2023, 2024], "range": (1, 200)},
            {"base": "By-law-{}-{:03d}.pdf", "years": [2023, 2024], "range": (1, 200)},
        ]
        
        for pattern_info in patterns:
            if "months" in pattern_info:
                # Date-based pattern
                base_pattern = pattern_info["base"]
                for month in pattern_info["months"]:
                    date_folder = base_pattern.format(month)
                    # Try a few common bylaw names in each date folder
                    for bylaw_num in range(1, 11):  # Try first 10 bylaws
                        filename = f"By-law-{date_folder[-2:]}-{bylaw_num:03d}.pdf"
                        pdf_url = f"https://www.markham.ca/sites/default/files/{date_folder}/{filename}"
                        
                        response = self.fetch_page(pdf_url)
                        if response and response.status_code == 200:
                            pdf_links.append({
                                'url': pdf_url,
                                'filename': filename,
                                'title': f"Markham {filename}"
                            })
                            print(f"✓ Found: {filename}")
            else:
                # Number-based pattern
                base_pattern = pattern_info["base"]
                years = pattern_info["years"]
                start, end = pattern_info["range"]
                
                for year in years:
                    for num in range(start, min(start + 10, end)):  # Test first 10 of each pattern
                        filename = base_pattern.format(num, year)
                        pdf_url = f"https://www.markham.ca/sites/default/files/{filename}"
                        
                        response = self.fetch_page(pdf_url)
                        if response and response.status_code == 200:
                            pdf_links.append({
                                'url': pdf_url,
                                'filename': filename,
                                'title': f"Markham {filename}"
                            })
                            print(f"✓ Found: {filename}")
        
        return pdf_links
    
    def run_scrape(self) -> Dict:
        """Enhanced scraping with hybrid pattern approach"""
        print(f"🚀 Starting Markham scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Scrape main bylaws page
        print("📋 Scraping main bylaws page...")
        main_pdfs = self.find_pdf_links(self.fetch_page(self.search_url).text if self.fetch_page(self.search_url) else "")
        all_pdfs.extend(main_pdfs)
        print(f"✓ Found {len(main_pdfs)} PDFs from main page")
        
        # Strategy 2: Discover and scrape category pages
        print("🔍 Discovering and scraping category pages...")
        category_urls = self.discover_category_pages()
        print(f"📂 Found {len(category_urls)} category pages to check")
        
        category_count = 0
        for category_url in category_urls[:10]:  # Limit to 10 categories
            category_pdfs = self.scrape_category_page(category_url)
            all_pdfs.extend(category_pdfs)
            category_count += len(category_pdfs)
        
        print(f"✓ Found {category_count} PDFs from category pages")
        
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