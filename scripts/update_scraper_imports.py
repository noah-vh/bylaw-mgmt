#!/usr/bin/env python3
"""
Update Scraper Imports Migration Script

This script updates all scrapers to use the new Supabase-integrated base class
and fixes import paths for the new directory structure.
"""

import os
import re
from pathlib import Path
from typing import List, Tuple
import sys

# Add the project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def find_scraper_files() -> List[Path]:
    """Find all scraper Python files"""
    scrapers_dir = project_root / 'scrapers'
    scraper_files = []
    
    # Patterns for scraper files
    patterns = [
        '*_v2.py', '*_new.py', '*_enhanced.py', '*_improved.py',
        'ajax.py', 'brampton.py', 'burlington.py', 'caledon.py', 'hamilton.py',
        'markham.py', 'milton.py', 'mississauga.py', 'oakville.py', 'oshawa.py',
        'pickering.py', 'richmond_hill.py', 'toronto.py', 'vaughan.py', 'whitby.py'
    ]
    
    for pattern in patterns:
        for file_path in scrapers_dir.glob(pattern):
            if file_path.is_file() and not file_path.name.startswith('_'):
                # Skip base classes and utility files
                if file_path.stem not in ['base', 'base_v2', 'base_supabase', 'enhanced_base', 'template']:
                    scraper_files.append(file_path)
    
    return scraper_files


def update_imports_in_file(file_path: Path) -> bool:
    """Update imports in a single scraper file"""
    try:
        # Read the file
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        changes_made = []
        
        # Update base class imports
        import_replacements = [
            # Replace base_v2 imports with base_supabase
            (r'from \.base_v2 import BaseScraperV2', 'from .base_supabase import BaseSupabaseScraper'),
            (r'from base_v2 import BaseScraperV2', 'from .base_supabase import BaseSupabaseScraper'),
            
            # Replace base imports with base_supabase for V1 scrapers
            (r'from \.base import BaseScraper', 'from .base_supabase import BaseSupabaseScraper'),
            (r'from base import BaseScraper', 'from .base_supabase import BaseSupabaseScraper'),
            
            # Replace enhanced_base imports
            (r'from \.enhanced_base import EnhancedBaseScraper', 'from .base_supabase import BaseSupabaseScraper'),
            (r'from enhanced_base import EnhancedBaseScraper', 'from .base_supabase import BaseSupabaseScraper'),
        ]
        
        for old_pattern, new_import in import_replacements:
            if re.search(old_pattern, content):
                content = re.sub(old_pattern, new_import, content)
                changes_made.append(f"Updated import: {old_pattern} -> {new_import}")
        
        # Update class inheritance
        class_replacements = [
            (r'class (\w+)\(BaseScraperV2\):', r'class \1(BaseSupabaseScraper):'),
            (r'class (\w+)\(BaseScraper\):', r'class \1(BaseSupabaseScraper):'),
            (r'class (\w+)\(EnhancedBaseScraper\):', r'class \1(BaseSupabaseScraper):'),
        ]
        
        for old_pattern, new_pattern in class_replacements:
            if re.search(old_pattern, content):
                content = re.sub(old_pattern, new_pattern, content)
                changes_made.append(f"Updated class inheritance")
        
        # Remove Redis-related imports
        redis_imports_to_remove = [
            r'import redis.*\n',
            r'from redis import.*\n',
            r'from \.redis_client import.*\n',
            r'from redis_client import.*\n',
            r'from \.queue_manager import.*\n',
            r'from queue_manager import.*\n',
        ]
        
        for pattern in redis_imports_to_remove:
            if re.search(pattern, content):
                content = re.sub(pattern, '', content)
                changes_made.append("Removed Redis import")
        
        # Update progress reporting calls (if any hardcoded ones exist)
        progress_replacements = [
            # Replace Redis queue updates with Supabase progress updates
            (r'self\.redis_client\.update_progress', 'self._report_progress'),
            (r'redis_client\.update_progress', 'self._report_progress'),
            (r'queue_manager\.update_progress', 'self._report_progress'),
        ]
        
        for old_pattern, new_pattern in progress_replacements:
            if re.search(old_pattern, content):
                content = re.sub(old_pattern, new_pattern, content)
                changes_made.append("Updated progress reporting call")
        
        # Write back if changes were made
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            print(f"✅ Updated {file_path.name}:")
            for change in changes_made:
                print(f"   - {change}")
            return True
        else:
            print(f"⏸️  No changes needed for {file_path.name}")
            return False
            
    except Exception as e:
        print(f"❌ Error updating {file_path.name}: {e}")
        return False


