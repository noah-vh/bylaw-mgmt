"""
Caledon By-laws PDF Scraper - New Implementation
Based on analysis: Pattern B - Detail Page Navigation with ASP.NET Postback
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
import json
import time
from urllib.parse import urljoin, urlparse, unquote
from .base_supabase import BaseSupabaseScraper

class CaledonScraper(BaseSupabaseScraper):
    """Caledon municipality scraper - structured database approach"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.caledon.ca"
        search_url = "https://www.caledon.ca/modules/document/document.aspx?param=lE51zSXnfjLHs6D5Ktlo7geQuAleQuAl"
        super().__init__(municipality_id, base_url, search_url)
        
        # Policy database URL
        self.policy_url = "https://www.caledon.ca/modules/document/document.aspx?param=TuRAV5PvUeITkgWAZ4yW6geQuAleQuAl"
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract 'Additional Details' postback links from database page"""
        soup = BeautifulSoup(html_content, 'html.parser')
        detail_links = []
        
        # Look for "Additional Details" postback links
        for link in soup.find_all('a', href=True):
            href = link['href']
            link_text = link.get_text(strip=True)
            
            # Find postback links with "Additional Details" text
            if 'javascript:__doPostBack' in href and 'Additional Details' in link_text:
                detail_links.append({
                    'url': href,  # This is the postback JavaScript
                    'filename': 'detail_page.html',
                    'title': link_text,
                    'postback_target': self.extract_postback_target(href)
                })
        
        return detail_links
    
    def extract_postback_target(self, href: str) -> Optional[str]:
        """Extract postback target from JavaScript href"""
        # Extract the target from javascript:__doPostBack('target','argument')
        import re
        match = re.search(r"__doPostBack\('([^']+)'[^']*'([^']*)'\)", href)
        if match:
            return match.group(1)
        return None
    
    def handle_pagination(self, soup: BeautifulSoup) -> Optional[str]:
        """Handle pagination in the database"""
        # Look for pagination controls - Caledon uses specific pagination structure
        pagination_container = soup.find('div', {'class': 'pagination'}) or soup.find('div', {'id': 'pagination'})
        
        if pagination_container:
            # Look for next page link
            next_link = pagination_container.find('a', string=re.compile(r'next|>|»', re.IGNORECASE))
            if next_link and next_link.get('href'):
                return urljoin(self.base_url, next_link['href'])
            
            # Look for numbered page links
            current_page = pagination_container.find('span', {'class': 'current'}) or pagination_container.find('strong')
            if current_page:
                current_num = int(re.search(r'\d+', current_page.get_text()).group())
                # Look for next page number
                for link in pagination_container.find_all('a', href=True):
                    link_text = link.get_text(strip=True)
                    if link_text.isdigit() and int(link_text) == current_num + 1:
                        return urljoin(self.base_url, link['href'])
        
        # Fallback: look for any pagination-related links
        for link in soup.find_all('a', href=True):
            href = link['href']
            link_text = link.get_text(strip=True).lower()
            
            # Look for pagination patterns in href
            if any(pattern in href.lower() for pattern in ['page=', 'pagenum=', 'p=']):
                # Check if this is a next page link
                if 'next' in link_text or '>' in link_text or '»' in link_text:
                    return urljoin(self.base_url, href)
        
        return None
    
    def scrape_database_page(self, database_url: str) -> List[Dict]:
        """Scrape ASP.NET database with postback pagination and detail page navigation"""
        pdf_links = []
        seen_urls = set()
        
        # Start with the first page
        current_page = 1
        max_pages = 6  # Caledon has 6 pages
        
        print(f"📋 Starting ASP.NET postback pagination from: {database_url}")
        
        # Get initial page and session
        response = self.fetch_page(database_url)
        if not response:
            print("❌ Failed to fetch initial page")
            return pdf_links
        
        while current_page <= max_pages:
            print(f"📄 Processing page {current_page}")
            
            if current_page == 1:
                # First page - use the existing response
                soup = BeautifulSoup(response.content, 'html.parser')
            else:
                # Subsequent pages - need to POST with ViewState
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Extract ASP.NET form data
                form_data = self.extract_aspnet_form_data(soup)
                if not form_data:
                    print("❌ Failed to extract ASP.NET form data")
                    break
                
                # Find the correct postback target for pagination
                postback_target = self.find_pagination_postback_target(soup, current_page)
                if not postback_target:
                    print(f"❌ No postback target found for page {current_page}")
                    break
                
                # Add postback data for next page
                if 'NextPage' in postback_target:
                    # Image button requires x,y coordinates
                    form_data[f'{postback_target}.x'] = '10'
                    form_data[f'{postback_target}.y'] = '10'
                else:
                    # Regular postback
                    form_data['__EVENTTARGET'] = postback_target
                    form_data['__EVENTARGUMENT'] = ''
                
                # Make POST request for next page
                response = self.session.post(database_url, data=form_data)
                if not response or response.status_code != 200:
                    print(f"❌ Failed to fetch page {current_page}")
                    break
                
                soup = BeautifulSoup(response.content, 'html.parser')
            
            # Extract "Additional Details" links from current page
            detail_links = self.find_pdf_links(response.text)
            
            print(f"📋 Found {len(detail_links)} Additional Details links on page {current_page}")
            
            # Follow each "Additional Details" link to get PDFs
            for i, detail_link in enumerate(detail_links):
                print(f"  📄 Following detail link {i+1}/{len(detail_links)}")
                
                pdf_info = self.extract_pdf_from_detail_page(detail_link, soup)
                if pdf_info:
                    if pdf_info['url'] not in seen_urls:
                        pdf_links.append(pdf_info)
                        seen_urls.add(pdf_info['url'])
                        print(f"    ✓ Found PDF: {pdf_info['filename']}")
                    else:
                        print(f"    ⚠️  Duplicate PDF: {pdf_info['filename']}")
                else:
                    print(f"    ❌ No PDF found on detail page")
                
                # Add small delay to be respectful
                time.sleep(0.5)
            
            # Check if we've reached the last page
            if self.is_last_page(soup):
                print("📄 Reached last page")
                break
            
            current_page += 1
        
        print(f"📊 Total pages processed: {current_page}")
        return pdf_links
    
    def extract_pdf_from_detail_page(self, detail_link: Dict, current_soup: BeautifulSoup) -> Optional[Dict]:
        """Extract PDF link from a document detail page via postback"""
        postback_target = detail_link.get('postback_target')
        if not postback_target:
            print(f"    ❌ No postback target found for detail link")
            return None
        
        # Extract form data from current page
        form_data = self.extract_aspnet_form_data(current_soup)
        if not form_data:
            print(f"    ❌ Failed to extract ASP.NET form data for detail page")
            return None
        
        # Add postback data for detail page
        form_data['__EVENTTARGET'] = postback_target
        form_data['__EVENTARGUMENT'] = ''
        
        # Make POST request for detail page
        response = self.session.post(self.search_url, data=form_data)
        if not response or response.status_code != 200:
            print(f"    ❌ Failed to fetch detail page via postback")
            return None
        
        detail_soup = BeautifulSoup(response.content, 'html.parser')
        
        # Look for PDF download links on the detail page
        for link in detail_soup.find_all('a', href=True):
            href = link['href']
            if href.endswith('.pdf') and ('uploads/14/' in href or 'uploads/116/' in href):
                full_url = urljoin(self.base_url, href)
                link_text = link.get_text(strip=True)
                filename = os.path.basename(urlparse(full_url).path)
                
                # Extract document title from detail page
                title = self.extract_document_title_from_detail_page(detail_soup) or link_text or filename
                
                return {
                    'url': full_url,
                    'filename': filename,
                    'title': title
                }
        
        return None
    
    def extract_aspnet_form_data(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Extract ASP.NET form data including ViewState and EventValidation"""
        form_data = {}
        
        # Extract ViewState
        viewstate = soup.find('input', {'name': '__VIEWSTATE'})
        if viewstate:
            form_data['__VIEWSTATE'] = viewstate.get('value', '')
        
        # Extract EventValidation
        eventvalidation = soup.find('input', {'name': '__EVENTVALIDATION'})
        if eventvalidation:
            form_data['__EVENTVALIDATION'] = eventvalidation.get('value', '')
        
        # Extract ViewStateGenerator
        viewstategenerator = soup.find('input', {'name': '__VIEWSTATEGENERATOR'})
        if viewstategenerator:
            form_data['__VIEWSTATEGENERATOR'] = viewstategenerator.get('value', '')
        
        # Extract other hidden form fields
        for input_elem in soup.find_all('input', {'type': 'hidden'}):
            name = input_elem.get('name')
            value = input_elem.get('value', '')
            if name and name not in form_data:
                form_data[name] = value
        
        return form_data
    
    def is_last_page(self, soup: BeautifulSoup) -> bool:
        """Check if this is the last page"""
        # Look for "Page X of Y" text
        page_text = soup.get_text()
        if 'Page' in page_text and 'of' in page_text:
            import re
            match = re.search(r'Page\s+(\d+)\s+of\s+(\d+)', page_text)
            if match:
                current = int(match.group(1))
                total = int(match.group(2))
                return current >= total
        
        # Look for disabled next button or similar indicators
        next_buttons = soup.find_all('a', string=re.compile(r'next|>|»', re.IGNORECASE))
        for button in next_buttons:
            if 'disabled' in button.get('class', []) or not button.get('href'):
                return True
        
        return False
    
    def extract_document_title_from_detail_page(self, detail_soup: BeautifulSoup) -> Optional[str]:
        """Extract document title from detail page"""
        # Look for title in various locations on the detail page
        title_selectors = [
            'h1', 'h2', 'h3', 
            '.document-title', '.title', '.header',
            'span[id*="title"]', 'span[id*="Title"]',
            'td[id*="title"]', 'td[id*="Title"]'
        ]
        
        for selector in title_selectors:
            title_element = detail_soup.select_one(selector)
            if title_element:
                title_text = title_element.get_text(strip=True)
                if title_text and len(title_text) > 5:
                    return title_text
        
        return None
    
    def find_pagination_postback_target(self, soup: BeautifulSoup, current_page: int) -> Optional[str]:
        """Find the correct postback target for pagination"""
        # Caledon uses image buttons for pagination, not JavaScript postback links
        # The controls are: FirstPage, PrevPage, NextPage, LastPage
        
        # Look for NextPage image button
        next_page_input = soup.find('input', {'name': 'ctl00$cphContent$NextPage'})
        if next_page_input:
            return 'ctl00$cphContent$NextPage'
        
        # Fallback: try to construct the target based on page number
        # ASP.NET DataGrid sometimes uses: ctl00$cphContent$dgList$ctl01$ctlXX for page XX
        next_page_target = f"ctl00$cphContent$dgList$ctl01$ctl{current_page + 1:02d}"
        return next_page_target
    
    def scrape_bylaws_database(self) -> List[Dict]:
        """Scrape the bylaws database"""
        print("📚 Scraping bylaws database...")
        return self.scrape_database_page(self.search_url)
    
    def scrape_policies_database(self) -> List[Dict]:
        """Scrape the policies database"""
        print("📋 Scraping policies database...")
        return self.scrape_database_page(self.policy_url)
    
    def try_direct_pdf_patterns(self) -> List[Dict]:
        """Try to access PDFs using known URL patterns"""
        pdf_links = []
        
        # Common document IDs observed in analysis
        known_doc_ids = [
            "638682276575858549",  # 2024-086
            "637203090570046185",  # 2019-43
            "636083305295722699",  # 98-86
            "637202991343891152",  # 2018-81
            "638566373093283583"   # Policy 2024-0351
        ]
        
        print("🎯 Trying known document patterns...")
        
        for doc_id in known_doc_ids:
            # Try bylaws directory
            bylaw_url = f"https://www.caledon.ca/uploads/14/Doc_{doc_id}.pdf"
            response = self.fetch_page(bylaw_url)
            if response and response.status_code == 200:
                pdf_links.append({
                    'url': bylaw_url,
                    'filename': f"Doc_{doc_id}.pdf",
                    'title': f"Caledon Bylaw Doc_{doc_id}"
                })
            
            # Try policies directory
            policy_url = f"https://www.caledon.ca/uploads/116/Doc_{doc_id}.pdf"
            response = self.fetch_page(policy_url)
            if response and response.status_code == 200:
                pdf_links.append({
                    'url': policy_url,
                    'filename': f"Doc_{doc_id}.pdf",
                    'title': f"Caledon Policy Doc_{doc_id}"
                })
        
        return pdf_links
    
    def run_scrape(self) -> Dict:
        """Enhanced scraping with detail page navigation"""
        print(f"🚀 Starting Caledon scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Scrape bylaws database via detail page navigation
        print("📚 Scraping bylaws database via detail page navigation...")
        bylaw_pdfs = self.scrape_bylaws_database()
        all_pdfs.extend(bylaw_pdfs)
        print(f"✓ Found {len(bylaw_pdfs)} bylaw PDFs")
        
        # Strategy 2: Scrape policies database via detail page navigation
        print("📋 Scraping policies database via detail page navigation...")
        policy_pdfs = self.scrape_policies_database()
        all_pdfs.extend(policy_pdfs)
        print(f"✓ Found {len(policy_pdfs)} policy PDFs")
        
        # Strategy 3: Try direct patterns (fallback)
        print("🎯 Trying direct PDF patterns...")
        direct_pdfs = self.try_direct_pdf_patterns()
        all_pdfs.extend(direct_pdfs)
        print(f"✓ Found {len(direct_pdfs)} PDFs via direct patterns")
        
        # Remove duplicates based on URL
        unique_pdfs = []
        seen_urls = set()
        for pdf in all_pdfs:
            if pdf['url'] not in seen_urls:
                unique_pdfs.append(pdf)
                seen_urls.add(pdf['url'])
        
        print(f"📊 Total unique PDFs found: {len(unique_pdfs)}")
        
        # Store documents found
        self.documents_found = unique_pdfs
        
        return self.get_scrape_summary()