"""
Toronto By-laws PDF Scraper
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from urllib.parse import urljoin, urlparse
from .base_supabase import BaseSupabaseScraper

class TorontoScraper(BaseSupabaseScraper):
    """Toronto municipality scraper"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.toronto.ca"
        search_url = "https://www.toronto.ca/legdocs/bylaws/"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract all PDF links from the HTML content"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # Find all links that end with .pdf
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.endswith('.pdf'):
                # Get the full URL
                full_url = urljoin(self.base_url, href)
                
                # Get the link text for better file naming
                link_text = link.get_text(strip=True)
                
                # Extract filename from URL
                filename = os.path.basename(urlparse(full_url).path)
                
                pdf_links.append({
                    'url': full_url,
                    'filename': filename,
                    'title': link_text or filename
                })
        
        # Also look for bylaw links that might lead to PDFs
        for link in soup.find_all('a', href=True):
            href = link['href']
            link_text = link.get_text(strip=True)
            
            # Look for bylaw patterns
            if re.search(r'bylaw|by-law', href, re.I) or re.search(r'bylaw|by-law', link_text, re.I):
                full_url = urljoin(self.base_url, href)
                
                # Extract filename from URL or create one from text
                filename = os.path.basename(urlparse(full_url).path)
                if not filename:
                    filename = re.sub(r'[^a-zA-Z0-9_-]', '_', link_text)[:50] + '.html'
                
                pdf_links.append({
                    'url': full_url,
                    'filename': filename,
                    'title': link_text or filename
                })
        
        return pdf_links
    
    def handle_pagination(self, soup: BeautifulSoup) -> Optional[str]:
        """Handle pagination and return next page URL if exists"""
        # Look for "Next" button or similar pagination
        next_link = soup.find('a', text=re.compile(r'next|more|continue', re.I))
        if next_link and next_link.get('href'):
            return urljoin(self.base_url, next_link['href'])
        
        # Look for numbered pagination
        pagination = soup.find('div', class_=['pagination', 'pager', 'nav'])
        if pagination:
            current_page = pagination.find('span', class_='current')
            if current_page:
                try:
                    current_num = int(current_page.text.strip())
                    next_page_link = pagination.find('a', text=str(current_num + 1))
                    if next_page_link:
                        return urljoin(self.base_url, next_page_link['href'])
                except:
                    pass
        
        return None