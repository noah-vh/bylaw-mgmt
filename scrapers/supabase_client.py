"""
Direct Supabase integration for Python scrapers
Replaces Redis-based job queue with direct database operations
"""

import os
import json
import asyncio
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Union
from pathlib import Path
import logging
from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SupabaseClient:
    """Direct Supabase client for scraper operations"""
    
    def __init__(self):
        self.url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
        self.key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        if not self.url or not self.key:
            raise ValueError("Missing Supabase environment variables")
        
        # Create client with enhanced options
        options = ClientOptions(
            auto_refresh_token=True,
            persist_session=True
        )
        
        self.supabase: Client = create_client(self.url, self.key, options=options)
        
        # Create progress directory
        self.progress_dir = Path("tmp/job-progress")
        self.progress_dir.mkdir(parents=True, exist_ok=True)
    
    def create_scraper_job(self, 
                         municipality_id: int, 
                         scraper_name: str,
                         job_type: str = 'scraper',
                         priority: str = 'normal') -> str:
        """Create a new scraper job in the database"""
        try:
            # Generate job ID
            job_id = f"{scraper_name}_{municipality_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            # Insert background job
            result = self.supabase.table('background_jobs').insert({
                'id': job_id,
                'type': job_type,
                'status': 'queued',
                'municipality_id': municipality_id,
                'progress': 0,
                'progress_message': f'Initializing {scraper_name} scraper'
            }).execute()
            
            if result.data:
                logger.info(f"Created job {job_id} for municipality {municipality_id}")
                return job_id
            else:
                raise Exception(f"Failed to create job: {result}")
                
        except Exception as e:
            logger.error(f"Error creating scraper job: {e}")
            raise
    
    def update_job_progress(self, 
                           job_id: str, 
                           progress: int, 
                           message: str,
                           status: str = 'running') -> bool:
        """Update job progress in database"""
        try:
            update_data = {
                'progress': progress,
                'progress_message': message,
                'status': status
            }
            
            # Set start time if transitioning to running
            if status == 'running':
                update_data['started_at'] = datetime.now(timezone.utc).isoformat()
            
            # Set completion time if finished
            if status in ['completed', 'failed']:
                update_data['completed_at'] = datetime.now(timezone.utc).isoformat()
            
            result = self.supabase.table('background_jobs').update(update_data).eq('id', job_id).execute()
            
            if result.data:
                logger.info(f"Updated job {job_id}: {progress}% - {message}")
                # Also write to progress file
                self._write_progress_file(job_id, {
                    'job_id': job_id,
                    'progress': progress,
                    'message': message,
                    'status': status,
                    'last_update': datetime.now(timezone.utc).isoformat()
                })
                return True
            else:
                logger.warning(f"No data returned when updating job {job_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error updating job progress: {e}")
            return False
    
    def complete_job(self, 
                    job_id: str, 
                    success: bool, 
                    result_data: Optional[Dict] = None,
                    error_message: Optional[str] = None) -> bool:
        """Mark job as completed or failed"""
        try:
            status = 'completed' if success else 'failed'
            
            update_data = {
                'status': status,
                'progress': 100 if success else None,
                'completed_at': datetime.now(timezone.utc).isoformat(),
                'result_data': result_data,
                'error_message': error_message
            }
            
            result = self.supabase.table('background_jobs').update(update_data).eq('id', job_id).execute()
            
            if result.data:
                logger.info(f"Job {job_id} {'completed' if success else 'failed'}")
                
                # Clean up progress file
                progress_file = self.progress_dir / f"{job_id}.json"
                if progress_file.exists():
                    progress_file.unlink()
                
                return True
            else:
                logger.warning(f"No data returned when completing job {job_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error completing job: {e}")
            return False
    
    def save_document(self, 
                     municipality_id: int, 
                     title: str, 
                     url: str, 
                     filename: str,
                     **kwargs) -> Optional[int]:
        """Save document to database"""
        try:
            # Check if document already exists
            existing = self.supabase.table('pdf_documents').select('id').eq('url', url).execute()
            
            if existing.data:
                logger.info(f"Document already exists: {url}")
                return existing.data[0]['id']
            
            # Prepare document data
            doc_data = {
                'municipality_id': municipality_id,
                'title': title,
                'url': url,
                'filename': filename,
                'date_found': datetime.now(timezone.utc).isoformat(),
                'last_checked': datetime.now(timezone.utc).isoformat(),
                'download_status': 'pending',
                'is_adu_relevant': False,  # Will be analyzed later
                'content_analyzed': False
            }
            
            # Add optional fields
            for key, value in kwargs.items():
                if key in ['file_size', 'content_hash', 'storage_path']:
                    doc_data[key] = value
            
            result = self.supabase.table('pdf_documents').insert(doc_data).execute()
            
            if result.data:
                doc_id = result.data[0]['id']
                logger.info(f"Saved document {doc_id}: {title}")
                return doc_id
            else:
                logger.error(f"Failed to save document: {result}")
                return None
                
        except Exception as e:
            logger.error(f"Error saving document: {e}")
            return None
    
    def log_scrape_result(self, 
                         municipality_id: int, 
                         status: str, 
                         documents_found: int,
                         documents_new: int,
                         job_id: Optional[str] = None,
                         error_message: Optional[str] = None,
                         duration_seconds: Optional[float] = None) -> bool:
        """Log scraping results"""
        try:
            log_data = {
                'municipality_id': municipality_id,
                'scrape_date': datetime.now(timezone.utc).isoformat(),
                'status': status,
                'documents_found': documents_found,
                'documents_new': documents_new,
                'job_id': job_id,
                'error_message': error_message,
                'duration_seconds': duration_seconds
            }
            
            result = self.supabase.table('scrape_logs').insert(log_data).execute()
            
            if result.data:
                logger.info(f"Logged scrape result for municipality {municipality_id}")
                return True
            else:
                logger.error(f"Failed to log scrape result: {result}")
                return False
                
        except Exception as e:
            logger.error(f"Error logging scrape result: {e}")
            return False
    
    def get_municipality_info(self, municipality_id: int) -> Optional[Dict]:
        """Get municipality information"""
        try:
            result = self.supabase.table('municipalities').select('*').eq('id', municipality_id).execute()
            
            if result.data:
                return result.data[0]
            else:
                logger.warning(f"Municipality {municipality_id} not found")
                return None
                
        except Exception as e:
            logger.error(f"Error getting municipality info: {e}")
            return None
    
    def update_municipality_status(self, 
                                  municipality_id: int, 
                                  status: str,
                                  last_run: Optional[str] = None) -> bool:
        """Update municipality status"""
        try:
            update_data = {
                'status': status,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
            
            if last_run:
                update_data['last_run'] = last_run
            
            result = self.supabase.table('municipalities').update(update_data).eq('id', municipality_id).execute()
            
            if result.data:
                logger.info(f"Updated municipality {municipality_id} status to {status}")
                return True
            else:
                logger.warning(f"No data returned when updating municipality {municipality_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error updating municipality status: {e}")
            return False
    
    def get_scraper_config(self, scraper_name: str) -> Optional[Dict]:
        """Get scraper configuration from database"""
        try:
            result = self.supabase.table('scrapers').select('*').eq('name', scraper_name).execute()
            
            if result.data:
                return result.data[0]
            else:
                logger.warning(f"Scraper {scraper_name} not found in database")
                return None
                
        except Exception as e:
            logger.error(f"Error getting scraper config: {e}")
            return None
    
    def update_scraper_stats(self, 
                           scraper_name: str,
                           success_rate: Optional[float] = None,
                           last_tested: Optional[str] = None,
                           test_notes: Optional[str] = None) -> bool:
        """Update scraper statistics"""
        try:
            update_data = {
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
            
            if success_rate is not None:
                update_data['success_rate'] = success_rate
            if last_tested:
                update_data['last_tested'] = last_tested
            if test_notes:
                update_data['test_notes'] = test_notes
            
            result = self.supabase.table('scrapers').update(update_data).eq('name', scraper_name).execute()
            
            if result.data:
                logger.info(f"Updated scraper {scraper_name} statistics")
                return True
            else:
                logger.warning(f"No data returned when updating scraper {scraper_name}")
                return False
                
        except Exception as e:
            logger.error(f"Error updating scraper stats: {e}")
            return False
    
    def _write_progress_file(self, job_id: str, progress_data: Dict) -> None:
        """Write progress data to file for real-time monitoring"""
        try:
            progress_file = self.progress_dir / f"{job_id}.json"
            with open(progress_file, 'w') as f:
                json.dump(progress_data, f, indent=2)
        except Exception as e:
            logger.error(f"Error writing progress file: {e}")
    
    def read_progress_file(self, job_id: str) -> Optional[Dict]:
        """Read progress data from file"""
        try:
            progress_file = self.progress_dir / f"{job_id}.json"
            if progress_file.exists():
                with open(progress_file, 'r') as f:
                    return json.load(f)
            return None
        except Exception as e:
            logger.error(f"Error reading progress file: {e}")
            return None


# Global client instance
_client: Optional[SupabaseClient] = None

def get_supabase_client() -> SupabaseClient:
    """Get or create global Supabase client instance"""
    global _client
    if _client is None:
        _client = SupabaseClient()
    return _client


# Convenience functions for backward compatibility
def create_job(municipality_id: int, scraper_name: str, **kwargs) -> str:
    """Create a new scraper job"""
    client = get_supabase_client()
    return client.create_scraper_job(municipality_id, scraper_name, **kwargs)

def update_progress(job_id: str, progress: int, message: str, status: str = 'running') -> bool:
    """Update job progress"""
    client = get_supabase_client()
    return client.update_job_progress(job_id, progress, message, status)

def complete_job(job_id: str, success: bool, result_data: Optional[Dict] = None, error_message: Optional[str] = None) -> bool:
    """Complete a job"""
    client = get_supabase_client()
    return client.complete_job(job_id, success, result_data, error_message)

def save_document(municipality_id: int, title: str, url: str, filename: str, **kwargs) -> Optional[int]:
    """Save a document"""
    client = get_supabase_client()
    return client.save_document(municipality_id, title, url, filename, **kwargs)

def log_scrape_result(municipality_id: int, status: str, documents_found: int, documents_new: int, **kwargs) -> bool:
    """Log scrape results"""
    client = get_supabase_client()
    return client.log_scrape_result(municipality_id, status, documents_found, documents_new, **kwargs)