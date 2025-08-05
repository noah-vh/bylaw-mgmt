"""
Brampton By-laws PDF Scraper V2
Handles direct PDF links from the main bylaws page
"""

from .base_supabase import BaseSupabaseScraper
from typing import List, Dict
from bs4 import BeautifulSoup
import re

class BramptonScraperV2(BaseSupabaseScraper):
    """Brampton municipality scraper - direct PDF extraction"""
    
    def __init__(self, municipality_id: int):
        super().__init__(
            municipality_id=municipality_id,
            municipality_name="City of Brampton",
            base_url="https://www.brampton.ca",
            search_url="https://www.brampton.ca/EN/City-Hall/Bylaws"
        )
        
    def find_additional_pdfs(self, soup: BeautifulSoup, page_url: str) -> List[Dict]:
        """Find PDFs in Brampton's specific structure"""
        additional_pdfs = []
        
        # Look for bylaw sections/containers
        bylaw_sections = soup.find_all(['div', 'section'], class_=lambda x: x and 'bylaw' in x.lower() if x else False)
        
        for section in bylaw_sections:
            # Find all links within bylaw sections
            for link in section.find_all('a', href=True):
                href = link['href']
                if self.is_pdf_link(href):
                    full_url = self.base_url + href if href.startswith('/') else href
                    
                    if full_url not in self.processed_urls:
                        # Extract bylaw information from context
                        parent_text = section.get_text()
                        title = link.get_text(strip=True)
                        
                        pdf_info = {
                            'url': full_url,
                            'filename': self.extract_filename(full_url),
                            'title': title,
                            'source_page': page_url
                        }
                        
                        # Try to extract bylaw number from filename or title
                        bylaw_match = re.search(r'(\d{1,4}-\d{4})', full_url + title)
                        if bylaw_match:
                            pdf_info['bylaw_number'] = bylaw_match.group(1)
                        
                        additional_pdfs.append(pdf_info)
                        self.processed_urls.add(full_url)
        
        return additional_pdfs
    
    def get_category_urls(self) -> List[str]:
        """Get URLs for different bylaw categories"""
        # Brampton might have category pages
        categories = [
            "https://www.brampton.ca/EN/City-Hall/Bylaws/Traffic%20By-laws",
            "https://www.brampton.ca/EN/City-Hall/Bylaws/Property%20Standards",
            "https://www.brampton.ca/EN/City-Hall/Bylaws/Business%20Licensing",
            "https://www.brampton.ca/EN/City-Hall/Bylaws/Animal%20Services",
        ]
        return categories

def main():
    """Test the scraper"""
    scraper = BramptonScraperV2(municipality_id=5)
    results = scraper.run_scrape()
    
    print(f"\nScraping Results for {results['municipality_name']}:")
    print(f"Total PDFs found: {results['documents_found']}")
    print(f"Errors: {len(results['errors'])}")

if __name__ == "__main__":
    main()