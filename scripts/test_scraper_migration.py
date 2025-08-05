#!/usr/bin/env python3
"""
Test Scraper Migration Script

This script tests that the scrapers can be imported and instantiated
with the new Supabase integration.
"""

import os
import sys
from pathlib import Path
from typing import List, Dict, Any
import importlib

# Add the project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Test import of key components
def test_imports():
    """Test that key components can be imported"""
    print("🧪 Testing imports...")
    
    try:
        # Test Supabase client import
        from scrapers.supabase_client import get_supabase_client, SupabaseClient
        print("   ✅ Supabase client imports successfully")
        
        # Test base scraper import
        from scrapers.base_supabase import BaseSupabaseScraper
        print("   ✅ BaseSupabaseScraper imports successfully")
        
        # Test municipality registry
        from scrapers.config.municipality_registry import get_registry
        print("   ✅ Municipality registry imports successfully")
        
        return True
        
    except ImportError as e:
        print(f"   ❌ Import error: {e}")
        return False


def test_scraper_instantiation():
    """Test instantiation of key scrapers"""
    print("\n🏗️  Testing scraper instantiation...")
    
    scrapers_to_test = [
        ('toronto_v2', 'TorontoScraperV2', 1),
        ('ottawa_v2', 'OttawaScraperV2', 2),
        ('hamilton_v2', 'HamiltonScraperV2', 3),
        ('mississauga_v2', 'MississaugaScraperV2', 4),
        ('ajax_v2', 'AjaxScraperV2', 101),
    ]
    
    successful = 0
    for module_name, class_name, municipality_id in scrapers_to_test:
        try:
            module = importlib.import_module(f'scrapers.{module_name}')
            scraper_class = getattr(module, class_name)
            
            # Try to instantiate (without running)
            scraper = scraper_class(municipality_id=municipality_id)
            
            # Check that it has required attributes
            assert hasattr(scraper, 'supabase_client')
            assert hasattr(scraper, 'municipality_id')
            assert hasattr(scraper, 'run_scrape')
            
            print(f"   ✅ {module_name} ({class_name}) instantiated successfully")
            successful += 1
            
        except Exception as e:
            print(f"   ❌ {module_name} failed: {e}")
    
    print(f"   📊 {successful}/{len(scrapers_to_test)} scrapers instantiated successfully")
    return successful == len(scrapers_to_test)


def test_municipality_registry():
    """Test municipality registry functionality"""
    print("\n📋 Testing municipality registry...")
    
    try:
        from scrapers.config.municipality_registry import get_registry
        
        registry = get_registry()
        
        # Test basic functionality
        municipalities = registry.get_all_municipalities(active_only=True)
        print(f"   📊 Found {len(municipalities)} active municipalities")
        
        # Test specific municipality lookup
        toronto_config = registry.get_municipality(1)
        if toronto_config:
            print(f"   ✅ Toronto config: {toronto_config.name} -> {toronto_config.scraper_module}")
        else:
            print("   ❌ Could not find Toronto configuration")
            return False
        
        # Test scraper class loading
        scraper_class = registry.get_scraper_class(1)
        if scraper_class:
            print(f"   ✅ Toronto scraper class loaded: {scraper_class.__name__}")
        else:
            print("   ❌ Could not load Toronto scraper class")
            return False
        
        return True
        
    except Exception as e:
        print(f"   ❌ Municipality registry test failed: {e}")
        return False


def test_environment_setup():
    """Test that required environment variables are available"""
    print("\n🔧 Testing environment setup...")
    
    required_vars = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY'
    ]
    
    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        print(f"   ⚠️  Missing environment variables: {', '.join(missing_vars)}")
        print("   💡 Set these variables to test Supabase connectivity")
        return False
    else:
        print("   ✅ All required environment variables are set")
        return True


