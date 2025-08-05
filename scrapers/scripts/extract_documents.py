#!/usr/bin/env python3
"""
Document extraction script

Extracts text content from PDF documents for specified municipalities.
This script is called by the API processing routes.
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.run_scrapers import main

if __name__ == '__main__':
    # Inject extract operation for this script
    if '--operation' not in sys.argv:
        sys.argv.extend(['--operation', 'extract'])
    main()