"""
Markham By-laws PDF Scraper V2
Handles bylaw search and document listings
"""

from .base_supabase import BaseSupabaseScraper
from typing import List, Dict
from bs4 import BeautifulSoup
import re

class MarkhamScraperV2(BaseSupabaseScraper):
    """Markham municipality scraper"""
    
    def __init__(self, municipality_id: int):
        super().__init__(
            municipality_id=municipality_id,
            municipality_name="City of Markham",
            base_url="https://www.markham.ca",
            search_url="https://www.markham.ca/about-city-markham/city-hall/bylaws"
        )
        
    def find_additional_pdfs(self, soup: BeautifulSoup, page_url: str) -> List[Dict]:
        """Find PDFs in Markham's structure"""
        additional_pdfs = []
        
        # Markham uses various structures for bylaws
        # Look for bylaw tables
        tables = soup.find_all('table', class_=['bylaw-table', 'document-table'])
        for table in tables:
            rows = table.find_all('tr')
            for row in rows:
                cells = row.find_all(['td', 'th'])
                
                # Find PDF links in the row
                for cell in cells:
                    link = cell.find('a', href=True)
                    if link and self.is_pdf_link(link['href']):
                        full_url = self.base_url + link['href'] if link['href'].startswith('/') else link['href']
                        
                        if full_url not in self.processed_urls:
                            # Extract metadata from row
                            row_text = row.get_text()
                            title = link.get_text(strip=True)
                            
                            # Look for bylaw number
                            bylaw_num = None
                            num_match = re.search(r'(\d{4}-\d{1,3}|\d{2,4}-\d{4})', row_text)
                            if num_match:
                                bylaw_num = num_match.group(1)
                            
                            pdf_info = {
                                'url': full_url,
                                'filename': self.extract_filename(full_url),
                                'title': title,
                                'source_page': page_url
                            }
                            
                            if bylaw_num:
                                pdf_info['bylaw_number'] = bylaw_num
                            
                            additional_pdfs.append(pdf_info)
                            self.processed_urls.add(full_url)
        
        # Look for document listings in divs
        doc_containers = soup.find_all('div', class_=['document-list', 'bylaw-list', 'content-listing'])
        for container in doc_containers:
            for link in container.find_all('a', href=True):
                href = link['href']
                if self.is_pdf_link(href) or '/wps/wcm/connect/' in href:
                    full_url = self.base_url + href if href.startswith('/') else href
                    
                    if full_url not in self.processed_urls:
                        pdf_info = {
                            'url': full_url,
                            'filename': self.extract_filename(full_url),
                            'title': link.get_text(strip=True),
                            'source_page': page_url
                        }
                        
                        additional_pdfs.append(pdf_info)
                        self.processed_urls.add(full_url)
        
        # Check for Markham's specific URL patterns
        markham_links = soup.find_all('a', href=re.compile(r'/wps/portal/.*bylaws?', re.IGNORECASE))
        for link in markham_links:
            href = link['href']
            if '/Home/' not in href:  # Avoid navigation links
                full_url = self.base_url + href if href.startswith('/') else href
                
                # This might be a category page to explore
                if full_url not in self.processed_urls:
                    self.logger.info(f"Found potential category page: {full_url}")
        
        return additional_pdfs
    
    def get_pagination_urls(self, soup: BeautifulSoup, current_url: str) -> List[str]:
        """Handle pagination if present"""
        pagination_urls = []
        
        # Look for pagination
        pagination = soup.find(['div', 'nav'], class_=['pagination', 'paging'])
        if pagination:
            for link in pagination.find_all('a', href=True):
                href = link['href']
                if 'page=' in href or '/page/' in href:
                    full_url = self.base_url + href if href.startswith('/') else href
                    if full_url not in self.processed_urls:
                        pagination_urls.append(full_url)
        
        return pagination_urls

def main():
    """Test the scraper"""
    scraper = MarkhamScraperV2(municipality_id=6)
    results = scraper.run_scrape()
    
    print(f"\nScraping Results for {results['municipality_name']}:")
    print(f"Total PDFs found: {results['documents_found']}")
    print(f"Errors: {len(results['errors'])}")

if __name__ == "__main__":
    main()