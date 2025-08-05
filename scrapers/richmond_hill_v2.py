"""
Richmond Hill By-laws PDF Scraper V2
Handles property standards and other bylaw pages
"""

from .base_supabase import BaseSupabaseScraper
from typing import List, Dict
from bs4 import BeautifulSoup

class RichmondHillScraperV2(BaseSupabaseScraper):
    """Richmond Hill municipality scraper"""
    
    def __init__(self, municipality_id: int):
        super().__init__(
            municipality_id=municipality_id,
            municipality_name="City of Richmond Hill",
            base_url="https://www.richmondhill.ca",
            search_url="https://www.richmondhill.ca/en/living-here/Property-Standards.aspx"
        )
        
    def get_category_urls(self) -> List[str]:
        """Get URLs for different bylaw categories"""
        # Richmond Hill has bylaws spread across different pages
        categories = [
            "https://www.richmondhill.ca/en/living-here/By-laws.aspx",
            "https://www.richmondhill.ca/en/living-here/Parking-By-law.aspx",
            "https://www.richmondhill.ca/en/living-here/Noise-By-law.aspx",
            "https://www.richmondhill.ca/en/living-here/Animal-Control.aspx",
            "https://www.richmondhill.ca/en/business-development/Business-Licensing.aspx",
            "https://www.richmondhill.ca/en/living-here/Tree-Protection.aspx",
        ]
        return categories
    
    def find_additional_pdfs(self, soup: BeautifulSoup, page_url: str) -> List[Dict]:
        """Find PDFs in Richmond Hill's structure"""
        additional_pdfs = []
        
        # Richmond Hill uses content areas and document listings
        content_areas = soup.find_all(['div', 'section'], class_=['content', 'maincontent', 'page-content'])
        
        for area in content_areas:
            # Find all links that might be PDFs
            for link in area.find_all('a', href=True):
                href = link['href']
                
                # Richmond Hill specific patterns
                if (self.is_pdf_link(href) or 
                    '/en/shared-content/resources/' in href or
                    '/modules/news/documents/' in href):
                    
                    full_url = self.base_url + href if href.startswith('/') else href
                    
                    if full_url not in self.processed_urls:
                        title = link.get_text(strip=True)
                        
                        # Extract context from parent elements
                        parent = link.find_parent(['p', 'li', 'td'])
                        if parent:
                            context = parent.get_text()
                            # Look for bylaw numbers in context
                            import re
                            bylaw_match = re.search(r'By-law\s*(?:No\.?|#)?\s*(\d{1,4}-\d{2,4})', context)
                            bylaw_num = bylaw_match.group(1) if bylaw_match else None
                        else:
                            bylaw_num = None
                        
                        pdf_info = {
                            'url': full_url,
                            'filename': self.extract_filename(full_url),
                            'title': title or f"Richmond Hill Bylaw Document",
                            'source_page': page_url
                        }
                        
                        if bylaw_num:
                            pdf_info['bylaw_number'] = bylaw_num
                        
                        additional_pdfs.append(pdf_info)
                        self.processed_urls.add(full_url)
        
        # Check for document tables
        tables = soup.find_all('table')
        for table in tables:
            # Look for bylaw-related tables
            table_text = table.get_text().lower()
            if 'by-law' in table_text or 'bylaw' in table_text:
                rows = table.find_all('tr')
                for row in rows:
                    links = row.find_all('a', href=True)
                    for link in links:
                        href = link['href']
                        if self.is_pdf_link(href):
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
        
        return additional_pdfs

def main():
    """Test the scraper"""
    scraper = RichmondHillScraperV2(municipality_id=7)
    results = scraper.run_scrape()
    
    print(f"\nScraping Results for {results['municipality_name']}:")
    print(f"Total PDFs found: {results['documents_found']}")
    print(f"Errors: {len(results['errors'])}")

if __name__ == "__main__":
    main()