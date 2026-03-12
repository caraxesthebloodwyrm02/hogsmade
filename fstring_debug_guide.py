#!/usr/bin/env python3
"""
F-String Debugging Guide and Common Issues
Comprehensive guide to identifying and fixing f-string related problems
"""

import sys
from typing import Any, Dict, List


class FStringDebugger:
    """Utility class for debugging f-string issues"""

    def __init__(self):
        self.common_issues = {
            "missing_braces": "Missing curly braces {}",
            "mismatched_braces": "Mismatched curly braces",
            "undefined_variables": "Undefined variables in f-string",
            "type_errors": "Type conversion issues",
            "encoding_issues": "Character encoding problems",
            "nested_quotes": "Quote conflicts in f-strings",
            "format_specifiers": "Invalid format specifiers",
            "expression_errors": "Expression evaluation errors",
        }

    def debug_fstring(
        self, fstring_template: str, variables: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Debug an f-string with given variables

        Args:
            fstring_template: The f-string template to test
            variables: Dictionary of variables to substitute

        Returns:
            Dictionary with debug information
        """
        debug_info = {
            "template": fstring_template,
            "variables": variables,
            "issues": [],
            "result": None,
            "success": False,
        }

        try:
            # Check for basic syntax issues
            syntax_issues = self._check_syntax(fstring_template)
            debug_info["issues"].extend(syntax_issues)

            # Check for undefined variables
            undefined_vars = self._check_variables(fstring_template, variables)
            debug_info["issues"].extend(undefined_vars)

            # Try to evaluate the f-string
            if not syntax_issues and not undefined_vars:
                result = self._safe_eval(fstring_template, variables)
                debug_info["result"] = result
                debug_info["success"] = True
            else:
                debug_info["success"] = False

        except Exception as e:
            debug_info["issues"].append(f"Runtime error: {str(e)}")
            debug_info["success"] = False

        return debug_info

    def _check_syntax(self, fstring_template: str) -> List[str]:
        """Check for basic f-string syntax issues"""
        issues = []

        # Count braces
        open_braces = fstring_template.count("{")
        close_braces = fstring_template.count("}")

        if open_braces != close_braces:
            issues.append(
                f"Mismatched braces: {open_braces} open, {close_braces} close"
            )

        # Check for nested braces issues
        brace_depth = 0
        for i, char in enumerate(fstring_template):
            if char == "{":
                brace_depth += 1
            elif char == "}":
                brace_depth -= 1
                if brace_depth < 0:
                    issues.append(f"Unmatched closing brace at position {i}")
                    break

        # Check for quote conflicts
        if '"' in fstring_template and "'" in fstring_template:
            # Check if quotes are properly balanced
            if (
                fstring_template.count('"') % 2 != 0
                and fstring_template.count("'") % 2 != 0
            ):
                issues.append("Potential quote conflict detected")

        return issues

    def _check_variables(
        self, fstring_template: str, variables: Dict[str, Any]
    ) -> List[str]:
        """Check for undefined variables in f-string"""
        issues = []

        # Extract variable names from f-string
        import re

        var_pattern = r"\{([^{}]*)\}"
        matches = re.findall(var_pattern, fstring_template)

        for match in matches:
            # Skip format specifiers and expressions
            if ":" in match:
                var_name = match.split(":")[0].strip()
            elif "!" in match:
                var_name = match.split("!")[0].strip()
            else:
                var_name = match.strip()

            # Check if variable exists
            if var_name and var_name not in variables:
                # Try to evaluate as expression
                try:
                    eval(var_name, {}, variables)
                except (NameError, SyntaxError):
                    issues.append(f"Undefined variable or expression: '{var_name}'")

        return issues

    def _safe_eval(self, fstring_template: str, variables: Dict[str, Any]) -> str:
        """Safely evaluate f-string"""
        try:
            # Create a safe evaluation environment
            safe_globals = {"__builtins__": {}}
            safe_locals = variables.copy()

            # Evaluate the f-string
            return eval(f'f"{fstring_template}"', safe_globals, safe_locals)
        except Exception as e:
            raise ValueError(f"F-string evaluation failed: {str(e)}")


def demonstrate_common_issues():
    """Demonstrate common f-string issues and their solutions"""

    debugger = FStringDebugger()

    print("=" * 80)
    print("F-STRING DEBUGGING DEMONSTRATION")
    print("=" * 80)

    # Test cases with common issues
    test_cases = [
        {
            "name": "Working f-string",
            "template": "Hello {name}, you have {count} messages",
            "variables": {"name": "Alice", "count": 5},
            "expected_success": True,
        },
        {
            "name": "Undefined variable",
            "template": "Hello {name}, you have {unread} messages",
            "variables": {"name": "Bob", "count": 3},
            "expected_success": False,
        },
        {
            "name": "Mismatched braces",
            "template": "Hello {name, you have {count} messages",
            "variables": {"name": "Carol", "count": 2},
            "expected_success": False,
        },
        {
            "name": "Type formatting issue",
            "template": "Value: {value:.2f}",
            "variables": {"value": "not_a_number"},
            "expected_success": False,
        },
        {
            "name": "Complex expression",
            "template": "Total: ${price * quantity:.2f}",
            "variables": {"price": 19.99, "quantity": 3},
            "expected_success": True,
        },
        {
            "name": "Nested braces",
            "template": "Dict value: {data[key]}",
            "variables": {"data": {"key": "value"}},
            "expected_success": True,
        },
        {
            "name": "Quote conflict",
            "template": "She said: {message}",
            "variables": {"message": "Hello 'world'"},
            "expected_success": True,
        },
    ]

    for i, test_case in enumerate(test_cases, 1):
        print(f"\n{i}. {test_case['name']}")
        print("-" * 40)
        print(f"Template: {test_case['template']}")
        print(f"Variables: {test_case['variables']}")

        debug_result = debugger.debug_fstring(
            test_case["template"], test_case["variables"]
        )

        print(f"Success: {debug_result['success']}")

        if debug_result["issues"]:
            print("Issues:")
            for issue in debug_result["issues"]:
                print(f"  - {issue}")

        if debug_result["success"]:
            print(f"Result: {debug_result['result']}")

        # Verify expectation
        if debug_result["success"] != test_case["expected_success"]:
            print(f"WARNING️  UNEXPECTED RESULT (expected: {test_case['expected_success']})")
        else:
            print("PASS Result as expected")


def fix_hybrid_income_fstrings():
    """Fix potential f-string issues in the hybrid income model"""

    print("\n" + "=" * 80)
    print("FIXING HYBRID INCOME MODEL F-STRINGS")
    print("=" * 80)

    # Common issues found in the hybrid income model
    fixes = [
        {
            "issue": "Currency symbol formatting",
            "problematic": "${amount:.2f}",
            "fixed": "${amount:,.2f}",
            "explanation": "Added comma separator for thousands",
        },
        {
            "issue": "BDT symbol formatting",
            "problematic": "BDT{amount:.0f}",
            "fixed": "BDT{amount:,.0f}",
            "explanation": "Added comma separator for thousands",
        },
        {
            "issue": "Table alignment",
            "problematic": "{value:<10}",
            "fixed": "{value:<10.2f}",
            "explanation": "Added decimal precision for numeric alignment",
        },
        {
            "issue": "Error message formatting",
            "problematic": "Error: {error}",
            "fixed": "Error: {str(error)}",
            "explanation": "Explicit string conversion for error objects",
        },
    ]

    for i, fix in enumerate(fixes, 1):
        print(f"\n{i}. {fix['issue']}")
        print(f"   Before: {fix['problematic']}")
        print(f"   After:  {fix['fixed']}")
        print(f"   Why:    {fix['explanation']}")


def create_fstring_best_practices():
    """Create best practices guide for f-strings"""

    practices = [
        {
            "title": "Always use explicit string conversion",
            "good": 'f"Error: {str(error)}"',
            "bad": 'f"Error: {error}"',
            "reason": "Prevents type errors with non-string objects",
        },
        {
            "title": "Use comma separators for large numbers",
            "good": 'f"${amount:,.2f}"',
            "bad": 'f"${amount:.2f}"',
            "reason": "Improves readability for large numbers",
        },
        {
            "title": "Be consistent with decimal places",
            "good": 'f"{value:10.2f}"',
            "bad": 'f"{value:<10}"',
            "reason": "Ensures proper alignment in tables",
        },
        {
            "title": "Handle None values gracefully",
            "good": "f\"Name: {name or 'N/A'}\"",
            "bad": 'f"Name: {name}"',
            "reason": "Prevents NoneType errors",
        },
        {
            "title": "Use safe evaluation for user input",
            "good": "result = safe_format(template, variables)",
            "bad": "result = eval(f\"f'{template}'\")",
            "reason": "Prevents code injection",
        },
    ]

    print("\n" + "=" * 80)
    print("F-STRING BEST PRACTICES")
    print("=" * 80)

    for i, practice in enumerate(practices, 1):
        print(f"\n{i}. {practice['title']}")
        print(f"   PASS Good:  {practice['good']}")
        print(f"   FAIL Bad:   {practice['bad']}")
        print(f"   INFO Why:   {practice['reason']}")


def test_hybrid_income_fstrings():
    """Test the specific f-strings used in the hybrid income model"""

    print("\n" + "=" * 80)
    print("TESTING HYBRID INCOME MODEL F-STRINGS")
    print("=" * 80)

    # Sample data from the hybrid income model
    sample_results = [
        {
            "month": 1,
            "phase": "Foundation Phase",
            "tutoring_income": 816.0,
            "prompt_income": 0.0,
            "net_income": 766.0,
            "net_income_bdt": 93452.0,
        },
        {
            "month": 7,
            "phase": "Scale Phase",
            "tutoring_income": 612.0,
            "prompt_income": 1200.0,
            "net_income": 1742.0,
            "net_income_bdt": 212524.0,
        },
    ]

    sample_roi = {
        "total_investment": 720.0,
        "total_earnings": 16248.0,
        "net_profit": 15528.0,
        "roi_percentage": 2156.67,
        "break_even_month": 1,
        "average_monthly_income": 1354.0,
    }

    # Test the actual f-strings from the model
    fstring_tests = [
        {
            "name": "Monthly table header",
            "template": "{'Month':<6} {'Phase':<15} {'Tutoring':<10} {'3D Prompts':<10} {'Net (USD)':<12} {'Net (BDT)':<12}",
            "variables": {},
            "context": "Table formatting",
        },
        {
            "name": "Monthly table row",
            "template": "{month:<6} {phase:<15} ${tutoring_income:<9.2f} ${prompt_income:<9.2f} ${net_income:<11.2f} BDT{net_income_bdt:<11.0f}",
            "variables": sample_results[0],
            "context": "Table row formatting",
        },
        {
            "name": "ROI percentage",
            "template": "{roi_percentage:.1f}%",
            "variables": {"roi_percentage": sample_roi["roi_percentage"]},
            "context": "ROI display",
        },
        {
            "name": "Currency formatting",
            "template": "${value:,.2f}",
            "variables": {"value": sample_roi["total_investment"]},
            "context": "Currency display",
        },
    ]

    debugger = FStringDebugger()

    for i, test in enumerate(fstring_tests, 1):
        print(f"\n{i}. {test['name']} ({test['context']})")
        print("-" * 50)
        print(f"Template: {test['template']}")
        print(f"Variables: {test['variables']}")

        debug_result = debugger.debug_fstring(test["template"], test["variables"])

        if debug_result["success"]:
            print(f"PASS Success: {debug_result['result']}")
        else:
            print("FAIL Failed:")
            for issue in debug_result["issues"]:
                print(f"   - {issue}")


if __name__ == "__main__":
    print("F-STRING DEBUGGING GUIDE")
    print("This guide will help you identify and fix common f-string issues.")

    # Run all demonstrations
    demonstrate_common_issues()
    fix_hybrid_income_fstrings()
    create_fstring_best_practices()
    test_hybrid_income_fstrings()

    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print("1. Always check for undefined variables")
    print("2. Ensure braces are properly matched")
    print("3. Use explicit string conversion for non-strings")
    print("4. Add proper formatting for currency and numbers")
    print("5. Handle edge cases like None values")
    print("6. Test f-strings with sample data")
    print("7. Use safe evaluation for user-provided templates")

    print(f"\nPython version: {sys.version}")
    print("If you're still having issues, check:")
    print("- Python version (f-strings require Python 3.6+)")
    print("- Variable scope and availability")
    print("- Data types in your variables")
    print("- Character encoding in your terminal")
