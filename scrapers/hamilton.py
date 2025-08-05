"""
Hamilton By-laws PDF Scraper
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from urllib.parse import urljoin, urlparse
from .base_supabase import BaseSupabaseScraper

class HamiltonScraper(BaseSupabaseScraper):
    """Hamilton municipality scraper"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.hamilton.ca"
        search_url = "https://www.hamilton.ca/city-council/by-laws-enforcement/search-by-laws"
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
        
        return pdf_links
    
    def handle_pagination(self, soup: BeautifulSoup) -> Optional[str]:
        """Check for pagination and return next page URL if exists"""
        # Look for common pagination patterns
        next_link = None
        
        # Try to find "Next" button or link
        for link in soup.find_all('a', text=re.compile(r'next|›|»', re.I)):
            href = link.get('href')
            if href:
                next_link = urljoin(self.base_url, href)
                break
        
        # Also check for numbered pagination
        if not next_link:
            pagination = soup.find('div', class_=['pagination', 'pager'])
            if pagination:
                current_page = pagination.find('span', class_='current')
                if current_page:
                    try:
                        current_num = int(current_page.text.strip())
                        next_page_link = pagination.find('a', text=str(current_num + 1))
                        if next_page_link:
                            next_link = urljoin(self.base_url, next_page_link['href'])
                    except:
                        pass
        
        return next_link