#!/usr/bin/env python3
"""
Populate Scrapers Table Migration Script

This script populates the scrapers table with all available scrapers
from the municipality registry, mapping each scraper to its municipality.
"""

import os
import sys
from pathlib import Path
from typing import List, Dict, Any
import json
from datetime import datetime

# Add the project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

try:
    from scrapers.config.municipality_registry import get_registry, MunicipalityConfig
    from scrapers.supabase_client import get_supabase_client
except ImportError as e:
    print(f"Error importing modules: {e}")
    print("Make sure you're running this from the project root directory")
    sys.exit(1)


def get_scraper_version(scraper_module: str) -> str:
    """Determine scraper version from module name"""
    if '_v2' in scraper_module:
        return 'V2'
    elif '_new' in scraper_module:
        return 'New'
    elif '_enhanced' in scraper_module:
        return 'Enhanced'
    elif '_improved' in scraper_module:
        return 'Improved'
    else:
        return 'V1'


def get_all_scrapers() -> List[Dict[str, Any]]:
    """Get all scrapers from the registry and from filesystem discovery"""
    registry = get_registry()
    scrapers = []
    
    # Get scrapers from registry
    for municipality_id, config in registry.municipalities.items():
        scraper_data = {
            'name': config.scraper_module,
            'version': get_scraper_version(config.scraper_module),
            'status': 'validated' if config.active else 'pending',
            'municipality_id': municipality_id,
            'module_name': config.scraper_module,
            'class_name': config.scraper_class,
            'is_active': config.active,
            'estimated_pages': config.estimated_pages,
            'estimated_pdfs': config.estimated_pdfs,
            'priority': config.priority,
            'success_rate': 0.0,  # Will be updated as scrapers are tested
            'test_notes': f'Registry: {config.name}'
        }
        scrapers.append(scraper_data)
    
    # Discover additional scrapers from filesystem
    scrapers_dir = project_root / 'scrapers'
    discovered_scrapers = discover_additional_scrapers(scrapers_dir)
    
    # Add discovered scrapers that aren't in registry
    existing_modules = {s['module_name'] for s in scrapers}
    for discovered in discovered_scrapers:
        if discovered['module_name'] not in existing_modules:
            scrapers.append(discovered)
    
    return scrapers


def discover_additional_scrapers(scrapers_dir: Path) -> List[Dict[str, Any]]:
    """Discover additional scrapers from filesystem that might not be in registry"""
    discovered = []
    
    # Common scraper file patterns
    scraper_patterns = [
        '*_v2.py', '*_new.py', '*_enhanced.py', '*_improved.py',
        'ajax.py', 'brampton.py', 'burlington.py', 'caledon.py', 'hamilton.py',
        'markham.py', 'milton.py', 'mississauga.py', 'oakville.py', 'oshawa.py',
        'pickering.py', 'richmond_hill.py', 'toronto.py', 'vaughan.py', 'whitby.py'
    ]
    
    for pattern in scraper_patterns:
        for scraper_file in scrapers_dir.glob(pattern):
            if scraper_file.is_file() and not scraper_file.name.startswith('_'):
                module_name = scraper_file.stem
                
                # Skip base classes and utility files
                if module_name in ['base', 'base_v2', 'enhanced_base', 'template']:
                    continue
                
                # Try to determine municipality mapping
                municipality_id = guess_municipality_id(module_name)
                
                scraper_data = {
                    'name': module_name,
                    'version': get_scraper_version(module_name),
                    'status': 'pending',  # Need to test discovered scrapers
                    'municipality_id': municipality_id,
                    'module_name': module_name,
                    'class_name': guess_class_name(module_name),
                    'is_active': False,  # Inactive until validated
                    'estimated_pages': 5,  # Conservative estimate
                    'estimated_pdfs': 50,  # Conservative estimate
                    'priority': 2,  # Lower priority for discovered scrapers
                    'success_rate': None,
                    'test_notes': 'Discovered from filesystem - needs validation'
                }
                discovered.append(scraper_data)
    
    return discovered


def guess_municipality_id(module_name: str) -> int:
    """Guess municipality ID from module name"""
    # Map module names to probable municipality IDs
    municipality_mapping = {
        'toronto': 1, 'toronto_v2': 1, 'toronto_new': 1, 'toronto_enhanced': 1,
        'ottawa': 2, 'ottawa_v2': 2,
        'hamilton': 3, 'hamilton_v2': 3, 'hamilton_new': 3,
        'mississauga': 4, 'mississauga_v2': 4, 'mississauga_new': 4,
        'brampton': 5, 'brampton_v2': 5, 'brampton_new': 5,
        'markham': 6, 'markham_v2': 6, 'markham_new': 6,
        'vaughan': 7, 'vaughan_v2': 7, 'vaughan_new': 7,
        'richmond_hill': 8, 'richmond_hill_v2': 8, 'richmond_hill_new': 8,
        'oakville': 9, 'oakville_v2': 9, 'oakville_new': 9,
        'burlington': 10, 'burlington_v2': 10, 'burlington_new': 10,
        'milton': 11, 'milton_v2': 11, 'milton_new': 11,
        'pickering': 12, 'pickering_v2': 12, 'pickering_new': 12,
        'whitby': 13, 'whitby_v2': 13, 'whitby_new': 13, 'whitby_improved': 13,
        'oshawa': 14, 'oshawa_v2': 14,
        'caledon': 15, 'caledon_v2': 15, 'caledon_new': 15,
        'kitchener': 16, 'kitchener_v2': 16,
        'barrie': 17, 'barrie_v2': 17,
        'brantford': 18, 'brantford_v2': 18,
        'peterborough': 19, 'peterborough_v2': 19,
        'niagarafalls': 20, 'niagarafalls_v2': 20,
        'sudbury': 21, 'sudbury_v2': 21,
        'ajax': 101, 'ajax_v2': 101, 'ajax_new': 101,
    }
    
    return municipality_mapping.get(module_name, 999)  # 999 for unknown


