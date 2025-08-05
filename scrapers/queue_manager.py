#!/usr/bin/env python3
"""
Queue Manager - Entry point for running scrapers from Node.js queue
This script is called by the PythonScraperRunner in the queue system
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

# Force unbuffered output
sys.stdout = sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else sys.stdout

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent))

from scrapers.manager import ScraperManager

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class QueueScraperRunner:
    """Manages scraper execution for queue jobs"""
    
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.manager = ScraperManager()
        self.progress_reported = False
        
    def report_progress(self, progress: int, message: str):
        """Report progress in a format the Node.js queue can parse"""
        print(f"PROGRESS:{progress}:{message}", flush=True)
        sys.stdout.flush()  # Force flush to ensure real-time updates
        self.progress_reported = True
        
    def report_result(self, result: Dict[str, Any]):
        """Report final result in JSON format"""
        print(f"RESULT:{json.dumps(result)}", flush=True)
        
    def report_error(self, error: str, details: Optional[str] = None):
        """Report error to stderr"""
        error_data = {
            'error': error,
            'details': details,
            'timestamp': datetime.utcnow().isoformat()
        }
        print(json.dumps(error_data), file=sys.stderr, flush=True)
        
    def run_scraper(
        self,
        municipality_id: int,
        scraper_name: str,
        test_mode: bool = False
    ) -> Dict[str, Any]:
        """Run a scraper and return results"""
        try:
            self.report_progress(10, "Initializing scraper manager...")
            
            # Check if scraper exists
            if scraper_name not in self.manager.scrapers:
                raise ValueError(f"Scraper '{scraper_name}' not found. Available scrapers: {', '.join(self.manager.get_available_scrapers())}")
            
            self.report_progress(20, f"Loading {scraper_name} scraper...")
            
            if test_mode:
                self.report_progress(30, "Running scraper in test mode...")
                self.report_progress(40, "Connecting to test URL...")
                
                # Run test mode
                result = self.manager.test_scraper(scraper_name, municipality_id)
                
                if result.get('success'):
                    self.report_progress(90, "Test completed successfully")
                    final_result = {
                        'success': True,
                        'municipality_id': municipality_id,
                        'scraper_name': scraper_name,
                        'documents_found': result.get('documents_found', 0),
                        'documents_new': 0,  # No documents saved in test mode
                        'test_mode': True,
                        'test_result': result.get('message', 'Test completed'),
                        'sample_documents': result.get('sample_documents', []),
                        'timestamp': datetime.utcnow().isoformat()
                    }
                else:
                    raise Exception(result.get('error', 'Test failed'))
                    
            else:
                self.report_progress(30, "Starting scraper execution...")
                self.report_progress(35, f"Connecting to {scraper_name} website...")
                
                # Run the scraper with progress callback
                result = self.manager.run_scraper(
                    municipality_id, 
                    scraper_name,
                    progress_callback=self.report_progress
                )
                
                if result.get('success') or 'documents_found' in result:
                    
                    final_result = {
                        'success': True,
                        'municipality_id': municipality_id,
                        'scraper_name': scraper_name,
                        'documents_found': result.get('documents_found', 0),
                        'documents_new': result.get('documents_new', 0),
                        'test_mode': False,
                        'errors': result.get('errors', []),
                        'content_analysis': result.get('content_analysis'),
                        'timestamp': datetime.utcnow().isoformat()
                    }
                else:
                    raise Exception(result.get('error', 'Scraping failed'))
            
            self.report_progress(100, "Scraping completed successfully")
            return final_result
            
        except Exception as e:
            logger.error(f"Error running scraper: {e}")
            logger.error(traceback.format_exc())
            
            return {
                'success': False,
                'error': str(e),
                'municipality_id': municipality_id,
                'scraper_name': scraper_name,
                'test_mode': test_mode,
                'timestamp': datetime.utcnow().isoformat()
            }


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='Queue Manager for Scraper Jobs')
    parser.add_argument('--job-id', required=True, help='Queue job ID')
    parser.add_argument('--municipality-id', type=int, required=True, help='Municipality ID')
    parser.add_argument('--scraper-name', required=True, help='Scraper name')
    parser.add_argument('--test-mode', action='store_true', help='Run in test mode')
    
    args = parser.parse_args()
    
    # Log startup
    print(f"Starting queue_manager.py for job {args.job_id}", flush=True)
    print(f"Municipality: {args.municipality_id}, Scraper: {args.scraper_name}, Test mode: {args.test_mode}", flush=True)
    sys.stdout.flush()
    
    runner = QueueScraperRunner(args.job_id)
    
    try:
        # Run the scraper
        result = runner.run_scraper(
            municipality_id=args.municipality_id,
            scraper_name=args.scraper_name,
            test_mode=args.test_mode
        )
        
        # Report final result
        runner.report_result(result)
        
        # Exit with appropriate code
        sys.exit(0 if result.get('success', False) else 1)
        
    except Exception as e:
        runner.report_error(str(e), traceback.format_exc())
        sys.exit(1)


if __name__ == '__main__':
    main()