def test_supabase_connectivity():
    """Test Supabase connectivity (if environment is set up)"""
    print("\n🔗 Testing Supabase connectivity...")
    
    if not test_environment_setup():
        print("   ⏭️  Skipping connectivity test (environment not configured)")
        return True  # Don't fail the test suite for this
    
    try:
        from scrapers.supabase_client import get_supabase_client
        
        client = get_supabase_client()
        
        # Try to get municipality info (read-only test)
        municipality_info = client.get_municipality_info(1)  # Toronto
        
        if municipality_info:
            print(f"   ✅ Successfully connected to Supabase")
            print(f"   📊 Test municipality: {municipality_info.get('name', 'Unknown')}")
            return True
        else:
            print("   ⚠️  Connected but no municipality data found")
            return True  # Don't fail - might be empty database
            
    except Exception as e:
        print(f"   ❌ Supabase connectivity test failed: {e}")
        return False


def test_file_structure():
    """Test that required files and directories exist"""
    print("\n📁 Testing file structure...")
    
    required_files = [
        'scrapers/__init__.py',
        'scrapers/base_supabase.py',
        'scrapers/supabase_client.py',
        'scrapers/config/__init__.py',
        'scrapers/config/municipality_registry.py',
        'scrapers/toronto_v2.py',
        'migrations/20250805_create_scrapers_table.sql',
        'scripts/populate_scrapers_table.py',
        'requirements.txt'
    ]
    
    missing_files = []
    for file_path in required_files:
        full_path = project_root / file_path
        if not full_path.exists():
            missing_files.append(file_path)
    
    if missing_files:
        print(f"   ❌ Missing files: {', '.join(missing_files)}")
        return False
    else:
        print(f"   ✅ All {len(required_files)} required files exist")
        return True


def create_test_report(test_results: Dict[str, bool]):
    """Create a test report"""
    report_file = project_root / 'tmp' / 'scraper_migration_test_report.txt'
    report_file.parent.mkdir(exist_ok=True)
    
    try:
        with open(report_file, 'w') as f:
            f.write("Scraper Migration Test Report\n")
            f.write("=" * 40 + "\n\n")
            
            total_tests = len(test_results)
            passed_tests = sum(test_results.values())
            
            f.write(f"Test Summary: {passed_tests}/{total_tests} tests passed\n\n")
            
            for test_name, passed in test_results.items():
                status = "✅ PASS" if passed else "❌ FAIL"
                f.write(f"{status} {test_name}\n")
            
            f.write("\nDetailed Results:\n")
            f.write("-" * 20 + "\n")
            
            if all(test_results.values()):
                f.write("\n🎉 All tests passed! Migration appears successful.\n")
                f.write("\nNext steps:\n")
                f.write("1. Run: python scripts/populate_scrapers_table.py\n")
                f.write("2. Test individual scrapers\n")
                f.write("3. Set up environment variables if not already done\n")
            else:
                f.write("\n⚠️  Some tests failed. Review the issues above.\n")
                f.write("\nTroubleshooting:\n")
                f.write("- Check import paths\n")
                f.write("- Verify file permissions\n")
                f.write("- Ensure environment variables are set\n")
        
        print(f"📄 Test report saved to {report_file}")
        
    except Exception as e:
        print(f"❌ Error creating test report: {e}")


def main():
    """Run all migration tests"""
    print("🧪 Scraper Migration Test Suite")
    print("=" * 50)
    
    test_results = {}
    
    # Run all tests
    test_results["File Structure"] = test_file_structure()
    test_results["Imports"] = test_imports()
    test_results["Municipality Registry"] = test_municipality_registry()
    test_results["Scraper Instantiation"] = test_scraper_instantiation()
    test_results["Environment Setup"] = test_environment_setup()
    test_results["Supabase Connectivity"] = test_supabase_connectivity()
    
    # Calculate results
    total_tests = len(test_results)
    passed_tests = sum(test_results.values())
    
    print(f"\n📊 Test Summary: {passed_tests}/{total_tests} tests passed")
    
    # Show individual results
    print("\n📋 Individual Results:")
    for test_name, passed in test_results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"   {status} {test_name}")
    
    # Create detailed report
    create_test_report(test_results)
    
    # Final verdict
    if all(test_results.values()):
        print("\n🎉 All tests passed! Migration appears successful.")
        print("\n🔧 Next steps:")
        print("   1. Run: python scripts/populate_scrapers_table.py")
        print("   2. Test individual scrapers")
        print("   3. Set up environment variables if not already done")
        return 0
    else:
        print("\n⚠️  Some tests failed. Please review the issues above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())