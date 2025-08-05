#!/usr/bin/env python3
"""
Simple script to output scraper registry information as JSON
Used by the Node.js API to get scraper metadata
"""

import json
import sys
from config.municipality_registry import get_registry

def main():
    try:
        registry = get_registry()
        
        # Build registry data for API consumption
        registry_data = {}
        
        for municipality_id, config in registry.municipalities.items():
            scraper_name = config.scraper_module
            registry_data[scraper_name] = {
                'id': municipality_id,
                'name': config.name,
                'scraper_module': config.scraper_module,
                'scraper_class': config.scraper_class,
                'active': config.active,
                'priority': config.priority,
                'estimated_pages': config.estimated_pages,
                'estimated_pdfs': config.estimated_pdfs,
                'version': 'v2',  # All current scrapers are v2
                'base_url': config.base_url,
                'notes': config.notes
            }
        
        # Output as JSON
        print(json.dumps(registry_data, indent=2))
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()