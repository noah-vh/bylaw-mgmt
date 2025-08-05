"""
Pipeline Controller for Flask-style Migration
Controls individual phases: scraping, extraction, analysis
Manages full pipeline and batch operations with operation modes
"""

import logging
from typing import Dict, List, Optional, Any, Set
from datetime import datetime, timezone
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

from .manager import ScraperManager
from .enhanced_manager import EnhancedScraperManager
from .supabase_client import get_supabase_client, SupabaseClient


class PipelineController:
    """
    Pipeline management controller that orchestrates scraping, extraction, and analysis phases
    Supports individual phase operations and complete pipeline execution
    """
    
    def __init__(self, scraper_manager: ScraperManager, enhanced_manager: Optional[EnhancedScraperManager] = None):
        self.logger = self._setup_logger()
        self.scraper_manager = scraper_manager
        self.enhanced_manager = enhanced_manager
        self.supabase_client = get_supabase_client()
        
        # Pipeline state
        self._active_operations: Set[str] = set()
        self._lock = threading.Lock()
        
        self.logger.info("Pipeline Controller initialized")
    
    def _setup_logger(self) -> logging.Logger:
        """Set up logging for the pipeline controller"""
        logger = logging.getLogger("pipeline_controller")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    def _generate_operation_id(self, operation_type: str, municipality_ids: List[int]) -> str:
        """Generate unique operation ID"""
        timestamp = int(time.time() * 1000)
        id_string = "-".join(map(str, sorted(municipality_ids)[:3]))  # First 3 IDs
        return f"{operation_type}_{id_string}_{timestamp}"
    
    def _validate_municipalities(self, municipality_ids: List[int]) -> List[int]:
        """Validate and filter municipality IDs"""
        valid_ids = []
        
        for municipality_id in municipality_ids:
            try:
                municipality = self.supabase_client.get_municipality_info(municipality_id)
                if municipality:
                    valid_ids.append(municipality_id)
                else:
                    self.logger.warning(f"Municipality {municipality_id} not found")
            except Exception as e:
                self.logger.error(f"Error validating municipality {municipality_id}: {e}")
        
        return valid_ids
    
    def _get_assigned_scrapers(self, municipality_ids: List[int]) -> Dict[int, List[str]]:
        """Get assigned scrapers for municipalities from database"""
        assigned_scrapers = {}
        
        for municipality_id in municipality_ids:
            try:
                municipality = self.supabase_client.get_municipality_info(municipality_id)
                if municipality and municipality.get('assigned_scrapers'):
                    assigned_scrapers[municipality_id] = municipality['assigned_scrapers']
                elif municipality and municipality.get('scraper_name'):
                    # Fallback to single scraper_name for backward compatibility
                    assigned_scrapers[municipality_id] = [municipality['scraper_name']]
                else:
                    self.logger.warning(f"No scrapers assigned to municipality {municipality_id}")
                    assigned_scrapers[municipality_id] = []
            except Exception as e:
                self.logger.error(f"Error getting assigned scrapers for municipality {municipality_id}: {e}")
                assigned_scrapers[municipality_id] = []
        
        return assigned_scrapers
    
    def run_scraping_only(self, 
                         municipality_ids: List[int],
                         mode: str = "production",
                         sequential: bool = False) -> Dict[str, Any]:
        """Run scraping phase only for specified municipalities"""
        operation_id = self._generate_operation_id("scraping", municipality_ids)
        
        with self._lock:
            self._active_operations.add(operation_id)
        
        try:
            self.logger.info(f"Starting scraping phase for {len(municipality_ids)} municipalities (mode: {mode})")
            
            # Validate municipalities
            valid_ids = self._validate_municipalities(municipality_ids)
            if not valid_ids:
                return {
                    "success": False,
                    "error": "No valid municipalities found",
                    "operation_id": operation_id
                }
            
            # Get assigned scrapers
            assigned_scrapers = self._get_assigned_scrapers(valid_ids)
            
            results = {}
            summary = {
                "total_municipalities": len(valid_ids),
                "successful": 0,
                "failed": 0,
                "total_documents_found": 0,
                "total_documents_new": 0,
                "total_errors": 0
            }
            
            if sequential:
                # Sequential processing
                for municipality_id in valid_ids:
                    scrapers = assigned_scrapers.get(municipality_id, [])
                    results[municipality_id] = self._run_scrapers_for_municipality(
                        municipality_id, scrapers, mode
                    )
                    
                    # Update summary
                    if results[municipality_id].get("success"):
                        summary["successful"] += 1
                        summary["total_documents_found"] += results[municipality_id].get("documents_found", 0)
                        summary["total_documents_new"] += results[municipality_id].get("documents_new", 0)
                    else:
                        summary["failed"] += 1
                        summary["total_errors"] += len(results[municipality_id].get("errors", []))
            else:
                # Parallel processing
                with ThreadPoolExecutor(max_workers=min(5, len(valid_ids))) as executor:
                    future_to_municipality = {
                        executor.submit(
                            self._run_scrapers_for_municipality,
                            municipality_id,
                            assigned_scrapers.get(municipality_id, []),
                            mode
                        ): municipality_id
                        for municipality_id in valid_ids
                    }
                    
                    for future in as_completed(future_to_municipality):
                        municipality_id = future_to_municipality[future]
                        try:
                            result = future.result()
                            results[municipality_id] = result
                            
                            # Update summary
                            if result.get("success"):
                                summary["successful"] += 1
                                summary["total_documents_found"] += result.get("documents_found", 0)
                                summary["total_documents_new"] += result.get("documents_new", 0)
                            else:
                                summary["failed"] += 1
                                summary["total_errors"] += len(result.get("errors", []))
                        
                        except Exception as e:
                            self.logger.error(f"Error processing municipality {municipality_id}: {e}")
                            results[municipality_id] = {
                                "success": False,
                                "error": str(e)
                            }
                            summary["failed"] += 1
                            summary["total_errors"] += 1
            
            self.logger.info(f"Scraping phase completed: {summary['successful']} successful, {summary['failed']} failed")
            
            return {
                "success": True,
                "operation_id": operation_id,
                "phase": "scraping",
                "mode": mode,
                "summary": summary,
                "results": results,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        
        except Exception as e:
            self.logger.error(f"Error in scraping phase: {e}")
            return {
                "success": False,
                "error": str(e),
                "operation_id": operation_id
            }
        
        finally:
            with self._lock:
                self._active_operations.discard(operation_id)
    
    def _run_scrapers_for_municipality(self, municipality_id: int, scraper_names: List[str], mode: str) -> Dict[str, Any]:
        """Run all assigned scrapers for a municipality"""
        if not scraper_names:
            return {
                "success": False,
                "error": "No scrapers assigned to municipality",
                "municipality_id": municipality_id
            }
        
        results = {}
        total_documents_found = 0
        total_documents_new = 0
        all_errors = []
        
        for scraper_name in scraper_names:
            try:
                if mode == "test":
                    result = self.scraper_manager.test_scraper(scraper_name, municipality_id)
                else:
                    result = self.scraper_manager.run_scraper(municipality_id, scraper_name)
                
                results[scraper_name] = result
                
                if result.get("success"):
                    total_documents_found += result.get("documents_found", 0)
                    total_documents_new += result.get("documents_new", 0)
                
                if result.get("errors"):
                    all_errors.extend(result["errors"])
            
            except Exception as e:
                error_msg = f"Error running scraper {scraper_name}: {e}"
                self.logger.error(error_msg)
                results[scraper_name] = {
                    "success": False,
                    "error": str(e)
                }
                all_errors.append(error_msg)
        
        # Determine overall success
        successful_scrapers = sum(1 for r in results.values() if r.get("success"))
        overall_success = successful_scrapers > 0
        
        return {
            "success": overall_success,
            "municipality_id": municipality_id,
            "scraper_results": results,
            "documents_found": total_documents_found,
            "documents_new": total_documents_new,
            "errors": all_errors,
            "successful_scrapers": successful_scrapers,
            "total_scrapers": len(scraper_names)
        }
    
    def run_extraction_only(self,
                           municipality_ids: Optional[List[int]] = None,
                           document_ids: Optional[List[int]] = None,
                           force_reextract: bool = False) -> Dict[str, Any]:
        """Run extraction phase only for specified documents or municipalities"""
        operation_id = self._generate_operation_id("extraction", municipality_ids or [])
        
        with self._lock:
            self._active_operations.add(operation_id)
        
        try:
            self.logger.info("Starting extraction phase")
            
            # Import extraction modules
            try:
                from ..lib.pdf_extractor import PDFExtractor
                from ..lib.document_processor import DocumentProcessor
            except ImportError:
                return {
                    "success": False,
                    "error": "PDF extraction modules not available",
                    "operation_id": operation_id
                }
            
            extractor = PDFExtractor()
            processor = DocumentProcessor()
            
            # Get documents to process
            documents_to_process = []
            
            if document_ids:
                # Process specific documents
                for doc_id in document_ids:
                    try:
                        # Get document from database
                        doc = self._get_document_by_id(doc_id)
                        if doc:
                            documents_to_process.append(doc)
                    except Exception as e:
                        self.logger.error(f"Error getting document {doc_id}: {e}")
            
            elif municipality_ids:
                # Process documents for municipalities
                for municipality_id in municipality_ids:
                    try:
                        docs = self._get_documents_for_extraction(municipality_id, force_reextract)
                        documents_to_process.extend(docs)
                    except Exception as e:
                        self.logger.error(f"Error getting documents for municipality {municipality_id}: {e}")
            
            else:
                return {
                    "success": False,
                    "error": "Either municipality_ids or document_ids must be provided",
                    "operation_id": operation_id
                }
            
            if not documents_to_process:
                return {
                    "success": True,
                    "message": "No documents found for extraction",
                    "operation_id": operation_id,
                    "summary": {
                        "total_documents": 0,
                        "successful": 0,
                        "failed": 0
                    }
                }
            
            # Process documents
            results = []
            successful = 0
            failed = 0
            
            for doc in documents_to_process:
                try:
                    # Extract content
                    content = extractor.extract_text_from_url(doc['url'])
                    
                    if content:
                        # Process and save content
                        processed_content = processor.process_content(content)
                        
                        # Update document in database
                        self._update_document_content(doc['id'], processed_content)
                        
                        results.append({
                            "document_id": doc['id'],
                            "title": doc['title'],
                            "success": True,
                            "content_length": len(processed_content)
                        })
                        successful += 1
                    else:
                        results.append({
                            "document_id": doc['id'],
                            "title": doc['title'],
                            "success": False,
                            "error": "No content extracted"
                        })
                        failed += 1
                
                except Exception as e:
                    self.logger.error(f"Error extracting content from document {doc['id']}: {e}")
                    results.append({
                        "document_id": doc['id'],
                        "title": doc.get('title', 'Unknown'),
                        "success": False,
                        "error": str(e)
                    })
                    failed += 1
            
            summary = {
                "total_documents": len(documents_to_process),
                "successful": successful,
                "failed": failed,
                "success_rate": successful / len(documents_to_process) if documents_to_process else 0
            }
            
            self.logger.info(f"Extraction phase completed: {successful} successful, {failed} failed")
            
            return {
                "success": True,
                "operation_id": operation_id,
                "phase": "extraction",
                "summary": summary,
                "results": results,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        
        except Exception as e:
            self.logger.error(f"Error in extraction phase: {e}")
            return {
                "success": False,
                "error": str(e),
                "operation_id": operation_id
            }
        
        finally:
            with self._lock:
                self._active_operations.discard(operation_id)
    
    def run_analysis_only(self,
                         municipality_ids: Optional[List[int]] = None,
                         document_ids: Optional[List[int]] = None,
                         force_reanalyze: bool = False) -> Dict[str, Any]:
        """Run analysis phase only for specified documents or municipalities"""
        operation_id = self._generate_operation_id("analysis", municipality_ids or [])
        
        with self._lock:
            self._active_operations.add(operation_id)
        
        try:
            self.logger.info("Starting analysis phase")
            
            # Import analysis modules
            try:
                from ..lib.relevance_scorer import RelevanceScorer
                from ..lib.keyword_analyzer import KeywordAnalyzer
            except ImportError:
                return {
                    "success": False,
                    "error": "Analysis modules not available",
                    "operation_id": operation_id
                }
            
            scorer = RelevanceScorer()
            analyzer = KeywordAnalyzer()
            
            # Get documents to analyze
            documents_to_analyze = []
            
            if document_ids:
                # Analyze specific documents
                for doc_id in document_ids:
                    try:
                        doc = self._get_document_by_id(doc_id)
                        if doc and (force_reanalyze or not doc.get('content_analyzed')):
                            documents_to_analyze.append(doc)
                    except Exception as e:
                        self.logger.error(f"Error getting document {doc_id}: {e}")
            
            elif municipality_ids:
                # Analyze documents for municipalities
                for municipality_id in municipality_ids:
                    try:
                        docs = self._get_documents_for_analysis(municipality_id, force_reanalyze)
                        documents_to_analyze.extend(docs)
                    except Exception as e:
                        self.logger.error(f"Error getting documents for municipality {municipality_id}: {e}")
            
            else:
                return {
                    "success": False,
                    "error": "Either municipality_ids or document_ids must be provided",
                    "operation_id": operation_id
                }
            
            if not documents_to_analyze:
                return {
                    "success": True,
                    "message": "No documents found for analysis",
                    "operation_id": operation_id,
                    "summary": {
                        "total_documents": 0,
                        "successful": 0,
                        "failed": 0,
                        "relevant_documents": 0
                    }
                }
            
            # Analyze documents
            results = []
            successful = 0
            failed = 0
            relevant_count = 0
            
            for doc in documents_to_analyze:
                try:
                    if not doc.get('content_text'):
                        results.append({
                            "document_id": doc['id'],
                            "title": doc['title'],
                            "success": False,
                            "error": "No content available for analysis"
                        })
                        failed += 1
                        continue
                    
                    # Analyze relevance
                    relevance_score = scorer.calculate_relevance_score(
                        doc['title'],
                        doc['content_text']
                    )
                    
                    # Extract keywords
                    keywords = analyzer.extract_keywords(doc['content_text'])
                    
                    # Determine if document is relevant (threshold can be configurable)
                    is_relevant = relevance_score >= 0.5
                    if is_relevant:
                        relevant_count += 1
                    
                    # Update document in database
                    self._update_document_analysis(doc['id'], {
                        'relevance_score': relevance_score,
                        'keywords': keywords,
                        'is_adu_relevant': is_relevant,
                        'content_analyzed': True
                    })
                    
                    results.append({
                        "document_id": doc['id'],
                        "title": doc['title'],
                        "success": True,
                        "relevance_score": relevance_score,
                        "is_relevant": is_relevant,
                        "keywords_found": len(keywords)
                    })
                    successful += 1
                
                except Exception as e:
                    self.logger.error(f"Error analyzing document {doc['id']}: {e}")
                    results.append({
                        "document_id": doc['id'],
                        "title": doc.get('title', 'Unknown'),
                        "success": False,
                        "error": str(e)
                    })
                    failed += 1
            
            summary = {
                "total_documents": len(documents_to_analyze),
                "successful": successful,
                "failed": failed,
                "relevant_documents": relevant_count,
                "relevance_rate": relevant_count / successful if successful > 0 else 0,
                "success_rate": successful / len(documents_to_analyze) if documents_to_analyze else 0
            }
            
            self.logger.info(f"Analysis phase completed: {successful} successful, {failed} failed, {relevant_count} relevant")
            
            return {
                "success": True,
                "operation_id": operation_id,
                "phase": "analysis",
                "summary": summary,
                "results": results,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        
        except Exception as e:
            self.logger.error(f"Error in analysis phase: {e}")
            return {
                "success": False,
                "error": str(e),
                "operation_id": operation_id
            }
        
        finally:
            with self._lock:
                self._active_operations.discard(operation_id)
    
    def run_complete_pipeline(self,
                             municipality_ids: List[int],
                             mode: str = "production",
                             sequential: bool = False,
                             skip_phases: Optional[List[str]] = None) -> Dict[str, Any]:
        """Run complete pipeline: scraping -> extraction -> analysis"""
        operation_id = self._generate_operation_id("complete_pipeline", municipality_ids)
        skip_phases = skip_phases or []
        
        with self._lock:
            self._active_operations.add(operation_id)
        
        try:
            self.logger.info(f"Starting complete pipeline for {len(municipality_ids)} municipalities")
            
            pipeline_results = {
                "operation_id": operation_id,
                "municipality_ids": municipality_ids,
                "mode": mode,
                "phases_run": [],
                "phases_skipped": skip_phases,
                "results": {},
                "overall_success": True,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
            # Phase 1: Scraping
            if "scraping" not in skip_phases:
                self.logger.info("Running scraping phase...")
                scraping_result = self.run_scraping_only(
                    municipality_ids=municipality_ids,
                    mode=mode,
                    sequential=sequential
                )
                
                pipeline_results["results"]["scraping"] = scraping_result
                pipeline_results["phases_run"].append("scraping")
                
                if not scraping_result.get("success"):
                    pipeline_results["overall_success"] = False
                    self.logger.error("Scraping phase failed, stopping pipeline")
                    return pipeline_results
            
            # Phase 2: Extraction
            if "extraction" not in skip_phases:
                self.logger.info("Running extraction phase...")
                extraction_result = self.run_extraction_only(
                    municipality_ids=municipality_ids,
                    force_reextract=mode == "test"  # Force reextract in test mode
                )
                
                pipeline_results["results"]["extraction"] = extraction_result
                pipeline_results["phases_run"].append("extraction")
                
                if not extraction_result.get("success"):
                    pipeline_results["overall_success"] = False
                    self.logger.warning("Extraction phase failed, continuing to analysis")
            
            # Phase 3: Analysis
            if "analysis" not in skip_phases:
                self.logger.info("Running analysis phase...")
                analysis_result = self.run_analysis_only(
                    municipality_ids=municipality_ids,
                    force_reanalyze=mode == "test"  # Force reanalyze in test mode
                )
                
                pipeline_results["results"]["analysis"] = analysis_result
                pipeline_results["phases_run"].append("analysis")
                
                if not analysis_result.get("success"):
                    pipeline_results["overall_success"] = False
                    self.logger.warning("Analysis phase failed")
            
            # Generate summary
            pipeline_results["summary"] = self._generate_pipeline_summary(pipeline_results)
            
            self.logger.info(f"Complete pipeline finished: {'SUCCESS' if pipeline_results['overall_success'] else 'PARTIAL'}")
            
            return pipeline_results
        
        except Exception as e:
            self.logger.error(f"Error in complete pipeline: {e}")
            return {
                "success": False,
                "error": str(e),
                "operation_id": operation_id
            }
        
        finally:
            with self._lock:
                self._active_operations.discard(operation_id)
    
    def run_on_multiple(self,
                       municipality_ids: List[int],
                       mode: str = "production",
                       sequential: bool = False) -> Dict[str, Any]:
        """Run complete pipeline on multiple municipalities"""
        return self.run_complete_pipeline(
            municipality_ids=municipality_ids,
            mode=mode,
            sequential=sequential
        )
    
    def run_on_all(self,
                  mode: str = "production",
                  sequential: bool = False) -> Dict[str, Any]:
        """Run complete pipeline on all active municipalities"""
        try:
            # Get all active municipalities
            all_municipalities = self._get_all_active_municipalities()
            municipality_ids = [m['id'] for m in all_municipalities]
            
            if not municipality_ids:
                return {
                    "success": False,
                    "error": "No active municipalities found"
                }
            
            self.logger.info(f"Running pipeline on all {len(municipality_ids)} active municipalities")
            
            return self.run_complete_pipeline(
                municipality_ids=municipality_ids,
                mode=mode,
                sequential=sequential
            )
        
        except Exception as e:
            self.logger.error(f"Error in run_on_all: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _generate_pipeline_summary(self, pipeline_results: Dict[str, Any]) -> Dict[str, Any]:
        """Generate summary of pipeline results"""
        summary = {
            "total_municipalities": len(pipeline_results["municipality_ids"]),
            "phases_completed": len(pipeline_results["phases_run"]),
            "overall_success": pipeline_results["overall_success"]
        }
        
        # Aggregate statistics from phases
        total_documents_found = 0
        total_documents_new = 0
        total_documents_extracted = 0
        total_documents_analyzed = 0
        total_relevant_documents = 0
        
        results = pipeline_results.get("results", {})
        
        if "scraping" in results:
            scraping_summary = results["scraping"].get("summary", {})
            total_documents_found = scraping_summary.get("total_documents_found", 0)
            total_documents_new = scraping_summary.get("total_documents_new", 0)
        
        if "extraction" in results:
            extraction_summary = results["extraction"].get("summary", {})
            total_documents_extracted = extraction_summary.get("successful", 0)
        
        if "analysis" in results:
            analysis_summary = results["analysis"].get("summary", {})
            total_documents_analyzed = analysis_summary.get("successful", 0)
            total_relevant_documents = analysis_summary.get("relevant_documents", 0)
        
        summary.update({
            "documents_found": total_documents_found,
            "documents_new": total_documents_new,
            "documents_extracted": total_documents_extracted,
            "documents_analyzed": total_documents_analyzed,
            "relevant_documents": total_relevant_documents,
            "relevance_rate": total_relevant_documents / total_documents_analyzed if total_documents_analyzed > 0 else 0
        })
        
        return summary
    
    # Database helper methods
    
    def _get_document_by_id(self, document_id: int) -> Optional[Dict[str, Any]]:
        """Get document by ID from database"""
        try:
            result = self.supabase_client.supabase.table('pdf_documents').select('*').eq('id', document_id).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            self.logger.error(f"Error getting document {document_id}: {e}")
            return None
    
    def _get_documents_for_extraction(self, municipality_id: int, force_reextract: bool = False) -> List[Dict[str, Any]]:
        """Get documents that need content extraction"""
        try:
            query = self.supabase_client.supabase.table('pdf_documents').select('*').eq('municipality_id', municipality_id)
            
            if not force_reextract:
                # Only get documents without content
                query = query.is_('content_text', 'null')
            
            result = query.execute()
            return result.data or []
        except Exception as e:
            self.logger.error(f"Error getting documents for extraction: {e}")
            return []
    
    def _get_documents_for_analysis(self, municipality_id: int, force_reanalyze: bool = False) -> List[Dict[str, Any]]:
        """Get documents that need analysis"""
        try:
            query = self.supabase_client.supabase.table('pdf_documents').select('*').eq('municipality_id', municipality_id)
            
            if not force_reanalyze:
                # Only get documents that haven't been analyzed
                query = query.eq('content_analyzed', False)
            
            # Must have content to analyze
            query = query.not_.is_('content_text', 'null')
            
            result = query.execute()
            return result.data or []
        except Exception as e:
            self.logger.error(f"Error getting documents for analysis: {e}")
            return []
    
    def _get_all_active_municipalities(self) -> List[Dict[str, Any]]:
        """Get all active municipalities from database"""
        try:
            result = self.supabase_client.supabase.table('municipalities').select('*').eq('active', True).execute()
            return result.data or []
        except Exception as e:
            self.logger.error(f"Error getting active municipalities: {e}")
            return []
    
    def _update_document_content(self, document_id: int, content: str) -> bool:
        """Update document content in database"""
        try:
            result = self.supabase_client.supabase.table('pdf_documents').update({
                'content_text': content,
                'content_extracted': True,
                'extraction_date': datetime.now(timezone.utc).isoformat()
            }).eq('id', document_id).execute()
            
            return bool(result.data)
        except Exception as e:
            self.logger.error(f"Error updating document content: {e}")
            return False
    
    def _update_document_analysis(self, document_id: int, analysis_data: Dict[str, Any]) -> bool:
        """Update document analysis in database"""
        try:
            update_data = analysis_data.copy()
            update_data['analysis_date'] = datetime.now(timezone.utc).isoformat()
            
            result = self.supabase_client.supabase.table('pdf_documents').update(update_data).eq('id', document_id).execute()
            
            return bool(result.data)
        except Exception as e:
            self.logger.error(f"Error updating document analysis: {e}")
            return False
    
    def get_active_operations(self) -> List[str]:
        """Get list of currently active operations"""
        with self._lock:
            return list(self._active_operations)
    
    def cancel_operation(self, operation_id: str) -> bool:
        """Cancel an active operation"""
        with self._lock:
            if operation_id in self._active_operations:
                # In a real implementation, you'd want to signal the operation to stop
                # For now, just remove it from active operations
                self._active_operations.discard(operation_id)
                self.logger.info(f"Operation {operation_id} marked for cancellation")
                return True
            return False
