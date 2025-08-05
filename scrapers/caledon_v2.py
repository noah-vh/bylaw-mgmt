"""
Caledon By-laws PDF Scraper V2
Handles both direct links and document library navigation
"""

from .base_supabase import BaseSupabaseScraper
from typing import List, Dict
from bs4 import BeautifulSoup

class CaledonScraperV2(BaseSupabaseScraper):
    """Caledon municipality scraper"""
    
    def __init__(self, municipality_id: int):
        super().__init__(
            municipality_id=municipality_id,
            municipality_name="Town of Caledon",
            base_url="https://www.caledon.ca",
            search_url="https://www.caledon.ca/en/government/by-laws-and-policies.aspx"
        )
        
    def find_additional_pdfs(self, soup: BeautifulSoup, page_url: str) -> List[Dict]:
        """Find PDFs in Caledon's document structure"""
        additional_pdfs = []
        
        # Look for document listings or tables
        # Caledon often uses tables for bylaw listings
        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            for row in rows:
                # Find PDF links in table rows
                links = row.find_all('a', href=True)
                for link in links:
                    href = link['href']
                    if self.is_pdf_link(href) or '/en/government/resources/' in href:
                        full_url = self.base_url + href if href.startswith('/') else href
                        
                        if full_url not in self.processed_urls:
                            # Extract title and metadata from row
                            cells = row.find_all(['td', 'th'])
                            title = link.get_text(strip=True)
                            
                            # Look for bylaw number in adjacent cells
                            bylaw_number = None
                            for cell in cells:
                                cell_text = cell.get_text(strip=True)
                                if cell_text and cell_text != title:
                                    import re
                                    if re.match(r'^\d{4}-\d{1,3}$', cell_text):
                                        bylaw_number = cell_text
                                        break
                            
                            pdf_info = {
                                'url': full_url,
                                'filename': self.extract_filename(full_url),
                                'title': title,
                                'source_page': page_url
                            }
                            
                            if bylaw_number:
                                pdf_info['bylaw_number'] = bylaw_number
                            
                            additional_pdfs.append(pdf_info)
                            self.processed_urls.add(full_url)
        
        # Also check for document library links
        doc_links = soup.find_all('a', href=lambda x: x and '/resources/Documents/' in x)
        for link in doc_links:
            href = link['href']
            if self.is_pdf_link(href):
                full_url = self.base_url + href if href.startswith('/') else href
                
                if full_url not in self.processed_urls:
                    pdf_info = {
                        'url': full_url,
                        'filename': self.extract_filename(full_url),
                        'title': link.get_text(strip=True) or self.extract_title(link, href),
                        'source_page': page_url
                    }
                    
                    additional_pdfs.append(pdf_info)
                    self.processed_urls.add(full_url)
        
        return additional_pdfs
    
    def get_category_urls(self) -> List[str]:
        """Get URLs for different bylaw categories"""
        categories = [
            # Caledon may have specific bylaw category pages
            "https://www.caledon.ca/en/government/property-standards.aspx",
            "https://www.caledon.ca/en/government/parking-by-laws.aspx",
            "https://www.caledon.ca/en/government/animal-control.aspx",
        ]
        return categories

def main():
    """Test the scraper"""
    scraper = CaledonScraperV2(municipality_id=4)
    results = scraper.run_scrape()
    
    print(f"\nScraping Results for {results['municipality_name']}:")
    print(f"Total PDFs found: {results['documents_found']}")
    print(f"Errors: {len(results['errors'])}")

if __name__ == "__main__":
    main()