def guess_class_name(module_name: str) -> str:
    """Guess class name from module name"""
    # Convert module name to class name
    parts = module_name.split('_')
    class_parts = []
    
    for part in parts:
        if part.lower() in ['v2', 'new', 'enhanced', 'improved']:
            class_parts.append(part.upper() if part.lower() == 'v2' else part.capitalize())
        else:
            class_parts.append(part.capitalize())
    
    return ''.join(class_parts) + 'Scraper'


def populate_scrapers_table():
    """Populate the scrapers table with all discovered scrapers"""
    try:
        # Get Supabase client
        client = get_supabase_client()
        
        print("🔍 Discovering scrapers...")
        scrapers = get_all_scrapers()
        
        print(f"📊 Found {len(scrapers)} scrapers")
        
        # Clear existing scrapers (optional - remove if you want to preserve data)
        print("🧹 Clearing existing scrapers table...")
        result = client.supabase.table('scrapers').delete().neq('id', 0).execute()
        print(f"   Cleared {len(result.data) if result.data else 0} existing records")
        
        # Insert scrapers
        print("📥 Inserting scrapers...")
        inserted_count = 0
        errors = []
        
        for scraper in scrapers:
            try:
                result = client.supabase.table('scrapers').insert(scraper).execute()
                if result.data:
                    inserted_count += 1
                    print(f"   ✅ {scraper['name']} -> Municipality {scraper['municipality_id']}")
                else:
                    errors.append(f"Failed to insert {scraper['name']}: No data returned")
                    
            except Exception as e:
                errors.append(f"Failed to insert {scraper['name']}: {e}")
                print(f"   ❌ {scraper['name']}: {e}")
        
        print(f"\n📈 Summary:")
        print(f"   ✅ Successfully inserted: {inserted_count}")
        print(f"   ❌ Errors: {len(errors)}")
        
        if errors:
            print(f"\n🚨 Errors:")
            for error in errors:
                print(f"   - {error}")
        
        # Show statistics
        print(f"\n📊 Scraper Statistics:")
        version_counts = {}
        status_counts = {}
        
        for scraper in scrapers:
            version = scraper['version']
            status = scraper['status']
            
            version_counts[version] = version_counts.get(version, 0) + 1
            status_counts[status] = status_counts.get(status, 0) + 1
        
        print(f"   By Version: {dict(sorted(version_counts.items()))}")
        print(f"   By Status: {dict(sorted(status_counts.items()))}")
        
        # Export scrapers data for reference
        export_file = project_root / 'tmp' / 'scrapers_export.json'
        export_file.parent.mkdir(exist_ok=True)
        
        with open(export_file, 'w') as f:
            json.dump(scrapers, f, indent=2, default=str)
        
        print(f"\n💾 Exported scrapers data to {export_file}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error populating scrapers table: {e}")
        return False


def verify_population():
    """Verify that the scrapers table was populated correctly"""
    try:
        client = get_supabase_client()
        
        print("\n🔍 Verifying scrapers table population...")
        
        # Get all scrapers from database
        result = client.supabase.table('scrapers').select('*').execute()
        
        if not result.data:
            print("❌ No scrapers found in database")
            return False
        
        scrapers = result.data
        print(f"✅ Found {len(scrapers)} scrapers in database")
        
        # Group by municipality
        municipality_groups = {}
        for scraper in scrapers:
            municipality_id = scraper['municipality_id']
            if municipality_id not in municipality_groups:
                municipality_groups[municipality_id] = []
            municipality_groups[municipality_id].append(scraper)
        
        print(f"\n📊 Scrapers by Municipality:")
        for municipality_id, group_scrapers in sorted(municipality_groups.items()):
            municipality_name = f"Municipality {municipality_id}"
            # Try to get actual municipality name from registry
            registry = get_registry()
            config = registry.get_municipality(municipality_id)
            if config:
                municipality_name = config.name
            
            print(f"   {municipality_name} ({municipality_id}): {len(group_scrapers)} scrapers")
            for scraper in group_scrapers:
                status_emoji = "✅" if scraper['is_active'] else "⏸️"
                print(f"     {status_emoji} {scraper['name']} ({scraper['version']}) - {scraper['status']}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error verifying scrapers table: {e}")
        return False


def main():
    """Main migration script"""
    print("🚀 Starting Scrapers Table Population")
    print("=" * 50)
    
    # Check environment variables
    if not os.getenv('NEXT_PUBLIC_SUPABASE_URL') or not os.getenv('SUPABASE_SERVICE_ROLE_KEY'):
        print("❌ Missing required environment variables:")
        print("   - NEXT_PUBLIC_SUPABASE_URL")
        print("   - SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    
    # Populate table
    success = populate_scrapers_table()
    
    if success:
        # Verify population
        verify_population()
        print("\n🎉 Scrapers table population completed successfully!")
    else:
        print("\n❌ Scrapers table population failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()