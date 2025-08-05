"""
City of Barrie By-laws PDF Scraper V2
Auto-generated scraper for City of Barrie
"""

from .base_supabase import BaseSupabaseScraper
from typing import List, Dict
from bs4 import BeautifulSoup
import re

class BarrieScraperV2(BaseSupabaseScraper):
    """City of Barrie municipality scraper"""
    
    def __init__(self, municipality_id: int):
        super().__init__(
            municipality_id=municipality_id,
            municipality_name="City of Barrie",
            base_url="https://www.barrie.ca",
            search_url="https://www.barrie.ca/government-news/laws-policies-procedures"
        )
        
    def find_additional_pdfs(self, soup: BeautifulSoup, page_url: str) -> List[Dict]:
        """Find PDFs in City of Barrie's structure"""
        additional_pdfs = []
        
        # Look for common document containers
        doc_areas = soup.find_all(['div', 'section'], class_=['content', 'main-content', 'page-content', 'document-list'])
        
        for area in doc_areas:
            # Find all links that might be PDFs
            for link in area.find_all('a', href=True):
                href = link['href']
                
                if self.is_pdf_link(href) or any(pattern in href for pattern in ['/documents/', '/files/', '/uploads/', '/resources/']):
                    full_url = self.base_url + href if href.startswith('/') else href
                    
                    if full_url not in self.processed_urls:
                        title = link.get_text(strip=True)
                        
                        pdf_info = {
                            'url': full_url,
                            'filename': self.extract_filename(full_url),
                            'title': title or self.extract_title(link, href),
                            'source_page': page_url
                        }
                        
                        # Try to extract bylaw number
                        title_and_url = title + " " + href
                        bylaw_match = re.search(r'(?:by-?law|bylaw)\s*(?:no\.?|number|#)?\s*(\d{1,4}[-\s]?\d{1,4})', 
                                              title_and_url, re.IGNORECASE)
                        if bylaw_match:
                            pdf_info['bylaw_number'] = bylaw_match.group(1)
                        
                        additional_pdfs.append(pdf_info)
                        self.processed_urls.add(full_url)
        
        # Check tables for bylaw listings
        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            for row in rows:
                links = row.find_all('a', href=True)
                for link in links:
                    href = link['href']
                    if self.is_pdf_link(href):
                        full_url = self.base_url + href if href.startswith('/') else href
                        
                        if full_url not in self.processed_urls:
                            # Get row text for context
                            row_text = row.get_text()
                            title = link.get_text(strip=True)
                            
                            pdf_info = {
                                'url': full_url,
                                'filename': self.extract_filename(full_url),
                                'title': title,
                                'source_page': page_url
                            }
                            
                            # Extract bylaw number from row
                            bylaw_match = re.search(r'(\d{4}-\d{1,3}|\d{2,4}-\d{4})', row_text)
                            if bylaw_match:
                                pdf_info['bylaw_number'] = bylaw_match.group(1)
                            
                            additional_pdfs.append(pdf_info)
                            self.processed_urls.add(full_url)
        
        return additional_pdfs
    
    def get_pagination_urls(self, soup: BeautifulSoup, current_url: str) -> List[str]:
        """Handle pagination if present"""
        pagination_urls = []
        
        # Look for common pagination patterns
        pagination_areas = soup.find_all(['div', 'nav', 'ul'], class_=lambda x: x and 'pag' in x.lower() if x else False)
        
        for pagination in pagination_areas:
            for link in pagination.find_all('a', href=True):
                href = link['href']
                if any(pattern in href for pattern in ['page=', '/page/', 'p=', 'pageindex=']):
                    full_url = self.base_url + href if href.startswith('/') else href
                    if full_url not in self.processed_urls:
                        pagination_urls.append(full_url)
        
        return pagination_urls

def main():
    """Test the scraper"""
    scraper = BarrieScraperV2(municipality_id=17)
    results = scraper.run_scrape()
    
    print(f"\nScraping Results for {results['municipality_name']}:")
    print(f"Total PDFs found: {results['documents_found']}")
    print(f"Errors: {len(results['errors'])}")

if __name__ == "__main__":
    main()
