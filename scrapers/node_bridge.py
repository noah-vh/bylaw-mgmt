"""
Node.js Bridge for Python Scrapers - Simplified Offline Version

Provides basic integration between Next.js API routes and Python scrapers
without Redis/SSE dependencies - local operation only.
"""

import json
import logging
import sys
import traceback
from datetime import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent))

from scrapers.config.municipality_registry import get_registry
from scrapers.municipality_processor import MunicipalityProcessor
from scrapers.batch_coordinator import BatchCoordinator
from scrapers.utils.output_manager import OutputManager


class SimpleNodeBridge:
    """Simplified bridge between Node.js and Python scrapers - offline only"""
    
    def __init__(self, output_dir: str = "scraper_output"):
        self.logger = self._setup_logger()
        self.registry = get_registry()
        self.output_manager = OutputManager(output_dir)
        self.processor = MunicipalityProcessor(self.output_manager)
        self.coordinator = BatchCoordinator(self.output_manager)
    
    def _setup_logger(self) -> logging.Logger:
        """Set up logger for the bridge"""
        logger = logging.getLogger("node_bridge")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    def _serialize_response(self, data: Any) -> str:
        """Serialize response data to JSON"""
        def json_serializer(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            if hasattr(obj, 'to_dict'):
                return obj.to_dict()
            if hasattr(obj, '__dict__'):
                return obj.__dict__
            return str(obj)
        
        try:
            return json.dumps({
                'success': True,
                'data': data,
                'timestamp': datetime.utcnow().isoformat(),
                'offline_mode': True
            }, default=json_serializer, indent=2)
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f"Serialization error: {str(e)}",
                'timestamp': datetime.utcnow().isoformat(),
                'offline_mode': True
            })
    
    def _serialize_error(self, error: str, details: str = None) -> str:
        """Serialize error response"""
        return json.dumps({
            'success': False,
            'error': error,
            'details': details,
            'timestamp': datetime.utcnow().isoformat(),
            'offline_mode': True
        })
    
    def list_available_municipalities(self) -> str:
        """List all available municipalities"""
        try:
            municipalities = self.registry.get_all_municipalities(active_only=True)
            
            municipality_info = []
            for config in municipalities:
                scraper_class = self.registry.get_scraper_class(config.id)
                info = {
                    'id': config.id,
                    'name': config.name,
                    'module': config.scraper_module,
                    'class_name': config.scraper_class,
                    'active': config.active,
                    'estimated_pages': config.estimated_pages,
                    'estimated_pdfs': config.estimated_pdfs,
                    'has_scraper': scraper_class is not None
                }
                municipality_info.append(info)
            
            return self._serialize_response({
                'municipalities': municipality_info,
                'total_count': len(municipality_info),
                'summary': self.registry.get_summary()
            })
            
        except Exception as e:
            self.logger.error(f"Error listing municipalities: {e}")
            return self._serialize_error(str(e), traceback.format_exc())
    
    def process_municipality(self, municipality_id: int) -> str:
        """Process a single municipality"""
        try:
            # Validate municipality
            is_valid, message = self.processor.validate_municipality(municipality_id)
            if not is_valid:
                return self._serialize_error(f"Invalid municipality: {message}")
            
            # Process municipality
            result = self.processor.process_municipality(municipality_id)
            
            return self._serialize_response({
                'municipality_id': result.municipality_id,
                'municipality_name': result.municipality_name,
                'success': result.success,
                'documents_found': result.documents_found,
                'errors': result.errors,
                'elapsed_time': result.elapsed_time,
                'output_file': result.output_file
            })
            
        except Exception as e:
            self.logger.error(f"Error processing municipality {municipality_id}: {e}")
            return self._serialize_error(str(e), traceback.format_exc())
    
    def process_batch(self, municipality_ids: List[int], sequential: bool = False) -> str:
        """Process multiple municipalities"""
        try:
            municipality_set = set(municipality_ids)
            
            # Process batch
            batch_result = self.coordinator.process_municipalities(
                municipality_set, 
                sequential=sequential
            )
            
            if batch_result.get('success'):
                return self._serialize_response(batch_result)
            else:
                return self._serialize_error(
                    batch_result.get('error', 'Unknown batch processing error')
                )
            
        except Exception as e:
            self.logger.error(f"Error processing batch: {e}")
            return self._serialize_error(str(e), traceback.format_exc())
    
    def get_output_summary(self) -> str:
        """Get summary of output files"""
        try:
            summary = self.output_manager.get_output_summary()
            return self._serialize_response(summary)
            
        except Exception as e:
            self.logger.error(f"Error getting output summary: {e}")
            return self._serialize_error(str(e), traceback.format_exc())
    
    def get_recent_results(self, municipality_id: int = None, limit: int = 10) -> str:
        """Get recent result files"""
        try:
            files = self.output_manager.get_recent_results(municipality_id, limit)
            results = []
            
            for file_path in files:
                try:
                    result = self.output_manager.load_municipality_result(file_path)
                    results.append({
                        'file_path': file_path,
                        'municipality_id': result.get('municipality_id'),
                        'municipality_name': result.get('municipality_name'),
                        'documents_found': result.get('documents_found', 0),
                        'scrape_date': result.get('scrape_date'),
                        'success': result.get('documents_found', 0) > 0
                    })
                except Exception as e:
                    self.logger.warning(f"Failed to load result {file_path}: {e}")
            
            return self._serialize_response({
                'recent_results': results,
                'total_files': len(files)
            })
            
        except Exception as e:
            self.logger.error(f"Error getting recent results: {e}")
            return self._serialize_error(str(e), traceback.format_exc())


# Global bridge instance
_bridge_instance: Optional[SimpleNodeBridge] = None


def get_bridge(output_dir: str = "scraper_output") -> SimpleNodeBridge:
    """Get or create the global bridge instance"""
    global _bridge_instance
    
    if _bridge_instance is None:
        _bridge_instance = SimpleNodeBridge(output_dir)
    
    return _bridge_instance


# Command-line interface for Node.js integration
def main():
    """Main entry point for command-line usage"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Simplified Python scraper bridge for Node.js')
    parser.add_argument('command', help='Command to execute')
    parser.add_argument('--municipality-id', type=int, help='Municipality ID')
    parser.add_argument('--municipality-ids', nargs='+', type=int, help='Multiple municipality IDs')
    parser.add_argument('--sequential', action='store_true', help='Process sequentially')
    parser.add_argument('--output-dir', default='scraper_output', help='Output directory')
    parser.add_argument('--limit', type=int, default=10, help='Limit for results')
    
    args = parser.parse_args()
    bridge = get_bridge(args.output_dir)
    
    try:
        if args.command == 'list-municipalities':
            result = bridge.list_available_municipalities()
        elif args.command == 'process-municipality':
            if not args.municipality_id:
                raise ValueError("municipality-id required")
            result = bridge.process_municipality(args.municipality_id)
        elif args.command == 'process-batch':
            if not args.municipality_ids:
                raise ValueError("municipality-ids required")
            result = bridge.process_batch(args.municipality_ids, args.sequential)
        elif args.command == 'output-summary':
            result = bridge.get_output_summary()
        elif args.command == 'recent-results':
            result = bridge.get_recent_results(args.municipality_id, args.limit)
        else:
            result = bridge._serialize_error(f"Unknown command: {args.command}")
        
        print(result)
        
    except Exception as e:
        error_result = bridge._serialize_error(str(e), traceback.format_exc())
        print(error_result)
        sys.exit(1)


if __name__ == '__main__':
    main()