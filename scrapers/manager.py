from typing import Dict, List, Optional, Type
from datetime import datetime
import importlib
import os
import sys
import re
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from app.supabase_db import get_supabase_db
except ImportError:
    # Fallback for standalone operation
    def get_supabase_db():
        return None

from base import BaseScraper

class ScraperManager:
    """Manages scraper execution and database integration"""
    
    def __init__(self):
        self.scrapers = {}
        self.db = get_supabase_db()
        self.register_scrapers()
    
    def register_scrapers(self):
        """Register all available scrapers from Python files"""
        # Clear existing scrapers
        self.scrapers = {}
        
        # Auto-discover scrapers from Python files
        scrapers_dir = os.path.dirname(os.path.abspath(__file__))
        
        for filename in os.listdir(scrapers_dir):
            if filename.endswith('.py') and not filename.startswith('__') and filename != 'base.py' and filename != 'template.py' and filename != 'manager.py':
                module_name = filename[:-3]  # Remove .py extension
                
                try:
                    # Import the module
                    module = importlib.import_module(f'scrapers.{module_name}')
                    
                    # Find the scraper class
                    for attr_name in dir(module):
                        attr = getattr(module, attr_name)
                        if (isinstance(attr, type) and 
                            issubclass(attr, BaseScraper) and 
                            attr != BaseScraper):
                            
                            self.scrapers[module_name] = attr
                            print(f"✓ Loaded scraper: {module_name}")
                            break
                    else:
                        print(f"⚠️ No scraper class found in {filename}")
                        
                except Exception as e:
                    print(f"✗ Failed to load scraper {module_name}: {e}")
        
        print(f"📊 Total scrapers loaded: {len(self.scrapers)}")
    
    
    def get_available_scrapers(self) -> List[str]:
        """Get list of available scraper names"""
        return list(self.scrapers.keys())
    
    def create_scraper(self, scraper_name: str, municipality_id: int, progress_callback=None) -> Optional[BaseScraper]:
        """Create a scraper instance"""
        if scraper_name not in self.scrapers:
            return None
        
        scraper_class = self.scrapers[scraper_name]
        scraper = scraper_class(municipality_id)
        if hasattr(scraper, 'progress_callback'):
            scraper.progress_callback = progress_callback
        return scraper
    
    def run_scraper(self, municipality_id: int, scraper_name: str, progress_callback=None) -> Dict:
        """Run a scraper for a municipality and store results"""
        municipality = self.db.get_municipality(municipality_id)
        if not municipality:
            return {'error': 'Municipality not found'}
        
        scraper = self.create_scraper(scraper_name, municipality_id, progress_callback)
        if not scraper:
            return {'error': f'Scraper {scraper_name} not found'}
        
        # Update municipality status
        self.db.update_municipality(municipality_id, {
            'status': 'running',
            'scraper_name': scraper_name
        })
        
        # Report initial progress
        if progress_callback:
            progress_callback(45, f"Starting {scraper_name} scraper...")
        
        try:
            # Run the scraper
            summary = scraper.run_scrape()
            
            # Report document processing progress
            if progress_callback:
                progress_callback(50, f"Processing {len(scraper.documents_found)} documents...")
            
            # Store documents in database
            new_documents = 0
            total_docs = len(scraper.documents_found)
            
            if progress_callback and total_docs > 0:
                progress_callback(60, f"Storing {total_docs} documents in database...")
            
            for idx, doc_data in enumerate(scraper.documents_found):
                existing = self.db.get_pdf_document_by_url(
                    municipality_id,
                    doc_data['url']
                )
                
                if not existing:
                    # Check if document is ADU relevant
                    is_adu_relevant = self.check_adu_relevance(municipality_id, doc_data['title'])
                    
                    pdf_doc_data = {
                        'municipality_id': municipality_id,
                        'title': doc_data['title'],
                        'url': doc_data['url'],
                        'filename': doc_data['filename'],
                        'is_adu_relevant': is_adu_relevant,
                        'date_found': datetime.utcnow().isoformat()
                    }
                    self.db.add_pdf_document(pdf_doc_data)
                    new_documents += 1
                    
                    # Report progress for every 10 documents or at the end
                    if progress_callback and (idx + 1) % 10 == 0 or (idx + 1) == total_docs:
                        progress = 60 + int((idx + 1) / total_docs * 20)  # 60-80% range
                        progress_callback(progress, f"Saved {idx + 1}/{total_docs} documents...")
                else:
                    # Update last_checked timestamp
                    self.db.update_pdf_document(existing['id'], {})
            
            # Create scrape log
            scrape_log_data = {
                'municipality_id': municipality_id,
                'status': 'success' if not summary['errors'] else 'partial',
                'documents_found': summary['documents_found'],
                'documents_new': new_documents,
                'error_message': '; '.join(summary['errors']) if summary['errors'] else None,
                'scrape_date': datetime.utcnow().isoformat()
            }
            self.db.add_scrape_log(scrape_log_data)
            
            # Update municipality status
            self.db.update_municipality(municipality_id, {
                'status': 'active',
                'updated_at': datetime.utcnow().isoformat()
            })
            
            if progress_callback:
                progress_callback(85, f"Creating scrape log...")
            
            # Queue documents for content extraction (new documents or those without content)
            extraction_queue_info = None
            extraction_results = None
            documents_to_queue = []
            
            try:
                from app.extraction_queue import get_extraction_queue
                queue = get_extraction_queue()
                
                # Check all documents found in this scrape
                for doc_data in scraper.documents_found:
                    existing = self.db.get_pdf_document_by_url(
                        municipality_id,
                        doc_data['url']
                    )
                    if existing:
                        # Queue if content_text is not present or empty
                        if not existing.get('content_text'):
                            documents_to_queue.append(existing['id'])
                            print(f"📋 Document '{existing['title']}' needs content extraction")
                
                if documents_to_queue:
                    print(f"📄 Queueing {len(documents_to_queue)} documents for content extraction...")
                    if progress_callback:
                        progress_callback(90, f"Queueing {len(documents_to_queue)} documents for extraction...")
                    
                    # Add documents to extraction queue
                    added_count = queue.add_batch(documents_to_queue, priority=1)
                    extraction_queue_info = {
                        'queued': added_count,
                        'document_ids': documents_to_queue,
                        'queue_status': queue.get_status()
                    }
                    print(f"✅ Added {added_count} documents to extraction queue")
                        
                    
                    # Optionally process some immediately
                    if added_count > 0:
                        from app.extraction_queue import process_extraction_queue
                        print(f"🔄 Processing extraction queue...")
                        extraction_results = process_extraction_queue(
                            max_items=min(5, added_count),  # Process up to 5 immediately
                            progress_callback=lambda p: progress_callback(
                                90 + int(p.get('current', 0) / min(5, added_count) * 5),
                                f"Extracting document {p.get('current')}/{min(5, added_count)}..."
                            ) if progress_callback else None
                        )
                        print(f"✅ Immediate extraction: {extraction_results.get('successful', 0)} successful, {extraction_results.get('failed', 0)} failed")
                else:
                    print(f"ℹ️ All documents already have content extracted")
                
                if progress_callback:
                    progress_callback(95, f"Extraction queue updated!")
                    
            except Exception as extraction_error:
                print(f"⚠️ Extraction queue error: {extraction_error}")
                # Don't fail the entire scraper run if extraction fails
            
            # Auto-analyze content relevance after extraction
            analysis_results = None
            if documents_to_queue or new_documents > 0:
                try:
                    from app import content_analyzer
                    print(f"🧠 Analyzing content relevance...")
                    if progress_callback:
                        progress_callback(96, f"Analyzing document relevance...")
                    
                    # Only analyze documents that were successfully extracted
                    analysis_results = content_analyzer.analyze_municipality_documents(
                        municipality_id, force_reanalyze=False
                    )
                    print(f"✅ Relevance analysis complete: {analysis_results.get('relevant', 0)} relevant documents found")
                    
                    if progress_callback:
                        progress_callback(97, f"Analysis complete!")
                except Exception as analysis_error:
                    print(f"⚠️ Relevance analysis failed: {analysis_error}")
                    # Don't fail the entire scraper run if analysis fails
            
            if progress_callback:
                progress_callback(98, "Finalizing results...")
            
            return {
                'success': True,
                'documents_found': summary['documents_found'],
                'documents_new': new_documents,
                'documents_queued_for_extraction': len(documents_to_queue),
                'errors': summary['errors'],
                'extraction_queue': extraction_queue_info,
                'content_extraction': extraction_results,
                'content_analysis': analysis_results
            }
            
        except Exception as e:
            # Handle errors
            scrape_log_data = {
                'municipality_id': municipality_id,
                'status': 'error',
                'documents_found': 0,
                'documents_new': 0,
                'error_message': str(e),
                'scrape_date': datetime.utcnow().isoformat()
            }
            self.db.add_scrape_log(scrape_log_data)
            
            self.db.update_municipality(municipality_id, {
                'status': 'error'
            })
            
            return {'error': str(e)}
    
    def check_adu_relevance(self, municipality_id: int, title: str) -> bool:
        """Check if a document is ADU relevant based on keywords"""
        keywords = self.db.get_filter_keywords(municipality_id)
        
        if not keywords:
            return False
        
        title_lower = title.lower()
        for keyword in keywords:
            if keyword['keyword'].lower() in title_lower:
                return True
        
        return False
    
    def run_all_scrapers(self) -> Dict:
        """Run scrapers for all municipalities that have them configured"""
        municipalities = self.db.get_municipalities()
        
        # Filter municipalities that have scrapers configured
        municipalities_with_scrapers = [
            m for m in municipalities 
            if m.get('scraper_name') is not None
        ]
        
        results = {}
        for municipality in municipalities_with_scrapers:
            print(f"Running scraper for {municipality['name']}...")
            result = self.run_scraper(municipality['id'], municipality['scraper_name'])
            results[municipality['name']] = result
        
        return results
    
    def get_scrape_status(self, municipality_id: int) -> Dict:
        """Get scraping status for a municipality"""
        municipality = self.db.get_municipality(municipality_id)
        if not municipality:
            return {'error': 'Municipality not found'}
        
        latest_log = self.db.get_latest_scrape_log(municipality_id)
        
        document_count = self.db.count_municipality_documents(municipality_id)
        
        adu_count = self.db.count_municipality_documents(municipality_id, is_adu_relevant=True)
        
        return {
            'municipality_name': municipality['name'],
            'scraper_name': municipality.get('scraper_name'),
            'status': municipality.get('status'),
            'total_documents': document_count,
            'adu_documents': adu_count,
            'last_scrape': latest_log['scrape_date'] if latest_log else None,
            'last_result': latest_log['status'] if latest_log else None
        }
    
    def test_scraper(self, scraper_name: str, test_municipality_id: int) -> Dict:
        """Test a scraper without saving results"""
        try:
            scraper = self.create_scraper(scraper_name, test_municipality_id)
            if not scraper:
                return {'error': f'Scraper {scraper_name} not found'}
            
            # Run a limited test (just first page)
            response = scraper.fetch_page(scraper.search_url)
            if not response:
                return {'error': 'Failed to fetch test page'}
            
            # Try to find PDFs
            pdfs = scraper.find_pdf_links(response.content)
            
            return {
                'success': True,
                'documents_found': len(pdfs),
                'sample_documents': pdfs[:5],  # First 5 documents
                'message': f'Test successful: Found {len(pdfs)} documents'
            }
            
        except Exception as e:
            return {'error': f'Test failed: {str(e)}'}


