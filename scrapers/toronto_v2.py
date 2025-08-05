"""
Toronto By-laws PDF Scraper V2 - Supabase Integrated
Handles both municipal code chapters and yearly bylaw directories
"""

from .base_supabase import BaseSupabaseScraper
from typing import List, Dict
from bs4 import BeautifulSoup
import re

class TorontoScraperV2(BaseSupabaseScraper):
    """Toronto municipality scraper - handles municipal code and yearly bylaws"""
    
    def __init__(self, municipality_id: int):
        super().__init__(
            municipality_id=municipality_id,
            municipality_name="City of Toronto",
            base_url="https://www.toronto.ca",
            search_url="https://www.toronto.ca/legdocs/bylaws/"
        )
        
    def get_category_urls(self) -> List[str]:
        """Get URLs for different bylaw sections"""
        categories = [
            # Municipal code page
            "https://www.toronto.ca/legdocs/bylaws/lawmcode.htm",
            # Recent years
            "https://www.toronto.ca/legdocs/bylaws/2024/",
            "https://www.toronto.ca/legdocs/bylaws/2023/",
            "https://www.toronto.ca/legdocs/bylaws/2022/",
            "https://www.toronto.ca/legdocs/bylaws/2021/",
            "https://www.toronto.ca/legdocs/bylaws/2020/",
        ]
        return categories
    
    def find_additional_pdfs(self, soup: BeautifulSoup, page_url: str) -> List[Dict]:
        """Find PDFs specific to Toronto's structure"""
        additional_pdfs = []
        
        # If we're on a year directory page, look for bylaw listings
        if re.search(r'/bylaws/\d{4}/', page_url):
            # Toronto year pages have a specific table structure
            tables = soup.find_all('table')
            for table in tables:
                rows = table.find_all('tr')
                for row in rows:
                    cells = row.find_all('td')
                    if len(cells) >= 2:
                        # First cell often has bylaw number
                        bylaw_cell = cells[0]
                        # Second cell might have the link
                        link_cell = cells[1]
                        
                        link = link_cell.find('a', href=True)
                        if link and self.is_pdf_link(link['href']):
                            full_url = self.base_url + link['href'] if link['href'].startswith('/') else link['href']
                            
                            # Extract bylaw number
                            bylaw_num = bylaw_cell.get_text(strip=True)
                            title = link.get_text(strip=True) or f"Bylaw {bylaw_num}"
                            
                            pdf_info = {
                                'url': full_url,
                                'filename': self.extract_filename(full_url),
                                'title': title,
                                'bylaw_number': bylaw_num,
                                'source_page': page_url
                            }
                            
                            if full_url not in self.processed_urls:
                                additional_pdfs.append(pdf_info)
                                self.processed_urls.add(full_url)
        
        # If we're on the municipal code page, look for chapter links
        if 'lawmcode.htm' in page_url:
            # Look for chapter links with specific pattern
            for link in soup.find_all('a', href=re.compile(r'/municode/.*\.pdf', re.IGNORECASE)):
                full_url = self.base_url + link['href'] if link['href'].startswith('/') else link['href']
                
                # Extract chapter info
                chapter_match = re.search(r'1184_(\w+)', link['href'])
                chapter_num = chapter_match.group(1) if chapter_match else ""
                
                title = link.get_text(strip=True) or f"Municipal Code Chapter {chapter_num}"
                
                pdf_info = {
                    'url': full_url,
                    'filename': self.extract_filename(full_url),
                    'title': f"Municipal Code - {title}",
                    'document_type': 'municipal_code',
                    'chapter': chapter_num,
                    'source_page': page_url
                }
                
                if full_url not in self.processed_urls:
                    additional_pdfs.append(pdf_info)
                    self.processed_urls.add(full_url)
        
        return additional_pdfs