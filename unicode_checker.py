#!/usr/bin/env python3
"""
Unicode, ASCII, and Emoji Error Checker
Comprehensive analysis of character encoding issues
"""

import os
import sys
import re
from pathlib import Path
from typing import Dict, List, Any, Tuple
import unicodedata

class UnicodeChecker:
    """Comprehensive Unicode and character encoding checker"""
    
    def __init__(self):
        self.issues = []
        self.stats = {
            "files_checked": 0,
            "total_chars": 0,
            "ascii_chars": 0,
            "unicode_chars": 0,
            "emoji_chars": 0,
            "problematic_chars": 0
        }
    
    def check_file(self, file_path: str) -> Dict[str, Any]:
        """Check a single file for Unicode/ASCII/emoji issues"""
        result = {
            "file": file_path,
            "exists": False,
            "encoding_issues": [],
            "emoji_usage": [],
            "unicode_chars": [],
            "problematic_chars": [],
            "line_issues": {},
            "summary": {
                "total_lines": 0,
                "total_chars": 0,
                "ascii_only": True,
                "has_emoji": False,
                "has_unicode": False
            }
        }
        
        try:
            path = Path(file_path)
            result["exists"] = path.exists()
            
            if not result["exists"]:
                return result
            
            # Read file with UTF-8 encoding
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            result["summary"]["total_lines"] = len(lines)
            
            for line_num, line in enumerate(lines, 1):
                line_issues = []
                line_chars = []
                
                for char_pos, char in enumerate(line):
                    self.stats["total_chars"] += 1
                    result["summary"]["total_chars"] += 1
                    
                    # Check character type
                    char_info = self.analyze_character(char)
                    
                    if char_info["is_emoji"]:
                        result["summary"]["has_emoji"] = True
                        result["emoji_usage"].append({
                            "line": line_num,
                            "position": char_pos,
                            "char": char,
                            "name": char_info["name"],
                            "category": char_info["category"]
                        })
                        self.stats["emoji_chars"] += 1
                        line_issues.append(f"Emoji: {char} ({char_info['name']})")
                    
                    elif char_info["is_unicode"]:
                        result["summary"]["has_unicode"] = True
                        result["summary"]["ascii_only"] = False
                        result["unicode_chars"].append({
                            "line": line_num,
                            "position": char_pos,
                            "char": char,
                            "name": char_info["name"],
                            "category": char_info["category"]
                        })
                        self.stats["unicode_chars"] += 1
                        
                        # Check for potentially problematic Unicode
                        if char_info["is_problematic"]:
                            result["problematic_chars"].append({
                                "line": line_num,
                                "position": char_pos,
                                "char": char,
                                "name": char_info["name"],
                                "issue": char_info["issue"]
                            })
                            self.stats["problematic_chars"] += 1
                            line_issues.append(f"Problematic: {char} ({char_info['issue']})")
                    
                    else:
                        self.stats["ascii_chars"] += 1
                
                if line_issues:
                    result["line_issues"][line_num] = line_issues
            
        except UnicodeDecodeError as e:
            result["encoding_issues"].append(f"UnicodeDecodeError: {e}")
        except Exception as e:
            result["encoding_issues"].append(f"File read error: {e}")
        
        return result
    
    def analyze_character(self, char: str) -> Dict[str, Any]:
        """Analyze a single character for Unicode properties"""
        char_info = {
            "char": char,
            "is_ascii": ord(char) < 128,
            "is_unicode": ord(char) >= 128,
            "is_emoji": False,
            "is_problematic": False,
            "name": "",
            "category": "",
            "issue": ""
        }
        
        try:
            # Get Unicode name
            char_info["name"] = unicodedata.name(char, "UNKNOWN")
            char_info["category"] = unicodedata.category(char)
            
            # Check if it's an emoji
            if char_info["category"] in ['So', 'Sk'] or 'EMOJI' in char_info["name"]:
                char_info["is_emoji"] = True
            
            # Check for problematic characters
            if char_info["is_unicode"]:
                # Check for common problematic Unicode characters
                problematic_chars = {
                    '\u2018': 'Left single quotation mark',
                    '\u2019': 'Right single quotation mark', 
                    '\u201c': 'Left double quotation mark',
                    '\u201d': 'Right double quotation mark',
                    '\u2013': 'En dash',
                    '\u2014': 'Em dash',
                    '\u2026': 'Horizontal ellipsis',
                    '\u00a0': 'Non-breaking space',
                    '\u200b': 'Zero-width space',
                    '\u200e': 'Left-to-right mark',
                    '\u200f': 'Right-to-left mark',
                    '\u202d': 'Left-to-right override',
                    '\u202e': 'Right-to-left override'
                }
                
                if char in problematic_chars:
                    char_info["is_problematic"] = True
                    char_info["issue"] = problematic_chars[char]
                
                # Check for invisible characters
                if char_info["category"] == 'Cf':  # Format characters
                    char_info["is_problematic"] = True
                    char_info["issue"] = "Invisible format character"
                
                # Check for control characters (except newline/tab)
                if char_info["category"] == 'Cc' and char not in ['\n', '\t', '\r']:
                    char_info["is_problematic"] = True
                    char_info["issue"] = "Control character"
        
        except Exception:
            pass
        
        return char_info
    
    def check_project_files(self, directory: str = ".") -> Dict[str, Any]:
        """Check all Python files in the project"""
        self.issues = []
        self.stats = {
            "files_checked": 0,
            "total_chars": 0,
            "ascii_chars": 0,
            "unicode_chars": 0,
            "emoji_chars": 0,
            "problematic_chars": 0
        }
        
        # Core project files to check
        core_files = [
            "hybrid_income_model.py",
            "test_hybrid_income.py", 
            "fastapi_hybrid_income.py",
            "fstring_debug_guide.py",
            "fstring_fixes_for_hybrid_income.py",
            "trim_whitespace.py",
            "debug_log.py"
        ]
        
        results = {
            "timestamp": self.get_timestamp(),
            "files_analyzed": {},
            "summary": {
                "total_files": len(core_files),
                "files_with_issues": 0,
                "files_ascii_only": 0,
                "files_with_emoji": 0,
                "files_with_unicode": 0,
                "files_with_encoding_errors": 0
            },
            "issues": {
                "encoding_errors": [],
                "emoji_usage": [],
                "problematic_unicode": [],
                "unicode_chars": []
            }
        }
        
        for file_path in core_files:
            print(f"Checking {file_path}...")
            file_result = self.check_file(file_path)
            results["files_analyzed"][file_path] = file_result
            
            if file_result["exists"]:
                self.stats["files_checked"] += 1
                
                # Update summary
                if file_result["encoding_issues"]:
                    results["summary"]["files_with_encoding_errors"] += 1
                    results["issues"]["encoding_errors"].extend([
                        f"{file_path}: {issue}" for issue in file_result["encoding_issues"]
                    ])
                
                if file_result["summary"]["ascii_only"]:
                    results["summary"]["files_ascii_only"] += 1
                
                if file_result["summary"]["has_emoji"]:
                    results["summary"]["files_with_emoji"] += 1
                    results["issues"]["emoji_usage"].extend([
                        f"{file_path} line {emoji['line']}: {emoji['char']} ({emoji['name']})"
                        for emoji in file_result["emoji_usage"]
                    ])
                
                if file_result["summary"]["has_unicode"]:
                    results["summary"]["files_with_unicode"] += 1
                    results["issues"]["unicode_chars"].extend([
                        f"{file_path} line {char['line']}: {char['char']} ({char['name']})"
                        for char in file_result["unicode_chars"]
                    ])
                
                if file_result["problematic_chars"]:
                    results["summary"]["files_with_issues"] += 1
                    results["issues"]["problematic_unicode"].extend([
                        f"{file_path} line {char['line']}: {char['char']} ({char['issue']})"
                        for char in file_result["problematic_chars"]
                    ])
        
        return results
    
    def generate_report(self, results: Dict[str, Any]) -> str:
        """Generate comprehensive Unicode/ASCII report"""
        report = f"""
UNICODE, ASCII & EMOJI ANALYSIS REPORT
Generated: {results['timestamp']}

=== OVERVIEW ===
Files Analyzed: {results['summary']['total_files']}
Files with Issues: {results['summary']['files_with_issues']}
Files ASCII Only: {results['summary']['files_ascii_only']}
Files with Emoji: {results['summary']['files_with_emoji']}
Files with Unicode: {results['summary']['files_with_unicode']}
Files with Encoding Errors: {results['summary']['files_with_encoding_errors']}

=== CHARACTER STATISTICS ===
Total Characters: {self.stats['total_chars']}
ASCII Characters: {self.stats['ascii_chars']} ({self.stats['ascii_chars']/max(self.stats['total_chars'],1)*100:.1f}%)
Unicode Characters: {self.stats['unicode_chars']} ({self.stats['unicode_chars']/max(self.stats['total_chars'],1)*100:.1f}%)
Emoji Characters: {self.stats['emoji_chars']}
Problematic Characters: {self.stats['problematic_chars']}

"""
        
        # Add encoding errors
        if results["issues"]["encoding_errors"]:
            report += "=== ENCODING ERRORS ===\n"
            for error in results["issues"]["encoding_errors"]:
                report += f"- {error}\n"
            report += "\n"
        
        # Add emoji usage
        if results["issues"]["emoji_usage"]:
            report += "=== EMOJI USAGE ===\n"
            for emoji in results["issues"]["emoji_usage"]:
                report += f"- {emoji}\n"
            report += "\n"
        
        # Add problematic Unicode
        if results["issues"]["problematic_unicode"]:
            report += "=== PROBLEMATIC UNICODE CHARACTERS ===\n"
            for char in results["issues"]["problematic_unicode"]:
                report += f"- {char}\n"
            report += "\n"
        
        # Add Unicode characters (non-problematic)
        if results["issues"]["unicode_chars"]:
            report += "=== UNICODE CHARACTERS (Non-Problematic) ===\n"
            for char in results["issues"]["unicode_chars"][:10]:  # Limit to first 10
                report += f"- {char}\n"
            if len(results["issues"]["unicode_chars"]) > 10:
                report += f"... and {len(results['issues']['unicode_chars']) - 10} more\n"
            report += "\n"
        
        # File-by-file analysis
        report += "=== FILE-BY-FILE ANALYSIS ===\n"
        for file_name, file_data in results["files_analyzed"].items():
            if not file_data["exists"]:
                report += f"{file_name}: FILE NOT FOUND\n"
                continue
            
            status = "OK"
            issues = []
            
            if file_data["encoding_issues"]:
                status = "ERROR"
                issues.append("Encoding errors")
            if file_data["problematic_chars"]:
                status = "WARNING"
                issues.append("Problematic Unicode")
            if file_data["summary"]["has_emoji"]:
                if status == "OK":
                    status = "INFO"
                issues.append("Contains emoji")
            
            report += f"{file_name}: {status}"
            if issues:
                report += f" ({', '.join(issues)})"
            report += f" [{file_data['summary']['total_chars']} chars]\n"
        
        # Recommendations
        report += "\n=== RECOMMENDATIONS ===\n"
        
        if results["summary"]["files_with_encoding_errors"] > 0:
            report += "⚠️ Fix encoding errors before proceeding\n"
        
        if results["summary"]["files_with_issues"] > 0:
            report += "⚠️ Review and fix problematic Unicode characters\n"
        
        if results["summary"]["files_with_emoji"] > 0:
            report += "ℹ️ Consider if emoji usage is appropriate for production code\n"
        
        if results["summary"]["files_ascii_only"] == results["summary"]["total_files"]:
            report += "✅ All files use ASCII only - maximum compatibility\n"
        elif results["summary"]["files_with_unicode"] > 0:
            report += "ℹ️ Unicode characters detected - ensure UTF-8 encoding throughout\n"
        
        return report
    
    def get_timestamp(self) -> str:
        """Get current timestamp"""
        from datetime import datetime
        return datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    def fix_common_issues(self, file_path: str) -> bool:
        """Attempt to fix common Unicode issues"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Common fixes
            fixes = {
                '\u2018': "'",  # Left single quote
                '\u2019': "'",  # Right single quote
                '\u201c': '"',  # Left double quote
                '\u201d': '"',  # Right double quote
                '\u2013': '-',  # En dash
                '\u2014': '--', # Em dash
                '\u2026': '...', # Ellipsis
                '\u00a0': ' ',  # Non-breaking space
                '\u200b': '',   # Zero-width space
            }
            
            original_content = content
            for problematic, replacement in fixes.items():
                content = content.replace(problematic, replacement)
            
            if content != original_content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                return True
            
        except Exception as e:
            print(f"Error fixing {file_path}: {e}")
        
        return False

def main():
    """Main Unicode checker execution"""
    checker = UnicodeChecker()
    
    print("UNICODE, ASCII & EMOJI CHECKER")
    print("=" * 50)
    
    # Check all project files
    results = checker.check_project_files()
    
    # Generate report
    report = checker.generate_report(results)
    
    # Save report
    with open("unicode_analysis_report.txt", "w", encoding="utf-8") as f:
        f.write(report)
    
    # Print summary
    print(report)
    
    # Ask if user wants to fix issues
    if results["summary"]["files_with_issues"] > 0:
        print("\nWould you like to attempt automatic fixes for common Unicode issues? (y/n)")
        # Note: In automated script, we'll just show what would be fixed
        print("Automatic fixes available for:")
        print("- Smart quotes → regular quotes")
        print("- En/em dashes → regular dashes") 
        print("- Ellipsis → three dots")
        print("- Non-breaking spaces → regular spaces")
        print("- Zero-width spaces → removed")
    
    print(f"\nDetailed report saved to: unicode_analysis_report.txt")
    return 0

if __name__ == "__main__":
    sys.exit(main())
