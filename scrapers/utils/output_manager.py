"""
Output Manager - Flexible JSON output handling for scraper results

This module provides flexible output management for scraper results,
supporting local file output, structured JSON formatting, and batch processing.
All Redis/SSE dependencies have been removed for offline-only operation.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
import logging


class OutputManager:
    """Manages output of scraper results to local JSON files - offline only"""
    
    def __init__(self, output_dir: str = "scraper_output", create_dirs: bool = True):
        self.output_dir = Path(output_dir)
        self.create_dirs = create_dirs
        
        if create_dirs:
            self.output_dir.mkdir(parents=True, exist_ok=True)
            
        # Create subdirectories
        self.results_dir = self.output_dir / "results"
        self.logs_dir = self.output_dir / "logs"
        self.summaries_dir = self.output_dir / "summaries"
        
        if create_dirs:
            self.results_dir.mkdir(exist_ok=True)
            self.logs_dir.mkdir(exist_ok=True)
            self.summaries_dir.mkdir(exist_ok=True)
            
        self.logger = self._setup_logger()
    
    def _setup_logger(self) -> logging.Logger:
        """Set up logger for output manager"""
        logger = logging.getLogger("output_manager")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            # Console handler
            console_handler = logging.StreamHandler()
            console_formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            console_handler.setFormatter(console_formatter)
            logger.addHandler(console_handler)
            
            # File handler
            if self.create_dirs:
                log_file = self.logs_dir / "output_manager.log"
                file_handler = logging.FileHandler(log_file)
                file_handler.setFormatter(console_formatter)
                logger.addHandler(file_handler)
        
        return logger
    
    def save_municipality_result(self, result: Dict[str, Any], timestamp: str = None) -> str:
        """
        Save a single municipality scraper result
        
        Args:
            result: Scraper result dictionary
            timestamp: Optional timestamp string (ISO format)
            
        Returns:
            Path to saved file
        """
        if not timestamp:
            timestamp = datetime.utcnow().isoformat()
            
        municipality_id = result.get('municipality_id', 'unknown')
        municipality_name = result.get('municipality_name', 'Unknown')
        
        # Create filename
        safe_name = municipality_name.lower().replace(' ', '_').replace(',', '')
        filename = f"{municipality_id}_{safe_name}_{timestamp.split('T')[0]}.json"
        
        # Enhance result with additional metadata
        enhanced_result = {
            **result,
            'output_timestamp': timestamp,
            'output_version': '2.0',
            'file_format': 'bylaw_scraper_result',
            'offline_mode': True,
            'redis_dependencies_removed': True
        }
        
        # Save to file
        output_path = self.results_dir / filename
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(enhanced_result, f, indent=2, ensure_ascii=False)
            
            self.logger.info(f"Saved result for {municipality_name} (ID: {municipality_id}) to {output_path}")
            return str(output_path)
            
        except Exception as e:
            self.logger.error(f"Failed to save result for {municipality_name}: {e}")
            raise
    
    def save_batch_results(self, results: Dict[int, Dict[str, Any]], 
                          batch_id: str = None) -> str:
        """
        Save batch processing results
        
        Args:
            results: Dictionary mapping municipality_id to result
            batch_id: Optional batch identifier
            
        Returns:
            Path to saved batch file
        """
        timestamp = datetime.utcnow().isoformat()
        
        if not batch_id:
            batch_id = f"batch_{timestamp.split('T')[0]}_{len(results)}_municipalities"
        
        # Create batch summary
        batch_result = {
            'batch_id': batch_id,
            'timestamp': timestamp,
            'format_version': '2.0',
            'total_municipalities': len(results),
            'successful': sum(1 for r in results.values() if r.get('documents_found', 0) > 0),
            'failed': sum(1 for r in results.values() if r.get('errors')),
            'total_documents': sum(r.get('documents_found', 0) for r in results.values()),
            'total_errors': sum(len(r.get('errors', [])) for r in results.values()),
            'municipalities': {},
            'offline_mode': True,
            'redis_dependencies_removed': True
        }
        
        # Process each municipality result
        for municipality_id, result in results.items():
            municipality_name = result.get('municipality_name', f'Municipality_{municipality_id}')
            
            # Save individual result
            individual_path = self.save_municipality_result(result, timestamp)
            
            # Add to batch summary
            batch_result['municipalities'][municipality_id] = {
                'municipality_name': municipality_name,
                'documents_found': result.get('documents_found', 0),
                'errors': len(result.get('errors', [])),
                'status': 'success' if result.get('documents_found', 0) > 0 else 'failed',
                'file_path': individual_path,
                'elapsed_time': result.get('elapsed_time', 0)
            }
        
        # Save batch summary
        batch_filename = f"{batch_id}.json"
        batch_path = self.summaries_dir / batch_filename
        
        try:
            with open(batch_path, 'w', encoding='utf-8') as f:
                json.dump(batch_result, f, indent=2, ensure_ascii=False)
            
            self.logger.info(f"Saved batch results for {len(results)} municipalities to {batch_path}")
            return str(batch_path)
            
        except Exception as e:
            self.logger.error(f"Failed to save batch results: {e}")
            raise
    
    def save_progress_log(self, municipality_id: int, municipality_name: str,
                         progress_entries: List[Dict[str, Any]]) -> str:
        """
        Save progress log for a municipality scraping session
        
        Args:
            municipality_id: Municipality ID
            municipality_name: Municipality name
            progress_entries: List of progress log entries
            
        Returns:
            Path to saved log file
        """
        timestamp = datetime.utcnow().isoformat()
        safe_name = municipality_name.lower().replace(' ', '_').replace(',', '')
        
        log_data = {
            'municipality_id': municipality_id,
            'municipality_name': municipality_name,
            'session_timestamp': timestamp,
            'total_entries': len(progress_entries),
            'progress_log': progress_entries,
            'offline_mode': True
        }
        
        log_filename = f"progress_{municipality_id}_{safe_name}_{timestamp.split('T')[0]}.json"
        log_path = self.logs_dir / log_filename
        
        try:
            with open(log_path, 'w', encoding='utf-8') as f:
                json.dump(log_data, f, indent=2, ensure_ascii=False)
            
            self.logger.info(f"Saved progress log for {municipality_name} to {log_path}")
            return str(log_path)
            
        except Exception as e:
            self.logger.error(f"Failed to save progress log for {municipality_name}: {e}")
            raise
    
    def load_municipality_result(self, file_path: str) -> Dict[str, Any]:
        """Load a municipality result from JSON file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            self.logger.error(f"Failed to load result from {file_path}: {e}")
            raise
    
    def load_batch_results(self, file_path: str) -> Dict[str, Any]:
        """Load batch results from JSON file"""
        return self.load_municipality_result(file_path)
    
    def get_recent_results(self, municipality_id: int = None, limit: int = 10) -> List[str]:
        """
        Get paths to recent result files
        
        Args:
            municipality_id: Optional filter by municipality ID
            limit: Maximum number of files to return
            
        Returns:
            List of file paths, sorted by modification time (newest first)
        """
        result_files = []
        
        for file_path in self.results_dir.glob("*.json"):
            if municipality_id is not None:
                # Check if file matches municipality ID
                if not file_path.name.startswith(f"{municipality_id}_"):
                    continue
            
            result_files.append(file_path)
        
        # Sort by modification time (newest first)
        result_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        
        return [str(path) for path in result_files[:limit]]
    
    def get_output_summary(self) -> Dict[str, Any]:
        """Get summary of all output files"""
        summary = {
            'output_directory': str(self.output_dir),
            'results_count': len(list(self.results_dir.glob("*.json"))),
            'batch_summaries_count': len(list(self.summaries_dir.glob("*.json"))),
            'log_files_count': len(list(self.logs_dir.glob("*.json"))),
            'total_size_mb': 0,
            'recent_files': [],
            'offline_mode': True
        }
        
        # Calculate total size
        total_size = 0
        all_files = []
        
        for directory in [self.results_dir, self.summaries_dir, self.logs_dir]:
            for file_path in directory.glob("*.json"):
                size = file_path.stat().st_size
                total_size += size
                all_files.append({
                    'path': str(file_path),
                    'size': size,
                    'modified': file_path.stat().st_mtime
                })
        
        summary['total_size_mb'] = round(total_size / 1024 / 1024, 2)
        
        # Get most recent files
        all_files.sort(key=lambda x: x['modified'], reverse=True)
        summary['recent_files'] = all_files[:5]
        
        return summary
    
    def cleanup_old_files(self, days_to_keep: int = 30) -> int:
        """
        Clean up old output files
        
        Args:
            days_to_keep: Number of days to keep files
            
        Returns:
            Number of files deleted
        """
        import time
        
        cutoff_time = time.time() - (days_to_keep * 24 * 60 * 60)
        deleted_count = 0
        
        for directory in [self.results_dir, self.summaries_dir, self.logs_dir]:
            for file_path in directory.glob("*.json"):
                if file_path.stat().st_mtime < cutoff_time:
                    try:
                        file_path.unlink()
                        deleted_count += 1
                        self.logger.info(f"Deleted old file: {file_path}")
                    except Exception as e:
                        self.logger.warning(f"Failed to delete {file_path}: {e}")
        
        self.logger.info(f"Cleanup completed: {deleted_count} files deleted")
        return deleted_count
    
    def export_for_node_processing(self, result_files: List[str], 
                                  output_file: str = None) -> str:
        """
        Export results in format suitable for Node.js batch processor
        
        Args:
            result_files: List of result file paths to include
            output_file: Optional output file path
            
        Returns:
            Path to exported file
        """
        if not output_file:
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            output_file = str(self.output_dir / f"node_export_{timestamp}.json")
        
        export_data = {
            'export_timestamp': datetime.utcnow().isoformat(),
            'format': 'node_batch_processor_input',
            'version': '1.0',
            'municipalities': [],
            'offline_mode': True
        }
        
        for file_path in result_files:
            try:
                result = self.load_municipality_result(file_path)
                
                # Transform to Node.js expected format
                municipality_data = {
                    'municipality_id': result.get('municipality_id'),
                    'municipality_name': result.get('municipality_name'),
                    'documents_found': result.get('documents_found', 0),
                    'documents': result.get('documents', []),
                    'scrape_date': result.get('scrape_date'),
                    'source_file': file_path
                }
                
                export_data['municipalities'].append(municipality_data)
                
            except Exception as e:
                self.logger.warning(f"Failed to process {file_path} for export: {e}")
        
        # Save export file
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, indent=2, ensure_ascii=False)
            
            self.logger.info(f"Exported {len(export_data['municipalities'])} municipality results to {output_file}")
            return output_file
            
        except Exception as e:
            self.logger.error(f"Failed to save export file: {e}")
            raise


def main():
    """Test the output manager"""
    output_manager = OutputManager("test_output")
    
    # Test saving a municipality result
    test_result = {
        'municipality_id': 1,
        'municipality_name': 'Test City',
        'documents_found': 5,
        'documents': [
            {'url': 'http://example.com/1.pdf', 'title': 'Test Doc 1'},
            {'url': 'http://example.com/2.pdf', 'title': 'Test Doc 2'}
        ],
        'errors': [],
        'scrape_date': datetime.utcnow().isoformat(),
        'elapsed_time': 10.5
    }
    
    result_path = output_manager.save_municipality_result(test_result)
    print(f"Saved test result to: {result_path}")
    
    # Test batch results
    batch_results = {
        1: test_result,
        2: {**test_result, 'municipality_id': 2, 'municipality_name': 'Test City 2'}
    }
    
    batch_path = output_manager.save_batch_results(batch_results)
    print(f"Saved batch results to: {batch_path}")
    
    # Show summary
    summary = output_manager.get_output_summary()
    print(f"\nOutput Summary: {summary}")


if __name__ == "__main__":
    main()