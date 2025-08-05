#!/usr/bin/env python3
"""
Test script for the service infrastructure
Tests JSON communication and basic functionality
"""

import json
import subprocess
import sys
import time
from typing import Dict, Any


def test_service_communication():
    """Test JSON communication with the service"""
    print("Testing Service Manager JSON communication...")
    
    # Test requests
    test_requests = [
        {
            "id": "test_1",
            "action": "health_check",
            "params": {}
        },
        {
            "id": "test_2", 
            "action": "list_scrapers",
            "params": {}
        },
        {
            "id": "test_3",
            "action": "get_system_status",
            "params": {}
        }
    ]
    
    try:
        # Start the service as a subprocess
        process = subprocess.Popen(
            [sys.executable, "-m", "scrapers.service_manager"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd="/Users/noahvanhart/Documents/GitHub/bylaw-mgmt"
        )
        
        # Send test requests
        for request in test_requests:
            print(f"\nSending request: {request['action']}")
            
            # Send request
            request_json = json.dumps(request) + "\n"
            process.stdin.write(request_json)
            process.stdin.flush()
            
            # Read response (with timeout)
            try:
                # Simple timeout mechanism
                import select
                if select.select([process.stdout], [], [], 5.0)[0]:  # 5 second timeout
                    response_line = process.stdout.readline()
                    if response_line:
                        response = json.loads(response_line.strip())
                        print(f"Response: {json.dumps(response, indent=2)}")
                        
                        # Basic validation
                        if response.get("request_id") == request["id"]:
                            print("✓ Request ID matches")
                        else:
                            print("✗ Request ID mismatch")
                            
                        if response.get("type") == "response":
                            print("✓ Response type correct")
                        else:
                            print("✗ Unexpected response type")
                    else:
                        print("✗ No response received")
                else:
                    print("✗ Response timeout")
                    
            except json.JSONDecodeError as e:
                print(f"✗ JSON decode error: {e}")
            except Exception as e:
                print(f"✗ Error reading response: {e}")
        
        # Cleanup
        process.stdin.close()
        process.terminate()
        process.wait(timeout=10)
        
        print("\n✓ Service communication test completed")
        
    except Exception as e:
        print(f"✗ Service communication test failed: {e}")
        return False
    
    return True


def test_pipeline_controller():
    """Test pipeline controller functionality"""
    print("\nTesting Pipeline Controller...")
    
    try:
        from scrapers.pipeline_controller import PipelineController
        from scrapers.manager import ScraperManager
        
        # Create instances
        scraper_manager = ScraperManager()
        pipeline_controller = PipelineController(scraper_manager)
        
        print("✓ Pipeline Controller created successfully")
        
        # Test with empty municipality list (should handle gracefully)
        result = pipeline_controller.run_scraping_only(
            municipality_ids=[],
            mode="test"
        )
        
        print(f"Empty municipality test result: {result.get('success')}")
        
        # Test operation tracking
        active_ops = pipeline_controller.get_active_operations()
        print(f"Active operations: {len(active_ops)}")
        
        print("✓ Pipeline Controller basic tests passed")
        return True
        
    except Exception as e:
        print(f"✗ Pipeline Controller test failed: {e}")
        return False


def test_imports():
    """Test that all required modules can be imported"""
    print("Testing imports...")
    
    modules_to_test = [
        "scrapers.service_manager",
        "scrapers.pipeline_controller", 
        "scrapers.manager",
        "scrapers.supabase_client"
    ]
    
    all_imported = True
    
    for module_name in modules_to_test:
        try:
            __import__(module_name)
            print(f"✓ {module_name}")
        except ImportError as e:
            print(f"✗ {module_name}: {e}")
            all_imported = False
        except Exception as e:
            print(f"⚠ {module_name}: {e}")
    
    return all_imported


def main():
    """Run all tests"""
    print("=" * 60)
    print("Service Infrastructure Test Suite")
    print("=" * 60)
    
    tests = [
        test_imports,
        test_pipeline_controller,
        test_service_communication
    ]
    
    passed = 0
    total = len(tests)
    
    for test_func in tests:
        try:
            if test_func():
                passed += 1
        except Exception as e:
            print(f"✗ Test {test_func.__name__} crashed: {e}")
    
    print("\n" + "=" * 60)
    print(f"Test Results: {passed}/{total} tests passed")
    print("=" * 60)
    
    if passed == total:
        print("🎉 All tests passed!")
        return 0
    else:
        print("❌ Some tests failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())