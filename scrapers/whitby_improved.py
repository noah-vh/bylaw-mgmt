"""
Whitby By-laws PDF Scraper - Improved Implementation
Targets the specific Whitby bylaw system structure
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
import json
from urllib.parse import urljoin, urlparse, parse_qs
from .base_supabase import BaseSupabaseScraper

class WhitbyScraper(BaseSupabaseScraper):
    """Improved Whitby municipality scraper targeting actual PDF bylaws"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.whitby.ca"
        search_url = "https://www.whitby.ca/modules/bylaws/bylaw/search"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract PDF links from page content - focus on actual PDFs only"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # Strategy 1: Look for direct PDF downloads
        for link in soup.find_all('a', href=True):
            href = link['href']
            
            # Only actual PDF files
            if href.lower().endswith('.pdf'):
                full_url = urljoin(self.base_url, href)
                link_text = link.get_text(strip=True)
                filename = os.path.basename(urlparse(full_url).path)
                
                pdf_links.append({
                    'url': full_url,
                    'filename': filename,
                    'title': link_text or filename,
                    'source': 'direct_pdf'
                })
        
        # Strategy 2: Look for Whitby bylaw download URLs
        for link in soup.find_all('a', href=True):
            href = link['href']
            link_text = link.get_text(strip=True)
            
            # Whitby-specific download pattern
            if '/Modules/Bylaws/Bylaw/Download/' in href:
                full_url = urljoin(self.base_url, href)
                # Extract GUID from URL
                guid = href.split('/')[-1]
                filename = f"bylaw_{guid}.pdf"
                
                pdf_links.append({
                    'url': full_url,
                    'filename': filename,
                    'title': link_text or f"Bylaw {guid}",
                    'guid': guid,
                    'source': 'bylaw_download'
                })
        
        # Strategy 3: Look for bylaw details pages that might contain downloads
        for link in soup.find_all('a', href=True):
            href = link['href']
            link_text = link.get_text(strip=True)
            
            if '/Modules/Bylaws/Bylaw/Details/' in href:
                details_url = urljoin(self.base_url, href)
                
                # Fetch the details page to find download links
                try:
                    details_response = self.fetch_page(details_url)
                    if details_response and details_response.status_code == 200:
                        details_pdfs = self.find_pdf_links(details_response.text)
                        # Add context from the details page
                        for pdf in details_pdfs:
                            pdf['title'] = link_text if link_text else pdf['title']
                            pdf['source'] = 'details_page'
                        pdf_links.extend(details_pdfs)
                except Exception as e:
                    print(f"⚠️ Could not fetch details page {details_url}: {e}")
        
        return pdf_links
    
    def try_search_api_approach(self) -> List[Dict]:
        """Attempt to use the search functionality to find bylaws"""
        pdf_links = []
        
        print("🔍 Attempting search-based approach...")
        
        # Try to submit a search for common bylaw terms
        search_terms = ["noise", "parking", "zoning", "property", "animal", "business"]
        
        for term in search_terms:
            try:
                # Try a simple GET request with search parameters
                search_params = {
                    'keyword': term,
                    'rows': '100'  # Get more results
                }
                
                search_response = self.session.get(self.search_url, params=search_params)
                if search_response.status_code == 200:
                    search_pdfs = self.find_pdf_links(search_response.text)
                    pdf_links.extend(search_pdfs)
                    print(f"✓ Search for '{term}' found {len(search_pdfs)} documents")
                
            except Exception as e:
                print(f"⚠️ Search for '{term}' failed: {e}")
        
        return pdf_links
    
    def scrape_known_bylaw_sections(self) -> List[Dict]:
        """Scrape known sections where bylaws might be listed"""
        pdf_links = []
        
        # Start with the main bylaws page and look for actual PDF resources
        base_pages = [
            "https://www.whitby.ca/en/town-hall/by-laws.aspx",
            "https://www.whitby.ca/en/town-hall/resources/",  # Resources directory
            "https://www.whitby.ca/en/town-hall/business-licensing.aspx",
            "https://www.whitby.ca/en/town-hall/zoning.aspx"
        ]
        
        for page_url in base_pages:
            try:
                print(f"📄 Checking: {page_url}")
                response = self.fetch_page(page_url)
                if response and response.status_code == 200:
                    page_pdfs = self.find_pdf_links(response.text)
                    
                    # Also look for any "resources" or "documents" directory links
                    soup = BeautifulSoup(response.text, 'html.parser')
                    for link in soup.find_all('a', href=True):
                        href = link['href']
                        if any(term in href.lower() for term in ['resource', 'document', 'bylaw', 'policy']):
                            if href.startswith('/') and not href.endswith('.aspx'):
                                resource_url = urljoin(self.base_url, href)
                                try:
                                    resource_response = self.fetch_page(resource_url)
                                    if resource_response and resource_response.status_code == 200:
                                        resource_pdfs = self.find_pdf_links(resource_response.text)
                                        page_pdfs.extend(resource_pdfs)
                                except:
                                    continue
                    
                    pdf_links.extend(page_pdfs)
                    print(f"✓ Found {len(page_pdfs)} documents")
            except Exception as e:
                print(f"⚠️ Error accessing {page_url}: {e}")
        
        # Add the known working PDF we found
        pdf_links.append({
            'url': 'https://www.whitby.ca/en/town-hall/resources/By-law-Guide-for-Residents.pdf',
            'filename': 'By-law-Guide-for-Residents.pdf',
            'title': 'By-law Guide for Residents',
            'source': 'known_resource'
        })
        
        return pdf_links
    
    def try_sitemap_approach(self) -> List[Dict]:
        """Try to find bylaws through sitemap"""
        pdf_links = []
        
        sitemap_urls = [
            "https://www.whitby.ca/sitemap",
            "https://www.whitby.ca/sitemap.xml"
        ]
        
        for sitemap_url in sitemap_urls:
            try:
                print(f"🗺️ Checking sitemap: {sitemap_url}")
                response = self.fetch_page(sitemap_url)
                if response and response.status_code == 200:
                    # Look for bylaw-related URLs in sitemap
                    soup = BeautifulSoup(response.content, 'html.parser')
                    
                    # Find links that might be bylaw-related
                    for link in soup.find_all('a', href=True):
                        href = link['href']
                        if any(term in href.lower() for term in ['bylaw', 'policy', 'regulation']):
                            full_url = urljoin(self.base_url, href)
                            
                            # Visit the page to look for PDFs
                            try:
                                page_response = self.fetch_page(full_url)
                                if page_response and page_response.status_code == 200:
                                    page_pdfs = self.find_pdf_links(page_response.text)
                                    pdf_links.extend(page_pdfs)
                            except:
                                continue
                                
            except Exception as e:
                print(f"⚠️ Sitemap approach failed: {e}")
        
        return pdf_links
    
    def handle_pagination(self, soup: BeautifulSoup) -> Optional[str]:
        """Handle pagination if present"""
        # Look for pagination controls in the search results
        pagination = soup.find('div', class_=['pagination', 'pager', 'ui-pg-table'])
        if pagination:
            next_link = pagination.find('a', {'title': re.compile('next', re.I)})
            if next_link and next_link.get('href'):
                return urljoin(self.base_url, next_link['href'])
        
        return None
    
    def run_scrape(self) -> Dict:
        """Enhanced scraping targeting actual PDFs only"""
        print(f"🚀 Starting improved Whitby scrape for municipality {self.municipality_id}")
        print("="*60)
        
        all_pdfs = []
        
        # Strategy 1: Scrape known bylaw sections
        print("📋 Scraping known bylaw sections...")
        section_pdfs = self.scrape_known_bylaw_sections()
        all_pdfs.extend(section_pdfs)
        print(f"✓ Found {len(section_pdfs)} documents from bylaw sections")
        
        # Strategy 2: Try search-based approach
        print("🔍 Trying search-based approach...")
        search_pdfs = self.try_search_api_approach()
        all_pdfs.extend(search_pdfs)
        print(f"✓ Found {len(search_pdfs)} documents from searches")
        
        # Strategy 3: Try sitemap approach
        print("🗺️ Trying sitemap approach...")
        sitemap_pdfs = self.try_sitemap_approach()
        all_pdfs.extend(sitemap_pdfs)
        print(f"✓ Found {len(sitemap_pdfs)} documents from sitemap")
        
        # Remove duplicates based on URL
        unique_pdfs = []
        seen_urls = set()
        for pdf in all_pdfs:
            if pdf['url'] not in seen_urls:
                unique_pdfs.append(pdf)
                seen_urls.add(pdf['url'])
        
        # Filter out non-PDF URLs that got through
        actual_pdfs = []
        for pdf in unique_pdfs:
            url = pdf['url'].lower()
            # Only keep actual PDF files or Whitby download endpoints
            if (url.endswith('.pdf') or 
                '/modules/bylaws/bylaw/download/' in url):
                actual_pdfs.append(pdf)
            else:
                print(f"⚠️ Filtering out non-PDF: {pdf['url']}")
        
        print(f"📊 Total documents found: {len(all_pdfs)}")
        print(f"📊 Unique documents: {len(unique_pdfs)}")
        print(f"📊 Actual PDFs: {len(actual_pdfs)}")
        
        # Store documents found
        self.documents_found = actual_pdfs
        
        return self.get_scrape_summary()