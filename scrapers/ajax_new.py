"""
Ajax By-laws PDF Scraper - JavaScript-Enabled Implementation
Based on Municipal Analysis Strategy Guide with Selenium

The Ajax bylaws are loaded dynamically via JavaScript and download links are hidden.
We use Selenium to execute JavaScript and extract the hidden download URLs.
Navigation: JavaScript-loaded Table → Extract Hidden Download Links
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import os
import re
from urllib.parse import urljoin, urlparse
from .base_supabase import BaseSupabaseScraper
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import json

class AjaxScraper(BaseSupabaseScraper):
    """Ajax municipality scraper - JavaScript-enabled with Selenium"""
    
    def __init__(self, municipality_id: int):
        base_url = "https://www.ajax.ca"
        search_url = "https://www.ajax.ca/Modules/bylaws/Bylaw/Search?_mid_=9613"
        super().__init__(municipality_id, base_url, search_url)
        self.driver = None
    
    def setup_driver(self):
        """Setup Chrome driver with appropriate options"""
        chrome_options = Options()
        chrome_options.add_argument("--headless")  # Run in background
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        
        try:
            self.driver = webdriver.Chrome(options=chrome_options)
            self.driver.implicitly_wait(10)
            return True
        except Exception as e:
            print(f"Failed to setup Chrome driver: {e}")
            return False
    
    def cleanup_driver(self):
        """Clean up the driver"""
        if self.driver:
            self.driver.quit()
            self.driver = None
    
    def find_pdf_links_on_current_page(self) -> List[Dict]:
        """Extract direct PDF download links from current page using Selenium"""
        if not self.driver:
            print("❌ Driver not initialized")
            return []
        
        pdf_links = []
        
        try:
            # Wait for the page to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            
            # Execute JavaScript to reveal hidden download links from search results
            print("🔧 Executing JavaScript to reveal hidden download links...")
            
            # Look for the search results - they appear to be in a specific format
            try:
                # Execute JavaScript to extract download links from the search results
                script = """
                var links = [];
                
                // Look for the search results section
                var searchResults = document.body.innerHTML;
                
                // Look for bylaw entries in the format shown in the user's example
                var bylawPattern = /([0-9-]+)\\s+([^\\[]+)\\[download\\]/g;
                var match;
                
                while ((match = bylawPattern.exec(searchResults)) !== null) {
                    var bylawNumber = match[1];
                    var bylawTitle = match[2].trim();
                    
                    // Look for download links near this bylaw entry
                    var downloadLinks = document.querySelectorAll('a[href*="Download"], a[href*="download"]');
                    
                    downloadLinks.forEach(function(link) {
                        var href = link.getAttribute('href');
                        var linkText = link.innerText.trim();
                        
                        // Check if this download link is associated with our bylaw
                        if (href && (href.includes('Download') || linkText.toLowerCase().includes('download'))) {
                            // Try to find the bylaw info in the surrounding content
                            var parentElement = link.closest('tr, div, p, td');
                            var contextText = parentElement ? parentElement.innerText : '';
                            
                            // Check if this context contains our bylaw number
                            if (contextText.includes(bylawNumber)) {
                                links.push({
                                    url: href,
                                    title: 'By-law ' + bylawNumber + ' - ' + bylawTitle,
                                    text: linkText,
                                    bylawNumber: bylawNumber
                                });
                            }
                        }
                    });
                }
                
                // Alternative approach: Look for all download links and extract context
                if (links.length === 0) {
                    var allDownloadLinks = document.querySelectorAll('a[href*="Download"], a[href*="download"]');
                    
                    allDownloadLinks.forEach(function(link) {
                        var href = link.getAttribute('href');
                        var linkText = link.innerText.trim();
                        
                        if (href && (href.includes('Download') || linkText.toLowerCase().includes('download'))) {
                            // Try to find bylaw info in the surrounding content
                            var parentRow = link.closest('tr');
                            if (parentRow) {
                                var rowText = parentRow.innerText;
                                var bylawMatch = rowText.match(/([0-9-]+)\\s+([^\\[]+)/);
                                if (bylawMatch) {
                                    links.push({
                                        url: href,
                                        title: 'By-law ' + bylawMatch[1] + ' - ' + bylawMatch[2].trim(),
                                        text: linkText,
                                        bylawNumber: bylawMatch[1]
                                    });
                                } else {
                                    // Fallback title
                                    links.push({
                                        url: href,
                                        title: linkText || 'Unknown Bylaw',
                                        text: linkText
                                    });
                                }
                            }
                        }
                    });
                }
                
                return links;
                """
                
                js_links = self.driver.execute_script(script)
                
                # Process the JavaScript-extracted links
                for link_data in js_links:
                    href = link_data.get('url', '')
                    title = link_data.get('title', '')
                    link_text = link_data.get('text', '')
                    
                    # Convert to absolute URL
                    full_url = urljoin(self.base_url, href)
                    
                    # Extract GUID from URL for filename
                    guid_match = re.search(r'Download/([a-f0-9-]+)', href)
                    if guid_match:
                        guid = guid_match.group(1)
                        filename = f"bylaw_{guid}.pdf"
                    else:
                        filename = os.path.basename(urlparse(full_url).path) or "unknown_bylaw.pdf"
                    
                    # Clean up the title
                    final_title = self.clean_bylaw_title(title or link_text or filename)
                    
                    pdf_links.append({
                        'url': full_url,
                        'filename': filename,
                        'title': final_title
                    })
                
                print(f"✅ JavaScript extraction found {len(pdf_links)} download links")
                
            except Exception as e:
                print(f"❌ Error with JavaScript extraction: {e}")
                
                # Fallback: Look for any download links in the page source
                print("⚠️ Trying fallback method...")
                page_source = self.driver.page_source
                soup = BeautifulSoup(page_source, 'html.parser')
                for link in soup.find_all('a', href=True):
                    href = link['href']
                    link_text = link.get_text(strip=True)
                    
                    # Check if this is a download link
                    if '/Modules/bylaws/Bylaw/Download/' in href or 'download' in link_text.lower():
                        # Convert to absolute URL
                        full_url = urljoin(self.base_url, href)
                        
                        # Extract GUID from URL for filename
                        guid_match = re.search(r'Download/([a-f0-9-]+)', href)
                        if guid_match:
                            guid = guid_match.group(1)
                            filename = f"bylaw_{guid}.pdf"
                        else:
                            filename = os.path.basename(urlparse(full_url).path) or "unknown_bylaw.pdf"
                        
                        # Try to extract bylaw info from the table row
                        title = self.extract_bylaw_title_from_table_row(link) or link_text
                        
                        pdf_links.append({
                            'url': full_url,
                            'filename': filename,
                            'title': title or filename
                        })
                
                print(f"✅ Fallback extraction found {len(pdf_links)} download links")
                
        except Exception as e:
            print(f"❌ Error extracting PDF links: {e}")
        
        return pdf_links
    
    def find_pdf_links(self, html_content: str) -> List[Dict]:
        """Required abstract method - delegates to find_pdf_links_on_current_page"""
        # This method is required by the base class but we use Selenium directly
        # so we'll return the current page results
        return self.find_pdf_links_on_current_page()
    
    def handle_pagination(self, soup: BeautifulSoup) -> Optional[str]:
        """Required abstract method - not used in Selenium implementation"""
        # This method is required by the base class but we use click_next_page instead
        # Return None since we handle pagination differently
        return None
    
    def clean_bylaw_title(self, title: str) -> str:
        """Clean and format a bylaw title"""
        if not title:
            return "Unknown Bylaw"
        
        # Remove common noise
        title = re.sub(r'\s*\[download\]\s*', '', title, flags=re.IGNORECASE)
        title = re.sub(r'\s*download\s*', '', title, flags=re.IGNORECASE)
        title = re.sub(r'^[:\-\s]+', '', title)
        title = re.sub(r'[:\-\s]+$', '', title)
        
        # Extract bylaw number if present
        bylaw_match = re.search(r'(\d+-\d+)', title)
        if bylaw_match:
            bylaw_number = bylaw_match.group(1)
            # Check if "By-law" prefix is already there
            if not title.lower().startswith('by-law'):
                return f"By-law {bylaw_number} - {title}"
        
        return title.strip() if title.strip() else "Unknown Bylaw"
    
    def extract_bylaw_title_from_table_row(self, download_link) -> Optional[str]:
        """Extract bylaw title and number from the table row containing the download link"""
        try:
            # Find the table row containing this download link
            row = download_link.find_parent('tr')
            if not row:
                return None
            
            # Look for bylaw number and title in the row
            row_text = row.get_text(strip=True)
            
            # Extract bylaw number (e.g., "68-2023", "52-2023", etc.)
            bylaw_match = re.search(r'(\d+-\d+)', row_text)
            bylaw_number = bylaw_match.group(1) if bylaw_match else None
            
            # Extract title (usually after the bylaw number)
            if bylaw_number:
                # Split by the bylaw number and get the part after it
                parts = row_text.split(bylaw_number, 1)
                if len(parts) > 1:
                    title_part = parts[1].strip()
                    # Remove common prefixes and clean up
                    title_part = re.sub(r'^[:\-\s]+', '', title_part)
                    title_part = re.sub(r'\s*\[download\]\s*$', '', title_part, flags=re.IGNORECASE)
                    
                    if title_part:
                        return f"By-law {bylaw_number} - {title_part}"
            
            # Fallback: just return the cleaned row text
            cleaned_text = re.sub(r'\s*\[download\]\s*', '', row_text, flags=re.IGNORECASE)
            if cleaned_text and len(cleaned_text) > 5:
                return cleaned_text
            
            return None
            
        except Exception as e:
            print(f"Error extracting title from table row: {e}")
            return None
    
    def click_next_page(self, current_page: int = 1) -> bool:
        """Click to the next page using Selenium interactions for AJAX pagination"""
        if not self.driver:
            return False
        
        try:
            next_page_num = current_page + 1
            print(f"🔍 Looking for page {next_page_num} link...")
            
            # Wait for pagination controls to load
            WebDriverWait(self.driver, 5).until(
                EC.presence_of_element_located((By.TAG_NAME, "a"))
            )
            
            # Look for actual search results pagination (not site navigation)
            print("🔍 Looking for search results pagination...")
            
            # First, find the search results area that contains "Displaying X - Y of Z"
            pagination_search_script = """
            var paginationInfo = [];
            
            // Look for text that indicates pagination like "Displaying 11 - 20 of 63"
            var displayingText = document.body.innerText;
            var displayingMatch = displayingText.match(/Displaying\\s+(\\d+)\\s*-\\s*(\\d+)\\s*of\\s*(\\d+)/);
            
            if (displayingMatch) {
                var currentStart = parseInt(displayingMatch[1]);
                var currentEnd = parseInt(displayingMatch[2]);
                var total = parseInt(displayingMatch[3]);
                
                // Look for pagination links near this text
                var allLinks = document.querySelectorAll('a');
                
                allLinks.forEach(function(link, index) {
                    var text = link.innerText.trim();
                    var href = link.getAttribute('href') || '';
                    var onclick = link.getAttribute('onclick') || '';
                    
                    // Look for pagination-related links
                    if (text.match(/^\\d+$/) && parseInt(text) > 1 && parseInt(text) <= 7) {
                        // This could be a page number
                        paginationInfo.push({
                            type: 'page_number',
                            text: text,
                            href: href,
                            onclick: onclick,
                            element: link
                        });
                    } else if (text.toLowerCase().includes('next') || text === '>') {
                        // This could be a next button
                        paginationInfo.push({
                            type: 'next',
                            text: text,
                            href: href,
                            onclick: onclick,
                            element: link
                        });
                    }
                });
            }
            
            return paginationInfo;
            """
            
            pagination_info = self.driver.execute_script(pagination_search_script)
            print(f"📋 Found {len(pagination_info)} search pagination elements:")
            for info in pagination_info:
                print(f"  - Type: {info['type']}, Text: '{info['text']}', OnClick: '{info['onclick'][:50]}...'")
            
            # Try to click on the specific page number or next button
            try:
                # Look for the exact page number first
                for info in pagination_info:
                    if info['type'] == 'page_number' and info['text'] == str(next_page_num):
                        print(f"✅ Found page {next_page_num} link in search results")
                        # Use JavaScript to click the element
                        self.driver.execute_script("arguments[0].click();", info['element'])
                        time.sleep(3)  # Wait for AJAX content to load
                        return True
                
                # If no specific page number, try next button
                for info in pagination_info:
                    if info['type'] == 'next':
                        print(f"✅ Found 'Next' button in search results")
                        # Use JavaScript to click the element
                        self.driver.execute_script("arguments[0].click();", info['element'])
                        time.sleep(3)  # Wait for AJAX content to load
                        return True
                        
            except Exception as e:
                print(f"❌ Error clicking search pagination: {e}")
            
            # Alternative approach: Look for any clickable elements near the "Displaying X - Y of Z" text
            try:
                # Find elements that contain pagination text
                displaying_elements = self.driver.find_elements(By.XPATH, "//*[contains(text(), 'Displaying') or contains(text(), 'of ')]")
                
                for element in displaying_elements:
                    # Look for clickable elements near this one
                    parent = element.find_element(By.XPATH, "..")
                    links = parent.find_elements(By.TAG_NAME, "a")
                    
                    for link in links:
                        text = link.text.strip()
                        if text == str(next_page_num) or text.lower() in ['next', '>']:
                            print(f"✅ Found pagination link near 'Displaying' text: '{text}'")
                            self.driver.execute_script("arguments[0].click();", link)
                            time.sleep(3)
                            return True
                            
            except Exception as e:
                print(f"❌ Error with alternative pagination search: {e}")
            
            print(f"❌ No way to navigate to page {next_page_num}")
            return False
            
        except Exception as e:
            print(f"❌ Error clicking next page: {e}")
            return False
    
    def run_scrape(self) -> Dict:
        """Run the complete scraping process with Selenium - JavaScript-enabled PDF extraction"""
        print(f"🚀 Starting Ajax scrape for municipality {self.municipality_id}")
        print("🔧 Pattern: JavaScript-enabled extraction with Selenium")
        print("📊 Expected: 7 pages with 63 documents total")
        print("="*50)
        
        all_pdfs = []
        
        # Setup Selenium driver
        if not self.setup_driver():
            print("❌ Failed to setup Selenium driver")
            return {'error': 'Failed to setup Selenium driver'}
        
        try:
            page_count = 0
            
            # Navigate to the initial search page
            print(f"🔍 Loading initial search page: {self.search_url}")
            self.driver.get(self.search_url)
            
            while page_count < 10:  # Safety limit (should be 7 pages)
                page_count += 1
                print(f"📄 Processing page {page_count}")
                
                # Wait for page to load
                try:
                    WebDriverWait(self.driver, 10).until(
                        EC.presence_of_element_located((By.TAG_NAME, "body"))
                    )
                except TimeoutException:
                    print(f"⚠️ Page {page_count} timed out loading")
                    break
                
                # Get PDF download links from current page using JavaScript
                pdf_links = self.find_pdf_links_on_current_page()
                print(f"📋 Found {len(pdf_links)} PDF download links on page {page_count}")
                
                # Add PDFs to collection
                for pdf_link in pdf_links:
                    all_pdfs.append(pdf_link)
                    print(f"  ✅ Found PDF: {pdf_link['title']}")
                
                # Try to navigate to next page using Selenium clicks
                if page_count < 7:  # Only try to go to next page if we haven't reached the expected max
                    if self.click_next_page(page_count):
                        print(f"➡️ Successfully navigated to page {page_count + 1}")
                        time.sleep(3)  # Wait for page to load
                    else:
                        print("✅ No more pages found or unable to navigate")
                        break
                else:
                    print("✅ Reached expected maximum pages (7)")
                    break
            
            # Remove duplicates based on URL
            unique_pdfs = []
            seen_urls = set()
            for pdf in all_pdfs:
                if pdf['url'] not in seen_urls:
                    unique_pdfs.append(pdf)
                    seen_urls.add(pdf['url'])
            
            print(f"📊 Summary:")
            print(f"   Pages processed: {page_count}")
            print(f"   Total PDFs found: {len(all_pdfs)}")
            print(f"   Unique PDFs: {len(unique_pdfs)}")
            print(f"   Expected: 63 documents")
            
            if len(unique_pdfs) == 63:
                print("✅ SUCCESS: Found all expected 63 documents!")
            elif len(unique_pdfs) > 0:
                print(f"⚠️  Found {len(unique_pdfs)} documents, expected 63")
            else:
                print("❌ No documents found - check JavaScript extraction and pagination")
            
            # Store documents found
            self.documents_found = unique_pdfs
            
            return self.get_scrape_summary()
            
        except Exception as e:
            print(f"❌ Error during scraping: {e}")
            return {'error': f'Scraping failed: {str(e)}'}
        
        finally:
            # Always clean up the driver
            self.cleanup_driver()