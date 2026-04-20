#!/usr/bin/env python3
"""Dev utility: regex-routed discovery of GRID + workspace system-prompt docs (JSON to stdout).

Not part of the MCP graph. Set CASCADE_WORKSPACE_ROOT when the monorepo root is not the
directory containing this script.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, Optional


class SystemPromptProcessor:
    """Minimal processor for system prompt queries."""

    def __init__(self) -> None:
        env_root = os.environ.get("CASCADE_WORKSPACE_ROOT")
        self.workspace_root = (
            Path(env_root).resolve() if env_root else Path(__file__).resolve().parent
        )
        self.grid_root = self.workspace_root / "Projects" / "GRID-main"

    def find_system_prompt_files(self) -> Dict[str, Path]:
        """Find all system prompt related files"""
        system_files = {}

        # Check for GRID system files
        grid_system_files = [
            ".pi/SYSTEM.md",
            "APPEND_SYSTEM.md",
            "docs/AGENTIC_SYSTEM.md",
            "docs/AGENTIC_SYSTEM_USAGE.md"
        ]

        for rel_path in grid_system_files:
            full_path = self.grid_root / rel_path
            if full_path.exists():
                system_files[rel_path] = full_path

        # Check workspace-level system files
        workspace_files = [
            ".pi/SYSTEM.md",
            "APPEND_SYSTEM.md",
            ".cursor/skills/lumos/SKILL.md"
        ]

        for rel_path in workspace_files:
            full_path = self.workspace_root / rel_path
            if full_path.exists():
                system_files[f"workspace/{rel_path}"] = full_path

        return system_files

    def extract_system_prompt(self, file_path: Path) -> Optional[str]:
        """Extract system prompt content from file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Remove frontmatter if present
            if content.startswith('---'):
                parts = content.split('---', 2)
                if len(parts) >= 3:
                    content = parts[2]

            return content.strip()
        except Exception as e:
            return f"Error reading {file_path}: {e}"

    def parse_user_query(self, query: str) -> Dict[str, Any]:
        """Parse user query for system prompt requests"""
        # Pattern matching for system prompt queries
        patterns = [
            r"what is the systemp['']?s prompt",
            r"what is the system['']?s prompt",
            r"systemp['']?s prompt",
            r"system['']?s prompt",
            r"system prompt",
            r"SYSTEM.*prompt",
            r"workspace.*rulesets",
            r"custom.*rulesets",
            r"educational.*tool",
            r"workspace.*custom",
            r"system.*memo.*log",
            r"system.*log.*user",
            r"system.*prompting.*do",
            r"system.*wishlist.*happened",
            r"memo.*log.*user",
            r"systtem.*wishlist",
            r"systtem.*prompt"
        ]

        query_lower = query.lower()
        is_system_query = any(re.search(pattern, query_lower) for pattern in patterns)

        # Extract user context if present
        user_context = None
        user_match = re.search(r'\^user->(.+)', query)
        if user_match:
            user_context = user_match.group(1).strip()

        return {
            "is_system_query": is_system_query,
            "user_context": user_context,
            "original_query": query
        }

    def process_query(self, query: str) -> Dict[str, Any]:
        """Process a single query"""
        parsed = self.parse_user_query(query)

        if not parsed["is_system_query"]:
            return {
                "status": "not_system_query",
                "query": query,
                "response": "This query is not about system prompts."
            }

        system_files = self.find_system_prompt_files()
        system_prompts = {}

        for name, path in system_files.items():
            content = self.extract_system_prompt(path)
            system_prompts[name] = {
                "path": str(path),
                "content": content[:500] + "..." if len(content) > 500 else content,
                "size": len(content)
            }

        response = {
            "status": "system_query_processed",
            "query": query,
            "user_context": parsed["user_context"],
            "system_files_found": len(system_files),
            "system_prompts": system_prompts,
            "summary": f"Found {len(system_files)} system prompt files"
        }

        return response

    def interactive_mode(self):
        """Run interactive query processing"""
        print("=== SYSTEM PROMPT PROCESSOR ===")
        print("Type 'exit' to quit, 'help' for commands")
        print()

        while True:
            try:
                query = input("Query> ").strip()

                if query.lower() == 'exit':
                    break
                elif query.lower() == 'help':
                    print("Commands:")
                    print("  exit - quit processor")
                    print("  help - show this help")
                    print("  list - show all system files")
                    print("  Any query about system prompts")
                    print()
                    continue
                elif query.lower() == 'list':
                    files = self.find_system_prompt_files()
                    print("System prompt files:")
                    for name, path in files.items():
                        print(f"  {name}: {path}")
                    print()
                    continue

                result = self.process_query(query)

                # Pretty print result
                print(json.dumps(result, indent=2))
                print()

            except KeyboardInterrupt:
                print("\nExiting...")
                break
            except Exception as e:
                print(f"Error: {e}")
                print()

def main():
    """Main entry point"""
    processor = SystemPromptProcessor()

    if len(sys.argv) > 1:
        # Command line mode
        query = " ".join(sys.argv[1:])
        result = processor.process_query(query)
        print(json.dumps(result, indent=2))
    else:
        # Interactive mode
        processor.interactive_mode()

if __name__ == "__main__":
    main()
