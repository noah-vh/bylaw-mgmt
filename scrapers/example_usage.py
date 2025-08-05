#!/usr/bin/env python3
"""
Example usage of the Service Infrastructure
Demonstrates how to use the service_manager and pipeline_controller
"""

import json
import sys
from typing import Dict, Any

# Add current directory to path for imports
sys.path.append('.')

from scrapers.service_manager import ServiceManager
from scrapers.pipeline_controller import PipelineController
from scrapers.manager import ScraperManager


def example_direct_usage():
    """Example of using the services directly (without JSON communication)"""
    print("=" * 60)
    print("Direct Service Usage Example")
    print("=" * 60)
    
    try:
        # Create service manager
        print("1. Creating Service Manager...")
        service_manager = ServiceManager(enable_enhanced_features=False)  # Disable enhanced for simplicity
        
        # Test health check
        print("\n2. Health Check...")
        health_result = service_manager._handle_health_check({})
        print(f"Health Status: {health_result.get('data', {}).get('status', 'unknown')}")
        print(f"Scrapers Loaded: {health_result.get('data', {}).get('scrapers_loaded', 0)}")
        
        # List available scrapers
        print("\n3. Available Scrapers...")
        scrapers_result = service_manager._handle_list_scrapers({})
        if scrapers_result.get('success'):
            scrapers = scrapers_result.get('data', {}).get('scrapers', [])
            print(f"Found {len(scrapers)} scrapers:")
            for scraper in scrapers[:5]:  # Show first 5
                print(f"  - {scraper['name']}: {scraper['status']}")
        
        # Example pipeline operations (with mock data)
        print("\n4. Pipeline Controller Example...")
        pipeline_controller = PipelineController(service_manager.scraper_manager)
        
        # Test with empty list (should handle gracefully)
        pipeline_result = pipeline_controller.run_scraping_only(
            municipality_ids=[],
            mode="test"
        )
        
        print(f"Pipeline test result: {pipeline_result.get('success')}")
        print(f"Operation ID: {pipeline_result.get('operation_id')}")
        
        print("\n✓ Direct usage example completed successfully")
        
    except Exception as e:
        print(f"✗ Direct usage example failed: {e}")


def example_json_request_format():
    """Show examples of JSON request formats"""
    print("\n" + "=" * 60)
    print("JSON Request Format Examples")
    print("=" * 60)
    
    examples = [
        {
            "name": "Health Check",
            "request": {
                "id": "health_001",
                "action": "health_check",
                "params": {}
            }
        },
        {
            "name": "List Scrapers",
            "request": {
                "id": "list_001",
                "action": "list_scrapers",
                "params": {}
            }
        },
        {
            "name": "Run Single Scraper",
            "request": {
                "id": "run_001",
                "action": "run_scraper",
                "params": {
                    "municipality_id": 1,
                    "scraper_name": "toronto_v2",
                    "job_id": "job_123"
                }
            }
        },
        {
            "name": "Test Scraper",
            "request": {
                "id": "test_001",
                "action": "test_scraper",
                "params": {
                    "municipality_id": 1,
                    "scraper_name": "toronto_v2"
                }
            }
        },
        {
            "name": "Scraping Phase Only",
            "request": {
                "id": "scrape_001",
                "action": "scraping_phase",
                "params": {
                    "municipality_ids": [1, 2, 3],
                    "mode": "production",
                    "sequential": False
                }
            }
        },
        {
            "name": "Complete Pipeline",
            "request": {
                "id": "pipeline_001",
                "action": "complete_pipeline",
                "params": {
                    "municipality_ids": [1, 2, 3],
                    "mode": "production",
                    "sequential": False,
                    "skip_phases": []
                }
            }
        },
        {
            "name": "Batch Process All",
            "request": {
                "id": "batch_001",
                "action": "batch_process",
                "params": {
                    "operation": "run_on_all",
                    "mode": "production",
                    "sequential": False
                }
            }
        }
    ]
    
    for example in examples:
        print(f"\n{example['name']}:")
        print(json.dumps(example['request'], indent=2))


def example_response_format():
    """Show examples of response formats"""
    print("\n" + "=" * 60)
    print("JSON Response Format Examples")
    print("=" * 60)
    
    examples = [
        {
            "name": "Success Response",
            "response": {
                "type": "response",
                "success": True,
                "request_id": "test_001",
                "data": {
                    "status": "healthy",
                    "database_connected": True,
                    "scrapers_loaded": 25
                }
            }
        },
        {
            "name": "Error Response",
            "response": {
                "type": "response",
                "success": False,
                "request_id": "test_002",
                "error": "Municipality not found"
            }
        },
        {
            "name": "Progress Update",
            "response": {
                "type": "progress",
                "job_id": "job_123",
                "progress": 45,
                "message": "Processing documents...",
                "timestamp": "2025-01-05T10:30:00Z"
            }
        },
        {
            "name": "Pipeline Result",
            "response": {
                "type": "response",
                "success": True,
                "request_id": "pipeline_001",
                "data": {
                    "operation_id": "complete_pipeline_1-2-3_1641375600000",
                    "phases_run": ["scraping", "extraction", "analysis"],
                    "overall_success": True,
                    "summary": {
                        "total_municipalities": 3,
                        "documents_found": 150,
                        "documents_new": 25,
                        "relevant_documents": 12,
                        "relevance_rate": 0.08
                    }
                }
            }
        }
    ]
    
    for example in examples:
        print(f"\n{example['name']}:")
        print(json.dumps(example['response'], indent=2))


def example_usage_patterns():
    """Show common usage patterns"""
    print("\n" + "=" * 60)
    print("Common Usage Patterns")
    print("=" * 60)
    
    patterns = [
        {
            "name": "1. Individual Phase Operations",
            "description": "Run specific phases independently",
            "steps": [
                "scraping_phase → Extract documents only",
                "extraction_phase → Extract content from PDFs",
                "analysis_phase → Analyze content for relevance"
            ]
        },
        {
            "name": "2. Complete Pipeline",
            "description": "Run all phases in sequence",
            "steps": [
                "complete_pipeline → scraping → extraction → analysis",
                "Can skip phases with skip_phases parameter",
                "Supports test and production modes"
            ]
        },
        {
            "name": "3. Batch Processing", 
            "description": "Process multiple municipalities",
            "steps": [
                "run_on_multiple → Process specific municipalities",
                "run_on_all → Process all active municipalities",
                "Supports parallel and sequential processing"
            ]
        },
        {
            "name": "4. Operation Modes",
            "description": "Different processing modes",
            "steps": [
                "test → Limited scope, safe testing",
                "production → Full processing",
                "resume → Continue from where left off"
            ]
        }
    ]
    
    for pattern in patterns:
        print(f"\n{pattern['name']}: {pattern['description']}")
        for step in pattern['steps']:
            print(f"  • {step}")


def main():
    """Run all examples"""
    print("Service Infrastructure Usage Examples")
    print("These examples show how to use the new service architecture")
    
    # Run examples
    example_direct_usage()
    example_json_request_format()
    example_response_format()
    example_usage_patterns()
    
    print("\n" + "=" * 60)
    print("Examples completed!")
    print("\nTo run the service:")
    print("python -m scrapers.service_manager")
    print("\nTo test the service:")
    print("python scrapers/test_services.py")
    print("=" * 60)


if __name__ == "__main__":
    main()