"""
Mississauga By-laws PDF Scraper V2
Handles detail page navigation for bylaws
"""

from .base_supabase import BaseSupabaseScraper
from typing import List, Dict
from bs4 import BeautifulSoup
import time

class MississaugaScraperV2(BaseSupabaseScraper):
    """Mississauga municipality scraper - navigates through detail pages"""
    
    def __init__(self, municipality_id: int):
        super().__init__(
            municipality_id=municipality_id,
            municipality_name="City of Mississauga",
            base_url="https://www.mississauga.ca",
            search_url="https://www.mississauga.ca/council/by-laws/"
        )
        self.detail_pages_to_check = []
        
    def find_additional_pdfs(self, soup: BeautifulSoup, page_url: str) -> List[Dict]:
        """Find detail page links that contain PDFs"""
        additional_pdfs = []
        
        # Look for publication detail page links
        for link in soup.find_all('a', href=True):
            href = link['href']
            if '/publication/' in href:
                full_url = self.base_url + href if href.startswith('/') else href
                if full_url not in self.processed_urls:
                    self.detail_pages_to_check.append({
                        'url': full_url,
                        'title': link.get_text(strip=True)
                    })
        
        return additional_pdfs
    
    def run_scrape(self) -> Dict:
        """Override to handle detail page processing"""
        # First run the base scrape
        result = super().run_scrape()
        
        # Then process detail pages
        if self.detail_pages_to_check:
            self.logger.info(f"Processing {len(self.detail_pages_to_check)} detail pages...")
            
            for detail_page in self.detail_pages_to_check:
                self.logger.info(f"Checking detail page: {detail_page['title']}")
                
                response = self.fetch_page(detail_page['url'])
                if response:
                    soup = BeautifulSoup(response.content, 'html.parser')
                    
                    # Look for PDF download links on the detail page
                    for link in soup.find_all('a', href=True):
                        href = link['href']
                        if self.is_pdf_link(href) and '/wp-content/uploads/' in href:
                            full_url = self.base_url + href if href.startswith('/') else href
                            
                            if full_url not in self.processed_urls:
                                pdf_info = {
                                    'url': full_url,
                                    'filename': self.extract_filename(full_url),
                                    'title': detail_page['title'] or link.get_text(strip=True),
                                    'source_page': detail_page['url']
                                }
                                
                                self.documents_found.append(pdf_info)
                                self.processed_urls.add(full_url)
                                self.logger.info(f"Found PDF: {pdf_info['filename']}")
                
                time.sleep(0.5)  # Be respectful
        
        # Update the result
        result['documents_found'] = len(self.documents_found)
        result['documents'] = self.documents_found
        
        return result
    
    def get_pagination_urls(self, soup: BeautifulSoup, current_url: str) -> List[str]:
        """Handle pagination on the main bylaws page"""
        pagination_urls = []
        
        # Look for pagination links
        pagination = soup.find('div', class_='pagination') or soup.find('nav', class_='pagination')
        if pagination:
            for link in pagination.find_all('a', href=True):
                href = link['href']
                if href and 'page=' in href:
                    full_url = self.base_url + href if href.startswith('/') else href
                    if full_url not in self.processed_urls:
                        pagination_urls.append(full_url)
        
        return pagination_urls

def main():
    """Test the scraper"""
    scraper = MississaugaScraperV2(municipality_id=4)
    results = scraper.run_scrape()
    
    print(f"\nScraping Results for {results['municipality_name']}:")
    print(f"Total PDFs found: {results['documents_found']}")
    print(f"Errors: {len(results['errors'])}")

if __name__ == "__main__":
    main()