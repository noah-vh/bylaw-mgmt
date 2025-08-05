#!/usr/bin/env python3
"""
PDF Link Extraction Script for Municipality Bylaws

This script uses the scraper tools from the bylaw_scrapers repository
to extract PDF links from all municipalities in the Supabase database.
"""

import sys
import os
import time
from datetime import datetime
from typing import Dict, List, Optional

# Add the bylaw_scrapers directory to the Python path
SCRAPERS_PATH = "/Users/noahvanhart/Documents/GitHub/bylaw_scrapers"
sys.path.insert(0, SCRAPERS_PATH)

def setup_imports():
    """Setup necessary imports from the scrapers repository"""
    try:
        from scrapers.manager import ScraperManager
        from app.supabase_db import get_supabase_db
        return ScraperManager, get_supabase_db
    except ImportError as e:
        print(f"❌ Failed to import scraper tools: {e}")
        print(f"Make sure the bylaw_scrapers repository is available at: {SCRAPERS_PATH}")
        sys.exit(1)

def get_municipalities_with_scrapers(sdb) -> List[Dict]:
    """Get all municipalities that have active scrapers assigned"""
    try:
        municipalities = sdb.get_municipalities()
        print(f"📊 Found {len(municipalities)} total municipalities")
        
        # Filter municipalities with active scrapers
        with_scrapers = []
        without_scrapers = []
        
        for municipality in municipalities:
            active_scraper = municipality.get('active_scraper')
            assigned_scrapers = municipality.get('assigned_scrapers', [])
            
            if active_scraper and active_scraper.strip():
                with_scrapers.append(municipality)
            elif assigned_scrapers:
                # Use first assigned scraper if no active one
                municipality['active_scraper'] = assigned_scrapers[0]
                with_scrapers.append(municipality)
            else:
                without_scrapers.append(municipality)
        
        print(f"✅ {len(with_scrapers)} municipalities have scrapers")
        print(f"⚠️  {len(without_scrapers)} municipalities need scrapers")
        
        if without_scrapers:
            print("\nMunicipalities without scrapers:")
            for muni in without_scrapers[:5]:  # Show first 5
                print(f"  - {muni['name']}: {muni['website_url']}")
            if len(without_scrapers) > 5:
                print(f"  ... and {len(without_scrapers) - 5} more")
        
        return with_scrapers
        
    except Exception as e:
        print(f"❌ Error fetching municipalities: {e}")
        return []

def extract_pdfs_for_municipality(manager: 'ScraperManager', municipality: Dict, progress_callback=None) -> Dict:
    """Extract PDF links for a single municipality"""
    municipality_id = municipality['id']
    municipality_name = municipality['name']
    scraper_name = municipality.get('active_scraper')
    
    print(f"\n🏛️  Processing: {municipality_name}")
    print(f"📍 Website: {municipality['website_url']}")
    print(f"🔧 Scraper: {scraper_name}")
    
    if not scraper_name:
        return {
            'success': False,
            'error': 'No scraper assigned',
            'municipality': municipality_name
        }
    
    start_time = time.time()
    
    try:
        # Run the scraper
        result = manager.run_scraper(
            municipality_id=municipality_id,
            scraper_name=scraper_name,
            progress_callback=progress_callback
        )
        
        elapsed = time.time() - start_time
        
        if result.get('success'):
            print(f"✅ Success! Found {result.get('documents_found', 0)} documents")
            print(f"📄 New documents: {result.get('documents_new', 0)}")
            print(f"⏱️  Time: {elapsed:.2f}s")
            
            if result.get('errors'):
                print(f"⚠️  Warnings: {len(result['errors'])} issues")
                for error in result['errors'][:3]:  # Show first 3 errors
                    print(f"   - {error}")
        else:
            print(f"❌ Failed: {result.get('error', 'Unknown error')}")
            print(f"⏱️  Time: {elapsed:.2f}s")
        
        return result
        
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ Exception: {str(e)}")
        print(f"⏱️  Time: {elapsed:.2f}s")
        
        return {
            'success': False,
            'error': str(e),
            'municipality': municipality_name
        }