def progress_reporter(progress: int, message: str, job_id: str = None):
    """Progress reporter for CLI output"""
    if job_id:
        print(f"SCRAPER_OUTPUT:{{'type': 'progress', 'progress': {progress}, 'message': '{message}', 'jobId': '{job_id}'}}")
    else:
        print(f"PROGRESS:{progress}:{message}")


def main():
    """CLI interface for scraper manager"""
    import argparse
    import json
    import sys
    
    parser = argparse.ArgumentParser(description='Scraper Manager CLI')
    parser.add_argument('--action', required=True, choices=['run', 'test', 'list', 'status'], 
                       help='Action to perform')
    parser.add_argument('--municipality-id', type=int, help='Municipality ID')
    parser.add_argument('--scraper-name', help='Scraper name')
    parser.add_argument('--job-id', help='Job ID for progress tracking')
    parser.add_argument('--test-mode', action='store_true', help='Run in test mode')
    
    args = parser.parse_args()
    
    try:
        manager = ScraperManager()
        
        if args.action == 'list':
            # List available scrapers
            scrapers = manager.get_available_scrapers()
            result = {
                'scrapers': [
                    {
                        'name': scraper,
                        'description': f'Scraper for {scraper}',
                        'version': '1.0.0',
                        'supported_municipalities': [],
                        'status': 'available'
                    }
                    for scraper in scrapers
                ],
                'python_version': sys.version
            }
            print(f"RESULT:{json.dumps(result)}")
            
        elif args.action == 'status':
            # System status
            result = {
                'status': 'healthy',
                'python_version': sys.version,
                'scrapers_loaded': len(manager.scrapers),
                'database_connected': manager.db is not None
            }
            print(f"RESULT:{json.dumps(result)}")
            
        elif args.action == 'test':
            # Test scraper
            if not args.municipality_id or not args.scraper_name:
                raise ValueError('--municipality-id and --scraper-name required for test action')
            
            progress_callback = lambda p, m: progress_reporter(p, m, args.job_id)
            progress_callback(10, "Starting scraper test...")
            
            result = manager.test_scraper(args.scraper_name, args.municipality_id)
            
            progress_callback(100, "Test completed")
            print(f"RESULT:{json.dumps(result)}")
            
        elif args.action == 'run':
            # Run scraper
            if not args.municipality_id or not args.scraper_name:
                raise ValueError('--municipality-id and --scraper-name required for run action')
            
            progress_callback = lambda p, m: progress_reporter(p, m, args.job_id)
            progress_callback(5, "Initializing scraper...")
            
            result = manager.run_scraper(
                args.municipality_id, 
                args.scraper_name,
                progress_callback
            )
            
            if result.get('success'):
                progress_callback(100, "Scraper completed successfully")
            else:
                progress_callback(0, f"Scraper failed: {result.get('error', 'Unknown error')}")
            
            print(f"RESULT:{json.dumps(result)}")
        
        else:
            raise ValueError(f'Unknown action: {args.action}')
    
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e)
        }
        print(f"RESULT:{json.dumps(error_result)}")
        sys.exit(1)


if __name__ == '__main__':
    main()