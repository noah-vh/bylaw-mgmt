#!/usr/bin/env python3
"""
MCP-based PDF Link Extractor

This script uses direct web scraping to extract PDF links from municipality websites
and stores them using the MCP Supabase connection.
"""

import requests
import time
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
import re
import os

def is_pdf_link(url: str, link_text: str = "") -> bool:
    """Check if a URL points to a PDF"""
    url_lower = url.lower()
    text_lower = link_text.lower()
    
    # Check URL extension
    if url_lower.endswith('.pdf'):
        return True
    
    # Check for PDF in URL path or query
    if '/pdf/' in url_lower or 'pdf' in url_lower:
        return True
    
    # Check link text for PDF indicators
    pdf_indicators = ['pdf', 'adobe', 'acrobat', '.pdf']
    if any(indicator in text_lower for indicator in pdf_indicators):
        return True
    
    return False

def is_bylaw_related(url: str, link_text: str = "") -> bool:
    """Check if a URL/text is related to bylaws"""
    combined_text = f"{url} {link_text}".lower()
    
    bylaw_keywords = [
        'bylaw', 'by-law', 'regulation', 'ordinance', 'policy', 
        'zoning', 'municipal', 'code', 'rules', 'law', 'statute',
        'adu', 'accessory', 'dwelling', 'housing', 'residential'
    ]
    
    return any(keyword in combined_text for keyword in bylaw_keywords)

def extract_pdf_links_from_website(url: str, max_pages: int = 3) -> List[Dict]:
    """Extract PDF links from a municipality website"""
    print(f"🔍 Scanning: {url}")
    
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (compatible; BylawScraper/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    })
    
    pdf_links = []
    visited_urls = set()
    urls_to_visit = [url]
    
    for page_num in range(max_pages):
        if not urls_to_visit:
            break
            
        current_url = urls_to_visit.pop(0)
        
        # Skip if already visited
        if current_url in visited_urls:
            continue
        visited_urls.add(current_url)
        
        try:
            print(f"  📄 Page {page_num + 1}: {current_url}")
            response = session.get(current_url, timeout=30)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Find all links
            links = soup.find_all('a', href=True)
            
            for link in links:
                href = link['href'].strip()
                link_text = link.get_text(strip=True)
                
                # Convert relative URLs to absolute
                full_url = urljoin(current_url, href)
                
                # Check if it's a PDF
                if is_pdf_link(full_url, link_text):
                    pdf_info = {
                        'url': full_url,
                        'title': link_text or 'Untitled Document',
                        'filename': os.path.basename(urlparse(full_url).path) or 'document.pdf',
                        'found_on_page': current_url,
                        'is_bylaw_related': is_bylaw_related(full_url, link_text)
                    }
                    
                    # Avoid duplicates
                    if not any(p['url'] == full_url for p in pdf_links):
                        pdf_links.append(pdf_info)
                        bylaw_indicator = "🏛️ " if pdf_info['is_bylaw_related'] else "📄 "
                        print(f"    {bylaw_indicator}Found PDF: {pdf_info['title'][:50]}...")
                
                # Add more pages to visit (stay within same domain)
                elif len(urls_to_visit) < 10:  # Limit pages to explore
                    parsed_current = urlparse(current_url)
                    parsed_link = urlparse(full_url)
                    
                    # Only follow links on same domain
                    if (parsed_link.netloc == parsed_current.netloc and 
                        full_url not in visited_urls and 
                        full_url not in urls_to_visit and
                        is_bylaw_related(full_url, link_text)):
                        urls_to_visit.append(full_url)
            
            # Small delay between pages
            time.sleep(1)
            
        except Exception as e:
            print(f"    ❌ Error scanning {current_url}: {e}")
            continue
    
    return pdf_links

def main():
    """Main function to extract PDF links from municipalities"""
    print("🚀 MCP PDF Link Extraction")
    print("=" * 50)
    
    # This will need to be called from the Claude environment where MCP tools are available
    # For now, we'll create a template function that shows what would be done
    
    print("ℹ️  This script is designed to be run from the Claude Code environment")
    print("ℹ️  where MCP Supabase tools are available.")
    print()
    print("📋 The process would be:")
    print("1. Get municipalities from Supabase using MCP tools")
    print("2. For each municipality, extract PDF links from their website")
    print("3. Store new PDF documents in the database using MCP tools")
    print()
    
    # Example of what the extraction would look like for one municipality
    example_url = "https://www.ajax.ca/Modules/bylaws/Bylaw/Search"
    print(f"🧪 Testing extraction on: {example_url}")
    
    try:
        pdf_links = extract_pdf_links_from_website(example_url, max_pages=2)
        print(f"\n✅ Found {len(pdf_links)} PDF links")
        
        # Show first few results
        for i, pdf in enumerate(pdf_links[:5], 1):
            bylaw_indicator = "🏛️ " if pdf['is_bylaw_related'] else "📄 "
            print(f"  {i}. {bylaw_indicator}{pdf['title'][:60]}...")
            print(f"     URL: {pdf['url']}")
        
        if len(pdf_links) > 5:
            print(f"     ... and {len(pdf_links) - 5} more")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    main()