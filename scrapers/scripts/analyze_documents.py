#!/usr/bin/env python3
"""
Document analysis script

Analyzes document content for ADU relevance for specified municipalities.
This script is called by the API processing routes.
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.run_scrapers import main

if __name__ == '__main__':
    # Inject analyze operation for this script
    if '--operation' not in sys.argv:
        sys.argv.extend(['--operation', 'analyze'])
    main()