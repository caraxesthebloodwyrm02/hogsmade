#!/usr/bin/env python3
"""
Automatic Unicode Fix Script for Hybrid Income Project
"""

import os
import re

def fix_file_unicode(file_path, replacements):
    """Apply Unicode replacements to a file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Apply replacements
        for unicode_char, replacement in replacements.items():
            content = content.replace(unicode_char, replacement)
        
        # Write back if changed
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Fixed {file_path}")
            return True
        else:
            print(f"No changes needed for {file_path}")
            return False
            
    except Exception as e:
        print(f"Error fixing {file_path}: {e}")
        return False

def main():
    """Apply Unicode fixes to all files"""
    
    # Define replacements
    emoji_replacements = {
        "✓": "PASS",
        "✗": "FAIL", 
        "✅": "PASS",
        "❌": "FAIL",
        "⚠": "WARNING",
        "💡": "INFO"
    }
    
    unicode_replacements = {
        "৳": "BDT",
        "•": "*"
    }
    
    # Files to fix (excluding core model files)
    files_to_fix = [
        "test_hybrid_income.py",
        "fstring_debug_guide.py", 
        "fstring_fixes_for_hybrid_income.py",
        "trim_whitespace.py",
        "debug_log.py"
    ]
    
    print("Applying Unicode fixes...")
    
    for file_path in files_to_fix:
        if os.path.exists(file_path):
            # Apply emoji fixes
            fix_file_unicode(file_path, emoji_replacements)
            # Apply Unicode fixes
            fix_file_unicode(file_path, unicode_replacements)
        else:
            print(f"File not found: {file_path}")
    
    print("Unicode fixes completed!")

if __name__ == "__main__":
    main()