#!/usr/bin/env python3
"""
Simple PDF Link Extractor

This script directly extracts PDF links from municipality websites
and stores them in the Supabase database.
"""

import sys
import os
import requests
import time
from datetime import datetime
from typing import Dict, List, Optional, Set
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
import re

# Add the bylaw_scrapers path for database access
SCRAPERS_PATH = "/Users/noahvanhart/Documents/GitHub/bylaw_scrapers"
sys.path.insert(0, SCRAPERS_PATH)

def setup_database():
    """Setup database connection"""
    try:
        from app.supabase_db import get_supabase_db
        return get_supabase_db()
    except ImportError as e:
        print(f"❌ Failed to import database tools: {e}")
        sys.exit(1)

def is_pdf_link(url: str, link_text: str = "") -> bool:
    """Check if a URL points to a PDF"""
    url_lower = url.lower()
    text_lower = link_text.lower()
    
    # Check URL extension
    if url_lower.endswith('.pdf'):
        return True
    
    # Check for PDF in URL path
    if '/pdf/' in url_lower or 'pdf' in url_lower:
        return True
    
    # Check link text for PDF indicators
    pdf_indicators = ['pdf', 'adobe', 'acrobat']
    if any(indicator in text_lower for indicator in pdf_indicators):
        return True
    
    return False

def extract_pdf_links(url: str, max_pages: int = 3) -> List[Dict]:
    """Extract PDF links from a website"""
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
                        'found_on_page': current_url
                    }
                    
                    # Avoid duplicates
                    if not any(p['url'] == full_url for p in pdf_links):
                        pdf_links.append(pdf_info)
                        print(f"    📎 Found PDF: {pdf_info['title'][:50]}...")
                
                # Add more pages to visit (stay within same domain)
                elif len(urls_to_visit) < 10:  # Limit pages to explore
                    parsed_current = urlparse(current_url)
                    parsed_link = urlparse(full_url)
                    
                    # Only follow links on same domain
                    if (parsed_link.netloc == parsed_current.netloc and 
                        full_url not in visited_urls and 
                        full_url not in urls_to_visit):
                        
                        # Look for bylaw-related pages
                        bylaw_keywords = ['bylaw', 'regulation', 'ordinance', 'policy', 'law']
                        if any(keyword in full_url.lower() or keyword in link_text.lower() 
                               for keyword in bylaw_keywords):
                            urls_to_visit.append(full_url)
            
            # Small delay between pages
            time.sleep(1)
            
        except Exception as e:
            print(f"    ❌ Error scanning {current_url}: {e}")
            continue
    
    return pdf_links

def process_municipality(sdb, municipality: Dict) -> Dict:
    """Process a single municipality"""
    municipality_id = municipality['id']
    municipality_name = municipality['name']
    website_url = municipality['website_url']
    
    print(f"\n🏛️  {municipality_name}")
    print(f"🌐 {website_url}")
    
    start_time = time.time()
    
    try:
        # Extract PDF links
        pdf_links = extract_pdf_links(website_url, max_pages=5)
        
        if not pdf_links:
            print(f"  ⚠️  No PDF links found")
            return {
                'success': True,
                'documents_found': 0,
                'documents_new': 0,
                'municipality': municipality_name
            }
        
        print(f"  📊 Found {len(pdf_links)} PDF links")
        
        # Store in database
        new_documents = 0
        for pdf_data in pdf_links:
            try:
                # Check if document already exists
                existing = sdb.get_pdf_document_by_url(municipality_id, pdf_data['url'])
                
                if not existing:
                    # Add new document
                    doc_data = {
                        'municipality_id': municipality_id,
                        'title': pdf_data['title'][:500],  # Limit title length
                        'url': pdf_data['url'],
                        'filename': pdf_data['filename'],
                        'date_found': datetime.utcnow().isoformat(),
                        'is_adu_relevant': False,  # Will be determined later by analysis
                        'download_status': 'pending'
                    }
                    
                    result = sdb.add_pdf_document(doc_data)
                    if result:
                        new_documents += 1
                        print(f"    ✅ Added: {pdf_data['title'][:40]}...")
                    else:
                        print(f"    ❌ Failed to add: {pdf_data['title'][:40]}...")
                else:
                    # Update last_checked
                    sdb.update_pdf_document(existing['id'], {
                        'last_checked': datetime.utcnow().isoformat()
                    })
                    print(f"    ♻️  Updated: {pdf_data['title'][:40]}...")
            
            except Exception as e:
                print(f"    ❌ Error storing document: {e}")
                continue
        
        elapsed = time.time() - start_time
        print(f"  ✅ Complete! {new_documents} new documents in {elapsed:.1f}s")
        
        return {
            'success': True,
            'documents_found': len(pdf_links),
            'documents_new': new_documents,
            'municipality': municipality_name
        }
        
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"  ❌ Failed: {e} (took {elapsed:.1f}s)")
        return {
            'success': False,
            'error': str(e),
            'municipality': municipality_name
        }

