"""
Core Python Service Infrastructure for Flask-style Migration
Main service process that handles JSON requests via stdin/stdout
Maintains ScraperManager instance with proper error handling and logging
"""

import json
import sys
import logging
import traceback
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, timezone
import threading
from pathlib import Path

from .manager import ScraperManager
from .supabase_client import get_supabase_client
from .enhanced_manager import get_enhanced_manager, EnhancedScraperManager
from .pipeline_controller import PipelineController


class ServiceManager:
    """
    Main service process for handling JSON requests and maintaining scraper operations
    Designed for Flask-style migration with stdin/stdout communication
    """
    
    def __init__(self, enable_enhanced_features: bool = True):
        self.logger = self._setup_logger()
        self.enable_enhanced_features = enable_enhanced_features
        
        # Initialize components
        self.scraper_manager = ScraperManager()
        self.supabase_client = get_supabase_client()
        
        if enable_enhanced_features:
            self.enhanced_manager = get_enhanced_manager(
                max_concurrent_jobs=5,
                progress_callback=self._progress_callback
            )
        else:
            self.enhanced_manager = None
            
        self.pipeline_controller = PipelineController(
            self.scraper_manager,
            self.enhanced_manager
        )
        
        # Service state
        self._running = False
        self._lock = threading.Lock()
        
        self.logger.info("Service Manager initialized successfully")
    
    def _setup_logger(self) -> logging.Logger:
        """Set up logging for the service"""
        logger = logging.getLogger("service_manager")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            handler = logging.StreamHandler(sys.stderr)  # Use stderr to avoid mixing with JSON output
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    def _progress_callback(self, job_key: str, progress_data: Dict[str, Any]) -> None:
        """Handle progress updates from enhanced manager"""
        try:
            # Send progress update via stdout
            progress_message = {
                "type": "progress",
                "job_key": job_key,
                "data": progress_data,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            self._send_response(progress_message)
        except Exception as e:
            self.logger.error(f"Error in progress callback: {e}")
    
    def _send_response(self, response: Dict[str, Any]) -> None:
        """Send JSON response via stdout"""
        try:
            json_response = json.dumps(response, default=str)
            print(json_response, flush=True)
        except Exception as e:
            self.logger.error(f"Error sending response: {e}")
    
    def _send_error(self, error_message: str, request_id: Optional[str] = None) -> None:
        """Send error response"""
        error_response = {
            "type": "error",
            "error": error_message,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        if request_id:
            error_response["request_id"] = request_id
        
        self._send_response(error_response)
    
    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming JSON request"""
        request_id = request.get("id")
        action = request.get("action")
        params = request.get("params", {})
        
        try:
            if action == "health_check":
                return self._handle_health_check(params)
            
            elif action == "list_scrapers":
                return self._handle_list_scrapers(params)
            
            elif action == "run_scraper":
                return self._handle_run_scraper(params)
            
            elif action == "test_scraper":
                return self._handle_test_scraper(params)
            
            elif action == "scraping_phase":
                return self._handle_scraping_phase(params)
            
            elif action == "extraction_phase":
                return self._handle_extraction_phase(params)
            
            elif action == "analysis_phase":
                return self._handle_analysis_phase(params)
            
            elif action == "complete_pipeline":
                return self._handle_complete_pipeline(params)
            
            elif action == "batch_process":
                return self._handle_batch_process(params)
            
            elif action == "get_job_status":
                return self._handle_get_job_status(params)
            
            elif action == "cancel_job":
                return self._handle_cancel_job(params)
            
            elif action == "get_system_status":
                return self._handle_get_system_status(params)
            
            else:
                raise ValueError(f"Unknown action: {action}")
        
        except Exception as e:
            self.logger.error(f"Error handling request {action}: {e}")
            return {
                "type": "error",
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc()
            }
    
    def _handle_health_check(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle health check request"""
        try:
            # Test database connectivity
            db_healthy = False
            try:
                municipality = self.supabase_client.get_municipality_info(1)
                db_healthy = True
            except Exception as db_error:
                self.logger.warning(f"Database health check failed: {db_error}")
            
            return {
                "type": "response",
                "success": True,
                "data": {
                    "status": "healthy",
                    "database_connected": db_healthy,
                    "scrapers_loaded": len(self.scraper_manager.get_available_scrapers()),
                    "enhanced_features": self.enable_enhanced_features,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            }
        except Exception as e:
            return {
                "type": "response",
                "success": False,
                "error": str(e)
            }
    
    def _handle_list_scrapers(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle list scrapers request"""
        try:
            scrapers = self.scraper_manager.get_available_scrapers()
            
            # Get additional info for each scraper if enhanced features enabled
            scraper_info = []
            for scraper_name in scrapers:
                info = {
                    "name": scraper_name,
                    "description": f"Scraper for {scraper_name.replace('_', ' ').title()}",
                    "status": "available"
                }
                
                if self.enable_enhanced_features:
                    # Get scraper config from database
                    config = self.supabase_client.get_scraper_config(scraper_name)
                    if config:
                        info.update({
                            "success_rate": config.get("success_rate"),
                            "last_tested": config.get("last_tested"),
                            "test_notes": config.get("test_notes")
                        })
                
                scraper_info.append(info)
            
            return {
                "type": "response",
                "success": True,
                "data": {
                    "scrapers": scraper_info,
                    "total_count": len(scrapers)
                }
            }
        except Exception as e:
            return {
                "type": "response",
                "success": False,
                "error": str(e)
            }
    
    def _handle_run_scraper(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle run scraper request"""
        try:
            municipality_id = params.get("municipality_id")
            scraper_name = params.get("scraper_name")
            job_id = params.get("job_id")
            
            if not municipality_id or not scraper_name:
                raise ValueError("municipality_id and scraper_name are required")
            
            # Create progress callback
            def progress_callback(progress: int, message: str):
                self._send_response({
                    "type": "progress",
                    "job_id": job_id,
                    "progress": progress,
                    "message": message,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            
            # Run the scraper
            result = self.scraper_manager.run_scraper(
                municipality_id=municipality_id,
                scraper_name=scraper_name,
                progress_callback=progress_callback if job_id else None
            )
            
            return {
                "type": "response",
                "success": result.get("success", False),
                "data": result
            }
            
        except Exception as e:
            return {
                "type": "response",
                "success": False,
                "error": str(e)
            }
    
    def _handle_test_scraper(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle test scraper request"""
        try:
            scraper_name = params.get("scraper_name")
            municipality_id = params.get("municipality_id")
            
            if not scraper_name or not municipality_id:
                raise ValueError("scraper_name and municipality_id are required")
            
            result = self.scraper_manager.test_scraper(scraper_name, municipality_id)
            
            return {
                "type": "response",
                "success": result.get("success", False),
                "data": result
            }
            
        except Exception as e:
            return {
                "type": "response",
                "success": False,
                "error": str(e)
            }
    
    def _handle_scraping_phase(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle scraping-only phase request"""
        try:
            municipality_ids = params.get("municipality_ids", [])
            mode = params.get("mode", "production")
            sequential = params.get("sequential", False)
            
            if not municipality_ids:
                raise ValueError("municipality_ids are required")
            
            result = self.pipeline_controller.run_scraping_only(
                municipality_ids=municipality_ids,
                mode=mode,
                sequential=sequential
            )
            
            return {
                "type": "response",
                "success": result.get("success", False),
                "data": result
            }
            
        except Exception as e:
            return {
                "type": "response",
                "success": False,
                "error": str(e)
            }
    
    def _handle_extraction_phase(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle extraction-only phase request"""
        try:
            municipality_ids = params.get("municipality_ids", [])
            document_ids = params.get("document_ids")
            force_reextract = params.get("force_reextract", False)
            
            result = self.pipeline_controller.run_extraction_only(
                municipality_ids=municipality_ids,
                document_ids=document_ids,
                force_reextract=force_reextract
            )
            
            return {
                "type": "response",
                "success": result.get("success", False),
                "data": result
            }
            
        except Exception as e:
            return {
                "type": "response",
                "success": False,
                "error": str(e)
            }
    
    def _handle_analysis_phase(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle analysis-only phase request"""
        try:
            municipality_ids = params.get("municipality_ids", [])
            document_ids = params.get("document_ids")
            force_reanalyze = params.get("force_reanalyze", False)
            
            result = self.pipeline_controller.run_analysis_only(
                municipality_ids=municipality_ids,
                document_ids=document_ids,
                force_reanalyze=force_reanalyze
            )
            
            return {
                "type": "response",
                "success": result.get("success", False),
                "data": result
            }
            
        except Exception as e:
            return {
                "type": "response",
                "success": False,
                "error": str(e)
            }
    
    def _handle_complete_pipeline(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle complete pipeline request"""
        try:
            municipality_ids = params.get("municipality_ids", [])
            mode = params.get("mode", "production")
            sequential = params.get("sequential", False)
            skip_phases = params.get("skip_phases", [])
            
            if not municipality_ids:
                raise ValueError("municipality_ids are required")
            
            result = self.pipeline_controller.run_complete_pipeline(
                municipality_ids=municipality_ids,
                mode=mode,
                sequential=sequential,
                skip_phases=skip_phases
            )
            
            return {
                "type": "response",
                "success": result.get("success", False),
                "data": result
            }
            
        except Exception as e:
            return {
                "type": "response",
                "success": False,
                "error": str(e)
            }
    
    def _handle_batch_process(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle batch processing request"""
        try:
            operation = params.get("operation", "complete_pipeline")
            municipality_selection = params.get("municipality_selection", "all")
            mode = params.get("mode", "production")
            sequential = params.get("sequential", False)
            
            if operation == "run_on_multiple":
                municipality_ids = params.get("municipality_ids", [])
                result = self.pipeline_controller.run_on_multiple(
                    municipality_ids=municipality_ids,
                    mode=mode,
                    sequential=sequential
                )
            elif operation == "run_on_all":
                result = self.pipeline_controller.run_on_all(
                    mode=mode,
                    sequential=sequential
                )
            else:
                raise ValueError(f"Unknown batch operation: {operation}")
            
            return {
                "type": "response",
                "success": result.get("success", False),
                "data": result
            }
            
        except Exception as e:
            return {
                "type": "response",
                "success": False,
                "error": str(e)
            }
    
    def _handle_get_job_status(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get job status request"""
        try:
            job_id = params.get("job_id")
            
            if not job_id:
                raise ValueError("job_id is required")
            
            if self.enhanced_manager:
                status = self.enhanced_manager.get_job_status(job_id)
            else:
                # Read from progress file if available
                status = self.supabase_client.read_progress_file(job_id)
            
            return {
                "type": "response",
                "success": True,
                "data": status or {"status": "not_found"}
            }
            
        except Exception as e:
            return {
                "type": "response",
                "success": False,
                "error": str(e)
            }
    
    def _handle_cancel_job(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle cancel job request"""
        try:
            job_id = params.get("job_id")
            
            if not job_id:
                raise ValueError("job_id is required")
            
            if self.enhanced_manager:
                success = self.enhanced_manager.cancel_job(job_id)
            else:
                # Basic cancellation - update status in database
                success = self.supabase_client.update_job_progress(
                    job_id, 0, "Job cancelled by user", "cancelled"
                )
            
            return {
                "type": "response",
                "success": success,
                "data": {"cancelled": success}
            }
            
        except Exception as e:
            return {
                "type": "response",
                "success": False,
                "error": str(e)
            }
    
    def _handle_get_system_status(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get system status request"""
        try:
            if self.enhanced_manager:
                status = self.enhanced_manager.get_manager_stats()
            else:
                status = {
                    "status": "active",
                    "scrapers_loaded": len(self.scraper_manager.get_available_scrapers()),
                    "enhanced_features": False
                }
            
            return {
                "type": "response",
                "success": True,
                "data": status
            }
            
        except Exception as e:
            return {
                "type": "response",
                "success": False,
                "error": str(e)
            }
    
    def run_service(self) -> None:
        """Main service loop - read JSON requests from stdin and send responses to stdout"""
        self._running = True
        self.logger.info("Service Manager started - listening for JSON requests on stdin")
        
        try:
            while self._running:
                try:
                    # Read line from stdin
                    line = sys.stdin.readline()
                    if not line:
                        break
                    
                    line = line.strip()
                    if not line:
                        continue
                    
                    # Parse JSON request
                    try:
                        request = json.loads(line)
                    except json.JSONDecodeError as e:
                        self._send_error(f"Invalid JSON: {e}")
                        continue
                    
                    # Handle request
                    response = self.handle_request(request)
                    
                    # Add request ID if present
                    if "id" in request:
                        response["request_id"] = request["id"]
                    
                    # Send response
                    self._send_response(response)
                    
                except KeyboardInterrupt:
                    self.logger.info("Received interrupt signal")
                    break
                except Exception as e:
                    self.logger.error(f"Error in service loop: {e}")
                    self._send_error(f"Service error: {e}")
        
        finally:
            self._running = False
            self.logger.info("Service Manager stopped")
    
    def stop_service(self) -> None:
        """Stop the service gracefully"""
        with self._lock:
            self._running = False
        
        if self.enhanced_manager:
            self.enhanced_manager.shutdown()
        
        self.logger.info("Service Manager shutdown initiated")


def main():
    """Main entry point for the service"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Python Scraper Service Manager")
    parser.add_argument("--disable-enhanced", action="store_true",
                       help="Disable enhanced features")
    parser.add_argument("--log-level", default="INFO",
                       choices=["DEBUG", "INFO", "WARNING", "ERROR"],
                       help="Set logging level")
    
    args = parser.parse_args()
    
    # Set logging level
    logging.getLogger().setLevel(getattr(logging, args.log_level))
    
    # Create and run service
    service = ServiceManager(enable_enhanced_features=not args.disable_enhanced)
    
    try:
        service.run_service()
    except KeyboardInterrupt:
        pass
    finally:
        service.stop_service()


if __name__ == "__main__":
    main()
