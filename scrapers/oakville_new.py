"""
Oakville By-laws PDF Scraper - New Implementation
Based on analysis: Pattern B - Predictable Direct Links
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from urllib.parse import urljoin, urlparse
from .base_supabase import BaseSupabaseScraper
import time

class OakvilleScraper(BaseSupabaseScraper):
    """Oakville municipality scraper - predictable direct links approach"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://bylaws.oakville.ca"
        search_url = "https://bylaws.oakville.ca/bylaws-all"
        super().__init__(municipality_id, base_url, search_url)
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Extract PDF links from page content"""
        soup = BeautifulSoup(html_content, 'html.parser')
        pdf_links = []
        
        # Look for getmedia PDF links
        for link in soup.find_all('a', href=True):
            href = link['href']
            if '/getmedia/' in href and href.endswith('.pdf'):
                full_url = urljoin(self.base_url, href)
                link_text = link.get_text(strip=True)
                filename = os.path.basename(urlparse(full_url).path)
                
                pdf_links.append({
                    'url': full_url,
                    'filename': filename,
                    'title': link_text or filename
                })
        
        # Look for escribemeetings PDF links
        for link in soup.find_all('a', href=True):
            href = link['href']
            if 'pub-oakville.escribemeetings.com' in href:
                full_url = href if href.startswith('http') else urljoin(self.base_url, href)
                link_text = link.get_text(strip=True)
                filename = f"document_{href.split('DocumentId=')[-1]}.pdf" if 'DocumentId=' in href else 'document.pdf'
                
                pdf_links.append({
                    'url': full_url,
                    'filename': filename,
                    'title': link_text or filename
                })
        
        return pdf_links
    
    def handle_pagination(self, soup: BeautifulSoup) -> Optional[str]:
        """Handle pagination if present"""
        # Look for pagination controls
        next_link = soup.find('a', {'class': 'next'})
        if next_link and next_link.get('href'):
            return urljoin(self.base_url, next_link['href'])
        
        # Look for numbered pagination links
        page_links = soup.find_all('a', href=True)
        for link in page_links:
            href = link.get('href', '')
            text = link.get_text(strip=True)
            if text.isdigit() and ('page=' in href or 'p=' in href):
                return urljoin(self.base_url, href)
        
        # Look for "Next" or ">" links
        for link in page_links:
            text = link.get_text(strip=True).lower()
            if text in ['next', '>', 'more', 'show more', 'load more'] and link.get('href'):
                return urljoin(self.base_url, link['href'])
        
        # Look for JavaScript-based pagination
        for link in page_links:
            onclick = link.get('onclick', '')
            if onclick and ('page' in onclick.lower() or 'load' in onclick.lower()):
                # Try to extract URL from onclick JavaScript
                import re
                url_match = re.search(r"(?:location\.href|window\.location)\s*=\s*['\"]([^'\"]+)['\"]", onclick)
                if url_match:
                    return urljoin(self.base_url, url_match.group(1))
        
        return None
    
    def scrape_bylaws_with_search(self) -> List[Dict]:
        """Scrape bylaws using search functionality with municipal keywords"""
        pdf_links = []
        all_bylaw_urls = set()
        
        # Get municipal search terms by analyzing the search page
        search_terms = self.get_municipal_search_terms()
        
        print(f"🔍 Using {len(search_terms)} municipal search terms")
        
        # Search with each term to collect all bylaw URLs
        for term in search_terms:
            print(f"🔍 Searching for: '{term}'")
            
            # Submit search request
            search_results = self.perform_search(term)
            if search_results:
                bylaw_urls = self.extract_bylaw_urls_from_search(search_results)
                all_bylaw_urls.update(bylaw_urls)
                print(f"  ✓ Found {len(bylaw_urls)} bylaw URLs")
            
            time.sleep(0.5)  # Be respectful
        
        print(f"📋 Total unique bylaw URLs: {len(all_bylaw_urls)}")
        
        # Process each bylaw URL to extract PDFs
        for i, bylaw_url in enumerate(all_bylaw_urls):
            print(f"📄 Processing {i+1}/{len(all_bylaw_urls)}: {bylaw_url}")
            
            pdf_info = self.extract_pdf_from_bylaw_page(bylaw_url)
            if pdf_info:
                pdf_links.append(pdf_info)
                print(f"  ✓ Found PDF: {pdf_info['filename']}")
            else:
                print(f"  ❌ No PDF found")
            
            time.sleep(0.3)  # Be respectful
        
        return pdf_links
    
    def get_municipal_search_terms(self) -> List[str]:
        """Get search terms from the municipal database (user-provided keywords)"""
        # Use the specific keywords from your municipal database for Oakville
        search_terms = [
            '',  # Empty search to get all results
            'secondary suite',
            'accessory dwelling',
            'laneway home',
            'garden suite',
            'basement apartment',
            'accessory apartment',
            'auxiliary dwelling',
            'granny flat',
            'in-law suite',
            'ancillary dwelling',
            'secondary dwelling',
            'accessory building',
            'secondary unit',
            'additional dwelling',
            'coach house',
            'carriage house',
            'detached dwelling',
            'accessory structure',
            'additional dwelling unit',
            'adu'
        ]
        
        print(f"  ✓ Using {len(search_terms)} keywords from municipal database")
        return search_terms
    
    def perform_search(self, search_term: str) -> Optional[str]:
        """Perform search on the bylaws database"""
        try:
            # First, get the search page to understand the form structure
            response = self.fetch_page(self.search_url)
            if not response:
                return None
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Look for search forms
            search_form = soup.find('form')
            if search_form:
                # Get form action and method
                action = search_form.get('action', '')
                method = search_form.get('method', 'get').lower()
                
                # Extract all form fields
                form_data = {}
                for input_field in search_form.find_all(['input', 'select', 'textarea']):
                    name = input_field.get('name')
                    if name:
                        if input_field.name == 'input':
                            input_type = input_field.get('type', 'text')
                            if input_type == 'text' or input_type == 'search':
                                form_data[name] = search_term
                            elif input_type == 'hidden':
                                form_data[name] = input_field.get('value', '')
                        elif input_field.name == 'select':
                            # Use first option or default value
                            first_option = input_field.find('option')
                            if first_option:
                                form_data[name] = first_option.get('value', '')
                
                # Submit the form
                if action:
                    form_url = urljoin(self.base_url, action)
                else:
                    form_url = self.search_url
                
                if method == 'post':
                    response = self.session.post(form_url, data=form_data)
                else:
                    response = self.session.get(form_url, params=form_data)
                
                if response and response.status_code == 200:
                    print(f"    ✓ Search form submitted successfully")
                    return response.text
            
            # If no form found, try simple URL parameters
            simple_params = [
                {'search': search_term},
                {'q': search_term},
                {'query': search_term},
                {'keyword': search_term},
                {'term': search_term},
                {'filter': search_term}
            ]
            
            for params in simple_params:
                response = self.session.get(self.search_url, params=params)
                if response and response.status_code == 200:
                    # Check if this actually returned different content
                    if search_term.lower() in response.text.lower():
                        print(f"    ✓ Found search term in results")
                        return response.text
            
            # If search term is empty, just return the main page
            if not search_term:
                return response.text if response else None
                
            print(f"    ❌ No search results found for '{search_term}'")
            return None
            
        except Exception as e:
            print(f"  ❌ Search error: {e}")
            return None
    
    def extract_bylaw_urls_from_search(self, html_content: str) -> List[str]:
        """Extract bylaw URLs from search results"""
        soup = BeautifulSoup(html_content, 'html.parser')
        bylaw_urls = []
        
        print(f"    🔍 Analyzing HTML content ({len(html_content)} chars)")
        
        # Look for bylaw number links in search results
        all_links = soup.find_all('a', href=True)
        print(f"    📋 Found {len(all_links)} total links")
        
        for link in all_links:
            href = link['href']
            link_text = link.get_text(strip=True)
            
            # Check if this looks like a bylaw number link (e.g., "2025-125")
            if re.match(r'\d{4}-\d+', link_text):
                # Convert to absolute URL
                if href.startswith('/'):
                    href = urljoin(self.base_url, href)
                elif not href.startswith('http'):
                    href = urljoin(self.base_url, href)
                
                bylaw_urls.append(href)
                print(f"    ✓ Found bylaw link: {link_text} -> {href}")
            
            # Also check href for bylaw patterns
            elif '/bylaws-all/' in href and re.search(r'\d{4}-\d+', href):
                if href.startswith('/'):
                    href = urljoin(self.base_url, href)
                elif not href.startswith('http'):
                    href = urljoin(self.base_url, href)
                
                bylaw_urls.append(href)
                print(f"    ✓ Found bylaw URL: {href}")
        
        # If no bylaw URLs found, try a broader search
        if not bylaw_urls:
            print("    ⚠️ No bylaw URLs found, trying broader search...")
            # Look for any links that might be bylaws
            for link in all_links:
                href = link['href']
                link_text = link.get_text(strip=True)
                
                # Check if link text contains numbers that might be bylaw numbers
                if re.search(r'\d{4}', link_text) and re.search(r'\d+', link_text):
                    if href.startswith('/'):
                        href = urljoin(self.base_url, href)
                    elif not href.startswith('http'):
                        href = urljoin(self.base_url, href)
                    
                    bylaw_urls.append(href)
                    print(f"    ? Potential bylaw: {link_text} -> {href}")
        
        unique_urls = list(set(bylaw_urls))
        print(f"    📊 Extracted {len(unique_urls)} unique bylaw URLs")
        return unique_urls
    
    def extract_pdf_from_bylaw_page(self, bylaw_url: str) -> Optional[Dict]:
        """Extract PDF from a specific bylaw page (e.g., /bylaws-all/2025-125)"""
        response = self.fetch_page(bylaw_url)
        if not response:
            return None
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Look for embedded PDFs in iframes or objects
        for embed in soup.find_all(['iframe', 'object', 'embed']):
            src = embed.get('src') or embed.get('data')
            if src and src.endswith('.pdf'):
                full_url = urljoin(self.base_url, src)
                filename = os.path.basename(urlparse(full_url).path)
                
                # Extract bylaw number from URL for title
                bylaw_number = bylaw_url.split('/')[-1]
                title = f"Bylaw {bylaw_number}"
                
                return {
                    'url': full_url,
                    'filename': filename,
                    'title': title,
                    'source_page': bylaw_url
                }
        
        # Look for direct PDF download links
        for link in soup.find_all('a', href=True):
            href = link['href']
            
            # Check for direct PDF links
            if href.endswith('.pdf'):
                full_url = urljoin(self.base_url, href)
                link_text = link.get_text(strip=True)
                filename = os.path.basename(urlparse(full_url).path)
                
                # Extract bylaw number from URL for title
                bylaw_number = bylaw_url.split('/')[-1]
                title = f"Bylaw {bylaw_number}"
                
                return {
                    'url': full_url,
                    'filename': filename,
                    'title': title,
                    'source_page': bylaw_url
                }
        
        return None
    
    def extract_document_title_from_page(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract document title from detail page"""
        # Look for title in various locations
        title_selectors = [
            'h1', 'h2', '.page-title', '.bylaw-title', '.document-title',
            '.content-title', 'title'
        ]
        
        for selector in title_selectors:
            title_element = soup.select_one(selector)
            if title_element:
                title_text = title_element.get_text(strip=True)
                if title_text and len(title_text) > 5:
                    return title_text
        
        return None
    
    def scrape_popular_bylaws_pages(self) -> List[Dict]:
        """Scrape the popular bylaws category pages"""
        pdf_links = []
        
        # Popular bylaws category pages
        category_pages = [
            "https://www.oakville.ca/town-hall/by-laws-enforcement/popular-by-laws/",
            "https://www.oakville.ca/town-hall/by-laws-enforcement/popular-by-laws/home-property-standards/",
            "https://www.oakville.ca/town-hall/by-laws-enforcement/popular-by-laws/building-development/",
            "https://www.oakville.ca/town-hall/by-laws-enforcement/popular-by-laws/licenses-permits/",
            "https://www.oakville.ca/town-hall/by-laws-enforcement/popular-by-laws/noise-safety/",
            "https://www.oakville.ca/town-hall/by-laws-enforcement/popular-by-laws/parking-driving/",
            "https://www.oakville.ca/town-hall/by-laws-enforcement/popular-by-laws/parks-public-spaces/",
            "https://www.oakville.ca/town-hall/by-laws-enforcement/popular-by-laws/planning-zoning/",
            "https://www.oakville.ca/town-hall/by-laws-enforcement/popular-by-laws/town-administration/"
        ]
        
        for page_url in category_pages:
            print(f"📂 Scraping category page: {page_url}")
            response = self.fetch_page(page_url)
            if response:
                page_pdfs = self.find_pdf_links(response.text)
                pdf_links.extend(page_pdfs)
                print(f"✓ Found {len(page_pdfs)} PDFs on category page")
        
        return pdf_links
    
    def try_direct_pdf_patterns(self) -> List[Dict]:
        """Try to access PDFs using known URL patterns"""
        pdf_links = []
        
        # Known working files from analysis
        known_files = [
            {
                "guid": "4647ca61-1f11-4c65-9200-c3bafa6782a4",
                "filename": "zoning-by-law-2014-014.pdf",
                "title": "Zoning By-law 2014-014 (South of Dundas)"
            },
            {
                "guid": "88f1888c-36e3-4e77-b1d3-319aa92e21d5",
                "filename": "zoning-by-law-2009-189-full-document.pdf",
                "title": "Zoning By-law 2009-189 (North Oakville)"
            },
            {
                "guid": "0533a5ad-752c-4b9f-90f0-ffaad6a71957",
                "filename": "bylaw-property-standards-certificate-of-compliance-request-form.pdf",
                "title": "Property Standards Certificate Form"
            },
            {
                "guid": "02435c60-741b-4527-bad2-15b18621751d",
                "filename": "bylaw-2023-075-lot-maintenance-consolidated.pdf",
                "title": "Lot Maintenance By-law 2023-075 (Consolidated)"
            },
            {
                "guid": "3281d9e7-9e15-404c-8851-458705763d72",
                "filename": "bylaw-2023-021-delegation-municipal-powers.pdf",
                "title": "Delegation of Municipal Powers By-law 2023-021"
            }
        ]
        
        print("🎯 Trying known PDF patterns...")
        
        for file_info in known_files:
            pdf_url = f"https://www.oakville.ca/getmedia/{file_info['guid']}/{file_info['filename']}"
            response = self.fetch_page(pdf_url)
            if response and response.status_code == 200:
                pdf_links.append({
                    'url': pdf_url,
                    'filename': file_info['filename'],
                    'title': file_info['title']
                })
                print(f"✓ Found: {file_info['title']}")
        
        # Try some escribemeetings documents
        known_escribemeetings = [
            {"doc_id": "71603", "title": "Noise By-law 2024-079"},
            {"doc_id": "71604", "title": "Document 71604"},
            {"doc_id": "71605", "title": "Document 71605"}
        ]
        
        for doc_info in known_escribemeetings:
            pdf_url = f"https://pub-oakville.escribemeetings.com/filestream.ashx?DocumentId={doc_info['doc_id']}"
            response = self.fetch_page(pdf_url)
            if response and response.status_code == 200:
                pdf_links.append({
                    'url': pdf_url,
                    'filename': f"document_{doc_info['doc_id']}.pdf",
                    'title': doc_info['title']
                })
                print(f"✓ Found escribemeetings: {doc_info['title']}")
        
        return pdf_links
    
    def scrape_main_bylaw_pages(self) -> List[Dict]:
        """Scrape main bylaw enforcement pages"""
        pdf_links = []
        
        # Main pages to check
        main_pages = [
            self.search_url,
            "https://www.oakville.ca/town-hall/by-laws-enforcement/by-law-search/",
            "https://www.oakville.ca/town-hall/by-laws-enforcement/popular-by-laws/"
        ]
        
        for page_url in main_pages:
            print(f"📋 Scraping main page: {page_url}")
            response = self.fetch_page(page_url)
            if response:
                page_pdfs = self.find_pdf_links(response.text)
                pdf_links.extend(page_pdfs)
                print(f"✓ Found {len(page_pdfs)} PDFs on main page")
        
        return pdf_links
    
    def run_scrape(self) -> Dict:
        """Enhanced scraping with search pagination and predictable direct links approach"""
        print(f"🚀 Starting Oakville scrape for municipality {self.municipality_id}")
        print("="*50)
        
        all_pdfs = []
        
        # Strategy 1: Scrape bylaws using search with municipal terms
        print("🔍 Scraping bylaws using search functionality...")
        search_pdfs = self.scrape_bylaws_with_search()
        all_pdfs.extend(search_pdfs)
        print(f"✓ Found {len(search_pdfs)} PDFs from search")
        
        # Strategy 2: Scrape main pages
        print("📋 Scraping main bylaw pages...")
        main_pdfs = self.scrape_main_bylaw_pages()
        all_pdfs.extend(main_pdfs)
        print(f"✓ Found {len(main_pdfs)} PDFs from main pages")
        
        # Strategy 3: Scrape popular bylaws categories
        print("📂 Scraping popular bylaws categories...")
        category_pdfs = self.scrape_popular_bylaws_pages()
        all_pdfs.extend(category_pdfs)
        print(f"✓ Found {len(category_pdfs)} PDFs from category pages")
        
        # Strategy 4: Try direct patterns
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