def run_simple_extraction(target_municipalities: Optional[List[str]] = None, max_municipalities: Optional[int] = None):
    """Run the simple PDF extraction"""
    print("🚀 Simple PDF Link Extraction")
    print("=" * 50)
    
    # Setup database
    sdb = setup_database()
    print("✅ Connected to database")
    
    # Get municipalities from the supabase-bylaws database
    try:
        # Try using the supabase-bylaws connection
        from supabase import create_client, Client
        
        # You'll need to set these environment variables or update them here
        SUPABASE_URL = os.getenv("SUPABASE_URL", "")
        SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")
        
        if not SUPABASE_URL or not SUPABASE_KEY:
            print("❌ Supabase credentials not found. Using scraper database...")
            municipalities = sdb.get_municipalities()
        else:
            # Connect to the main supabase-bylaws database
            client = create_client(SUPABASE_URL, SUPABASE_KEY)
            result = client.table('municipalities').select('*').execute()
            municipalities = result.data
            print(f"✅ Connected to main supabase-bylaws database")
    
    except Exception as e:
        print(f"⚠️  Using scraper database: {e}")
        municipalities = sdb.get_municipalities()
    
    print(f"📊 Found {len(municipalities)} municipalities")
    
    # Filter municipalities
    if target_municipalities:
        municipalities = [
            m for m in municipalities 
            if m['name'].lower() in [name.lower() for name in target_municipalities]
        ]
        print(f"🎯 Filtered to {len(municipalities)} target municipalities")
    
    if max_municipalities and len(municipalities) > max_municipalities:
        municipalities = municipalities[:max_municipalities]
        print(f"📊 Limited to first {max_municipalities} municipalities")
    
    # Track results
    results = {
        'successful': 0,
        'failed': 0,
        'total_documents': 0,
        'total_new_documents': 0,
        'errors': []
    }
    
    # Process each municipality
    for i, municipality in enumerate(municipalities, 1):
        print(f"\n[{i}/{len(municipalities)}]", end=" ")
        
        result = process_municipality(sdb, municipality)
        
        # Update results
        if result.get('success'):
            results['successful'] += 1
            results['total_documents'] += result.get('documents_found', 0)
            results['total_new_documents'] += result.get('documents_new', 0)
        else:
            results['failed'] += 1
            results['errors'].append({
                'municipality': result.get('municipality'),
                'error': result.get('error')
            })
        
        # Delay between municipalities
        if i < len(municipalities):
            time.sleep(2)
    
    # Print summary
    print(f"\n{'='*50}")
    print("📊 EXTRACTION SUMMARY")
    print(f"{'='*50}")
    print(f"✅ Successful: {results['successful']}")
    print(f"❌ Failed: {results['failed']}")
    print(f"📄 Total PDFs Found: {results['total_documents']}")
    print(f"🆕 New PDFs Added: {results['total_new_documents']}")
    
    if results['errors']:
        print(f"\n❌ Errors:")
        for error in results['errors'][:5]:  # Show first 5 errors
            print(f"  - {error['municipality']}: {error['error']}")
    
    success_rate = results['successful'] / (results['successful'] + results['failed']) * 100
    print(f"\n📈 Success Rate: {success_rate:.1f}%")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Simple PDF link extraction from municipality websites")
    parser.add_argument("--municipalities", "-m", nargs="+", 
                       help="Specific municipalities to process")
    parser.add_argument("--limit", "-l", type=int,
                       help="Maximum number of municipalities to process")
    parser.add_argument("--test", action="store_true",
                       help="Test mode (limit to 2 municipalities)")
    
    args = parser.parse_args()
    
    if args.test:
        args.limit = 2
        print("🧪 Running in TEST MODE")
    
    try:
        run_simple_extraction(
            target_municipalities=args.municipalities,
            max_municipalities=args.limit
        )
    except KeyboardInterrupt:
        print("\n⏹️  Extraction stopped")
    except Exception as e:
        print(f"\n💥 Error: {e}")
        raise