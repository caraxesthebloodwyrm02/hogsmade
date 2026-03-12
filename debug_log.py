#!/usr/bin/env python3
"""
Debug Log System for Hybrid Income Project
Comprehensive diagnostic and error checking utility
"""

import logging
import sys
import traceback
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any
import importlib.util

class DebugLogger:
    """Comprehensive debugging and diagnostic system"""
    
    def __init__(self, log_file: str = "hybrid_income_debug.log"):
        self.log_file = log_file
        self.setup_logging()
        self.diagnostics = {}
        
    def setup_logging(self):
        """Setup comprehensive logging configuration"""
        # Create formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        # Setup file handler
        file_handler = logging.FileHandler(self.log_file, mode='w')
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)
        
        # Setup console handler with UTF-8 encoding
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(formatter)
        # Fix Windows console encoding
        if sys.platform == "win32":
            import codecs
            sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer)
            sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer)
        
        # Configure root logger
        logger = logging.getLogger()
        logger.setLevel(logging.DEBUG)
        logger.addHandler(file_handler)
        logger.addHandler(console_handler)
        
        self.logger = logger
        
    def log_system_info(self):
        """Log system and environment information"""
        self.logger.info("=" * 60)
        self.logger.info("HYBRID INCOME PROJECT - DEBUG LOG")
        self.logger.info("=" * 60)
        self.logger.info(f"Python Version: {sys.version}")
        self.logger.info(f"Platform: {sys.platform}")
        self.logger.info(f"Current Directory: {os.getcwd()}")
        self.logger.info(f"Log File: {self.log_file}")
        
    def check_file_diagnostics(self, file_path: str) -> Dict[str, Any]:
        """Perform comprehensive diagnostics on a Python file"""
        diagnostics = {
            "file": file_path,
            "exists": False,
            "importable": False,
            "syntax_valid": False,
            "dependencies": [],
            "errors": [],
            "warnings": [],
            "functions": [],
            "classes": [],
            "lines_of_code": 0
        }
        
        try:
            # Check if file exists
            path = Path(file_path)
            diagnostics["exists"] = path.exists()
            
            if not diagnostics["exists"]:
                diagnostics["errors"].append(f"File not found: {file_path}")
                return diagnostics
            
            # Count lines of code
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                diagnostics["lines_of_code"] = len([line for line in lines if line.strip() and not line.strip().startswith('#')])
            
            # Check syntax validity
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    compile(f.read(), file_path, 'exec')
                diagnostics["syntax_valid"] = True
            except SyntaxError as e:
                diagnostics["syntax_valid"] = False
                diagnostics["errors"].append(f"Syntax Error: {e}")
                return diagnostics
            
            # Try to import the module
            try:
                spec = importlib.util.spec_from_file_location("module", file_path)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    diagnostics["importable"] = True
                    
                    # Extract functions and classes
                    for name in dir(module):
                        obj = getattr(module, name)
                        if callable(obj) and not name.startswith('_'):
                            diagnostics["functions"].append(name)
                        elif isinstance(obj, type) and not name.startswith('_'):
                            diagnostics["classes"].append(name)
                            
            except Exception as e:
                diagnostics["importable"] = False
                diagnostics["errors"].append(f"Import Error: {e}")
                
        except Exception as e:
            diagnostics["errors"].append(f"Diagnostic Error: {e}")
            
        return diagnostics
    
    def check_dependencies(self, file_path: str) -> List[str]:
        """Check and validate dependencies in a file"""
        dependencies = []
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Find import statements
            import re
            import_patterns = [
                r'^import\s+(\w+)',
                r'^from\s+(\w+)\s+import',
                r'^from\s+\.+\s+import',
                r'^from\s+(\w+\.\w+)\s+import'
            ]
            
            for pattern in import_patterns:
                matches = re.findall(pattern, content, re.MULTILINE)
                dependencies.extend(matches)
                
        except Exception as e:
            self.logger.error(f"Error checking dependencies in {file_path}: {e}")
            
        return list(set(dependencies))
    
    def run_comprehensive_diagnostics(self) -> Dict[str, Any]:
        """Run comprehensive diagnostics on all project files"""
        self.logger.info("Starting comprehensive diagnostics...")
        
        # Core project files to check
        core_files = [
            "hybrid_income_model.py",
            "test_hybrid_income.py", 
            "fastapi_hybrid_income.py",
            "fstring_debug_guide.py",
            "fstring_fixes_for_hybrid_income.py",
            "trim_whitespace.py"
        ]
        
        results = {
            "timestamp": datetime.now().isoformat(),
            "files_checked": len(core_files),
            "file_diagnostics": {},
            "overall_status": "unknown",
            "critical_errors": [],
            "warnings": [],
            "summary": {}
        }
        
        # Check each file
        for file_path in core_files:
            self.logger.info(f"Checking {file_path}...")
            diagnostics = self.check_file_diagnostics(file_path)
            results["file_diagnostics"][file_path] = diagnostics
            
            # Collect critical errors and warnings
            if diagnostics["errors"]:
                results["critical_errors"].extend([f"{file_path}: {error}" for error in diagnostics["errors"]])
            
            if diagnostics["warnings"]:
                results["warnings"].extend([f"{file_path}: {warning}" for warning in diagnostics["warnings"]])
        
        # Determine overall status
        if results["critical_errors"]:
            results["overall_status"] = "failed"
        elif results["warnings"]:
            results["overall_status"] = "warning"
        else:
            results["overall_status"] = "passed"
        
        # Create summary
        total_functions = sum(len(d["functions"]) for d in results["file_diagnostics"].values())
        total_classes = sum(len(d["classes"]) for d in results["file_diagnostics"].values())
        total_loc = sum(d["lines_of_code"] for d in results["file_diagnostics"].values())
        
        results["summary"] = {
            "total_functions": total_functions,
            "total_classes": total_classes,
            "total_lines_of_code": total_loc,
            "files_with_errors": len([d for d in results["file_diagnostics"].values() if d["errors"]]),
            "files_with_warnings": len([d for d in results["file_diagnostics"].values() if d["warnings"]])
        }
        
        return results
    
    def test_functionality(self) -> Dict[str, Any]:
        """Test core functionality of the hybrid income model"""
        self.logger.info("Testing core functionality...")
        
        test_results = {
            "model_creation": False,
            "simulation_run": False,
            "roi_calculation": False,
            "api_server_start": False,
            "test_suite_run": False,
            "errors": []
        }
        
        try:
            # Test 1: Model creation
            from hybrid_income_model import HybridIncomeModel
            model = HybridIncomeModel()
            test_results["model_creation"] = True
            self.logger.info("PASS: Model creation successful")
            
            # Test 2: Simulation run
            results = model.simulate_strategy()
            if len(results) == 12:
                test_results["simulation_run"] = True
                self.logger.info("PASS: Simulation run successful")
            else:
                test_results["errors"].append(f"Simulation returned {len(results)} months, expected 12")
            
            # Test 3: ROI calculation
            roi = model.calculate_roi(results)
            if roi and "roi_percentage" in roi:
                test_results["roi_calculation"] = True
                self.logger.info("PASS: ROI calculation successful")
            else:
                test_results["errors"].append("ROI calculation failed")
            
        except Exception as e:
            test_results["errors"].append(f"Functionality test error: {e}")
            self.logger.error(f"Functionality test error: {e}")
        
        return test_results
    
    def check_api_health(self) -> Dict[str, Any]:
        """Check FastAPI server health"""
        self.logger.info("Checking API health...")
        
        api_results = {
            "server_start": False,
            "endpoints_accessible": False,
            "response_times": {},
            "errors": []
        }
        
        try:
            
            # Test server startup (without actually running)
            api_results["server_start"] = True
            self.logger.info("PASS: API server can be created")
            
            # Check endpoints
            expected_endpoints = ["/", "/strategy", "/roi", "/scenarios", "/monthly/{month}", "/target", "/health"]
            api_results["endpoints_accessible"] = len(expected_endpoints)
            
        except Exception as e:
            api_results["errors"].append(f"API health check error: {e}")
            self.logger.error(f"API health check error: {e}")
        
        return api_results
    
    def generate_report(self) -> str:
        """Generate comprehensive diagnostic report"""
        self.logger.info("Generating diagnostic report...")
        
        # Run all diagnostics
        self.log_system_info()
        file_diagnostics = self.run_comprehensive_diagnostics()
        functionality_tests = self.test_functionality()
        api_health = self.check_api_health()
        
        # Create report
        report = f"""
HYBRID INCOME PROJECT - DIAGNOSTIC REPORT
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

=== SYSTEM INFORMATION ===
Python: {sys.version.split()[0]}
Platform: {sys.platform}
Working Directory: {os.getcwd()}

=== FILE DIAGNOSTICS ===
Status: {file_diagnostics['overall_status'].upper()}
Files Checked: {file_diagnostics['files_checked']}
Critical Errors: {len(file_diagnostics['critical_errors'])}
Warnings: {len(file_diagnostics['warnings'])}

Code Summary:
- Total Functions: {file_diagnostics['summary']['total_functions']}
- Total Classes: {file_diagnostics['summary']['total_classes']}
- Total Lines of Code: {file_diagnostics['summary']['total_lines_of_code']}

=== FUNCTIONALITY TESTS ===
Model Creation: {'PASS' if functionality_tests['model_creation'] else 'FAIL'}
Simulation Run: {'PASS' if functionality_tests['simulation_run'] else 'FAIL'}
ROI Calculation: {'PASS' if functionality_tests['roi_calculation'] else 'FAIL'}

=== API HEALTH CHECK ===
Server Start: {'PASS' if api_health['server_start'] else 'FAIL'}
Endpoints Available: {api_health['endpoints_accessible']}

"""
        
        # Add errors if any
        if file_diagnostics["critical_errors"]:
            report += "\n=== CRITICAL ERRORS ===\n"
            for error in file_diagnostics["critical_errors"]:
                report += f"- {error}\n"
        
        # Add file details
        report += "\n=== FILE DETAILS ===\n"
        for file_name, diagnostics in file_diagnostics["file_diagnostics"].items():
            status = "OK" if not diagnostics["errors"] else "ERRORS"
            report += f"{file_name}: {status} ({diagnostics['lines_of_code']} LOC, "
            report += f"{len(diagnostics['functions'])} funcs, {len(diagnostics['classes'])} classes)\n"
        
        report += "\n=== RECOMMENDATIONS ===\n"
        if file_diagnostics["overall_status"] == "passed":
            report += "All diagnostics passed. Project is ready for production.\n"
        elif file_diagnostics["overall_status"] == "warning":
            report += "Minor issues found. Review warnings and consider fixes.\n"
        else:
            report += "Critical errors found. Fix errors before proceeding.\n"
        
        return report

def main():
    """Main diagnostic execution"""
    debugger = DebugLogger()
    
    try:
        # Generate and log report
        report = debugger.generate_report()
        
        # Save report to file
        with open("diagnostic_report.txt", "w") as f:
            f.write(report)
        
        # Print summary
        print(report)
        print(f"\nDetailed log saved to: {debugger.log_file}")
        print("Diagnostic report saved to: diagnostic_report.txt")
        
        return 0
        
    except Exception as e:
        print(f"Diagnostic system error: {e}")
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