def run_pdf_extraction(target_municipalities: Optional[List[str]] = None, max_municipalities: Optional[int] = None):
    """Main function to run PDF extraction for all municipalities"""
    print("🚀 Starting PDF Link Extraction for Municipality Bylaws")
    print("=" * 60)
    
    # Setup imports
    ScraperManager, get_supabase_db = setup_imports()
    
    # Initialize database connection
    try:
        sdb = get_supabase_db()
        print("✅ Connected to Supabase database")
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        return
    
    # Initialize scraper manager
    try:
        manager = ScraperManager()
        available_scrapers = manager.get_available_scrapers()
        print(f"✅ Scraper manager initialized with {len(available_scrapers)} scrapers")
        print(f"📋 Available scrapers: {', '.join(available_scrapers)}")
    except Exception as e:
        print(f"❌ Failed to initialize scraper manager: {e}")
        return
    
    # Get municipalities to process
    municipalities = get_municipalities_with_scrapers(sdb)
    
    if not municipalities:
        print("❌ No municipalities with scrapers found")
        return
    
    # Filter by target municipalities if specified
    if target_municipalities:
        municipalities = [
            m for m in municipalities 
            if m['name'].lower() in [name.lower() for name in target_municipalities]
        ]
        print(f"🎯 Filtered to {len(municipalities)} target municipalities")
    
    # Limit number of municipalities if specified
    if max_municipalities and len(municipalities) > max_municipalities:
        municipalities = municipalities[:max_municipalities]
        print(f"📊 Limited to first {max_municipalities} municipalities")
    
    print(f"\n🏃‍♂️ Processing {len(municipalities)} municipalities...")
    print("=" * 60)
    
    # Track results
    results = {
        'successful': 0,
        'failed': 0,
        'total_documents': 0,
        'total_new_documents': 0,
        'errors': [],
        'municipality_results': []
    }
    
    # Process each municipality
    for i, municipality in enumerate(municipalities, 1):
        municipality_name = municipality['name']
        
        def progress_callback(progress, message):
            print(f"  [{progress:3d}%] {message}")
        
        print(f"\n[{i}/{len(municipalities)}] {municipality_name}")
        print("-" * 40)
        
        result = extract_pdfs_for_municipality(manager, municipality, progress_callback)
        
        # Update overall results
        if result.get('success'):
            results['successful'] += 1
            results['total_documents'] += result.get('documents_found', 0)
            results['total_new_documents'] += result.get('documents_new', 0)
        else:
            results['failed'] += 1
            results['errors'].append({
                'municipality': municipality_name,
                'error': result.get('error', 'Unknown error')
            })
        
        results['municipality_results'].append({
            'municipality': municipality_name,
            'success': result.get('success', False),
            'documents_found': result.get('documents_found', 0),
            'documents_new': result.get('documents_new', 0),
            'error': result.get('error')
        })
        
        # Add delay between municipalities to be respectful
        if i < len(municipalities):
            print("⏳ Waiting 2 seconds before next municipality...")
            time.sleep(2)
    
    # Print final results
    print("\n" + "=" * 60)
    print("📊 EXTRACTION COMPLETE - SUMMARY")
    print("=" * 60)
    print(f"✅ Successful: {results['successful']}")
    print(f"❌ Failed: {results['failed']}")
    print(f"📄 Total Documents Found: {results['total_documents']}")
    print(f"🆕 New Documents: {results['total_new_documents']}")
    
    if results['errors']:
        print(f"\n❌ Errors ({len(results['errors'])}):")
        for error in results['errors']:
            print(f"  - {error['municipality']}: {error['error']}")
    
    print(f"\n📈 Success Rate: {results['successful']/(results['successful']+results['failed'])*100:.1f}%")
    
    # Show top performers
    top_performers = sorted(
        [r for r in results['municipality_results'] if r['success']],
        key=lambda x: x['documents_found'],
        reverse=True
    )[:5]
    
    if top_performers:
        print(f"\n🏆 Top Document Finders:")
        for i, performer in enumerate(top_performers, 1):
            print(f"  {i}. {performer['municipality']}: {performer['documents_found']} docs ({performer['documents_new']} new)")
    
    print(f"\n✨ Extraction completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Extract PDF links from municipality bylaw pages")
    parser.add_argument("--municipalities", "-m", nargs="+", 
                       help="Specific municipalities to process (by name)")
    parser.add_argument("--limit", "-l", type=int,
                       help="Maximum number of municipalities to process")
    parser.add_argument("--test", action="store_true",
                       help="Run in test mode (limit to 3 municipalities)")
    
    args = parser.parse_args()
    
    # Set defaults for test mode
    if args.test:
        args.limit = 3
        print("🧪 Running in TEST MODE - limited to 3 municipalities")
    
    try:
        run_pdf_extraction(
            target_municipalities=args.municipalities,
            max_municipalities=args.limit
        )
    except KeyboardInterrupt:
        print("\n⏹️  Extraction stopped by user")
    except Exception as e:
        print(f"\n💥 Unexpected error: {e}")
        raise