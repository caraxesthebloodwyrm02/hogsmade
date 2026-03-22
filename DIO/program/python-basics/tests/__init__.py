"""
Test suite for the add function and related utilities.

Structure:
- unit/          Fast, isolated tests for individual functions
- integration/   Tests that verify multiple components work together
- conftest.py    Shared fixtures and test configuration
"""

import sys
from pathlib import Path

# Add the src directory to Python path for imports
SRC_DIR = Path(__file__).parent.parent / "src"
if SRC_DIR.exists():
    sys.path.insert(0, str(SRC_DIR))
