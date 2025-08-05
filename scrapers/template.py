"""
Template for creating new municipality scrapers
Copy this file and rename it to your municipality (e.g., toronto.py)
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from urllib.parse import urljoin, urlparse
from base import BaseScraper

class TemplateScraper(BaseScraper):
    """Template scraper - copy and customize this for your municipality"""
    
    def __init__(self, municipality_id: int):
        # TODO: Update these URLs for your municipality
        base_url = "https://example.com"
        search_url = "https://example.com/bylaws"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract all PDF links from the HTML content"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # TODO: Customize this for your municipality's website structure
        # This is a generic example - each site will be different
        
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
        """Handle pagination and return next page URL if exists"""
        # TODO: Customize this for your municipality's pagination
        # This is a generic example
        
        # Look for "Next" button
        next_link = soup.find('a', text=re.compile(r'next', re.I))
        if next_link and next_link.get('href'):
            return urljoin(self.base_url, next_link['href'])
        
        # Look for numbered pagination
        pagination = soup.find('div', class_=['pagination', 'pager'])
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