def add_supabase_requirements():
    """Add supabase dependency to requirements.txt if not present"""
    requirements_file = project_root / 'requirements.txt'
    
    try:
        if requirements_file.exists():
            with open(requirements_file, 'r') as f:
                content = f.read()
            
            if 'supabase' not in content.lower():
                with open(requirements_file, 'a') as f:
                    f.write('\n# Supabase integration\nsupabase>=2.0.0\n')
                print("✅ Added supabase dependency to requirements.txt")
            else:
                print("⏸️  Supabase dependency already present in requirements.txt")
        else:
            # Create requirements.txt with supabase
            with open(requirements_file, 'w') as f:
                f.write('supabase>=2.0.0\n')
            print("✅ Created requirements.txt with supabase dependency")
            
    except Exception as e:
        print(f"❌ Error updating requirements.txt: {e}")


def create_migration_summary(updated_files: List[Path], total_files: int):
    """Create a summary of the migration"""
    summary_file = project_root / 'tmp' / 'scraper_import_migration_summary.txt'
    summary_file.parent.mkdir(exist_ok=True)
    
    try:
        with open(summary_file, 'w') as f:
            f.write("Scraper Import Migration Summary\n")
            f.write("=" * 40 + "\n\n")
            f.write(f"Total scrapers found: {total_files}\n")
            f.write(f"Files updated: {len(updated_files)}\n")
            f.write(f"Files unchanged: {total_files - len(updated_files)}\n\n")
            
            if updated_files:
                f.write("Updated files:\n")
                for file_path in updated_files:
                    f.write(f"  - {file_path.name}\n")
            
            f.write("\nChanges made:\n")
            f.write("  - Updated base class imports to use BaseSupabaseScraper\n")
            f.write("  - Updated class inheritance declarations\n")
            f.write("  - Removed Redis-related imports\n")
            f.write("  - Updated progress reporting calls\n")
            f.write("  - Fixed relative import paths\n")
            f.write("\nNext steps:\n")
            f.write("  1. Test scrapers with new Supabase integration\n")
            f.write("  2. Run populate_scrapers_table.py to update database\n")
            f.write("  3. Verify environment variables are set\n")
            f.write("  4. Test job creation and progress tracking\n")
        
        print(f"📄 Migration summary written to {summary_file}")
        
    except Exception as e:
        print(f"❌ Error creating migration summary: {e}")


def main():
    """Main migration script"""
    print("🚀 Starting Scraper Import Migration")
    print("=" * 50)
    
    # Find all scraper files
    print("🔍 Finding scraper files...")
    scraper_files = find_scraper_files()
    print(f"📊 Found {len(scraper_files)} scraper files")
    
    # Update imports in each file
    print("\n📝 Updating imports...")
    updated_files = []
    
    for file_path in scraper_files:
        if update_imports_in_file(file_path):
            updated_files.append(file_path)
    
    # Add supabase dependency
    print("\n📦 Updating dependencies...")
    add_supabase_requirements()
    
    # Create migration summary
    print("\n📄 Creating migration summary...")
    create_migration_summary(updated_files, len(scraper_files))
    
    # Final summary
    print(f"\n🎉 Migration completed!")
    print(f"   ✅ Updated: {len(updated_files)} files")
    print(f"   ⏸️  Unchanged: {len(scraper_files) - len(updated_files)} files")
    
    if updated_files:
        print(f"\n📋 Updated files:")
        for file_path in updated_files:
            print(f"   - {file_path.name}")
    
    print(f"\n🔧 Next steps:")
    print(f"   1. Test updated scrapers")
    print(f"   2. Run: python scripts/populate_scrapers_table.py")
    print(f"   3. Verify environment variables are set")
    print(f"   4. Test with: python -m scrapers.toronto_v2")


if __name__ == "__main__":
    main()