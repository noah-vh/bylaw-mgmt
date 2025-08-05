"""
Vaughan By-laws PDF Scraper V2
Handles bylaw library with categorized sections
"""

from .base_supabase import BaseSupabaseScraper
from typing import List, Dict
from bs4 import BeautifulSoup

class VaughanScraperV2(BaseSupabaseScraper):
    """Vaughan municipality scraper"""
    
    def __init__(self, municipality_id: int):
        super().__init__(
            municipality_id=municipality_id,
            municipality_name="City of Vaughan",
            base_url="https://www.vaughan.ca",
            search_url="https://www.vaughan.ca/residential/by-laws-and-enforcement/by-law-library"
        )
        
    def find_additional_pdfs(self, soup: BeautifulSoup, page_url: str) -> List[Dict]:
        """Find PDFs in Vaughan's bylaw library structure"""
        additional_pdfs = []
        
        # Vaughan uses accordion/expandable sections for bylaws
        # Look for bylaw sections
        bylaw_sections = soup.find_all(['div', 'section'], class_=['accordion', 'bylaw-section', 'content-section'])
        
        for section in bylaw_sections:
            # Extract category from section header
            category = ""
            header = section.find(['h2', 'h3', 'h4'])
            if header:
                category = header.get_text(strip=True)
            
            # Find all PDF links in this section
            for link in section.find_all('a', href=True):
                href = link['href']
                if self.is_pdf_link(href) or '/sites/default/files/' in href:
                    full_url = self.base_url + href if href.startswith('/') else href
                    
                    if full_url not in self.processed_urls:
                        title = link.get_text(strip=True)
                        
                        pdf_info = {
                            'url': full_url,
                            'filename': self.extract_filename(full_url),
                            'title': title,
                            'category': category,
                            'source_page': page_url
                        }
                        
                        # Extract bylaw number if present
                        import re
                        bylaw_match = re.search(r'(?:By-law|Bylaw)\s*(?:No\.?|#)?\s*(\d{1,4}-\d{2,4})', title)
                        if bylaw_match:
                            pdf_info['bylaw_number'] = bylaw_match.group(1)
                        
                        additional_pdfs.append(pdf_info)
                        self.processed_urls.add(full_url)
        
        # Also check for simple link lists
        link_lists = soup.find_all(['ul', 'ol'], class_=['bylaw-list', 'document-list'])
        for link_list in link_lists:
            for li in link_list.find_all('li'):
                link = li.find('a', href=True)
                if link and self.is_pdf_link(link['href']):
                    full_url = self.base_url + link['href'] if link['href'].startswith('/') else link['href']
                    
                    if full_url not in self.processed_urls:
                        pdf_info = {
                            'url': full_url,
                            'filename': self.extract_filename(full_url),
                            'title': link.get_text(strip=True),
                            'source_page': page_url
                        }
                        
                        additional_pdfs.append(pdf_info)
                        self.processed_urls.add(full_url)
        
        return additional_pdfs
    
    def get_category_urls(self) -> List[str]:
        """Get URLs for different bylaw categories if they exist"""
        # Vaughan might have separate pages for different bylaw types
        categories = []
        
        # Try to find category links on the main page
        response = self.fetch_page(self.search_url)
        if response:
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Look for navigation links to bylaw categories
            nav_links = soup.find_all('a', href=lambda x: x and '/by-law' in x and x != self.search_url)
            for link in nav_links:
                full_url = self.base_url + link['href'] if link['href'].startswith('/') else link['href']
                if full_url not in categories:
                    categories.append(full_url)
        
        return categories[:10]  # Limit to prevent too many requests

def main():
    """Test the scraper"""
    scraper = VaughanScraperV2(municipality_id=5)
    results = scraper.run_scrape()
    
    print(f"\nScraping Results for {results['municipality_name']}:")
    print(f"Total PDFs found: {results['documents_found']}")
    print(f"Errors: {len(results['errors'])}")

if __name__ == "__main__":
    main()