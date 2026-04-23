#!/usr/bin/env python3
import os
import sys
import re

def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    matrix_path = os.path.join(root, "Documentation/docs/tool-consolidation-matrix.md")

    if not os.path.exists(matrix_path):
        print(f"ERROR: Matrix file not found at {matrix_path}")
        return 1

    with open(matrix_path, 'r') as f:
        content = f.read()

    # Simple parser for the markdown table
    lines = content.splitlines()
    table_lines = [l for l in lines if "|" in l and "---" not in l and "Topic \\ Tool" not in l]

    errors = 0
    for line in table_lines:
        parts = [p.strip() for p in line.split("|") if p.strip()]
        if len(parts) < 2: continue

        topic = parts[0]
        # Map tool names to their expected files
        tool_files = {
            "Windsurf": ".windsurfrules",
            "VS Code": ".vscode/settings.json", # settings.json is not tracked (ignored); skip check if missing
            "Cursor": ".cursorrules",
            "Zed": ".zed/AGENTS.md",
            "Claude Code": "CLAUDE.md",
            "Copilot": ".github/copilot-instructions.md"
        }

        for i, tool_name in enumerate(["Windsurf", "VS Code", "Cursor", "Zed", "Claude Code", "Copilot"], 1):
            if i >= len(parts): break
            cell = parts[i]

            if cell == "pointer" or cell == "delta":
                file_path = os.path.join(root, tool_files[tool_name])
                if not os.path.exists(file_path):
                    # Skip VS Code settings.json as it is intentionally not tracked
                    if tool_name == "VS Code" and tool_files[tool_name] == ".vscode/settings.json":
                        continue
                    print(f"ERROR: Expected file {file_path} for tool {tool_name} (topic: {topic}) missing.")
                    errors += 1
                else:
                    with open(file_path, 'r') as f:
                        file_content = f.read()
                    if "AGENTS.md" not in file_content:
                        print(f"ERROR: File {file_path} (tool: {tool_name}, topic: {topic}) marked as '{cell}' but does not reference AGENTS.md.")
                        errors += 1

    if errors > 0:
        print(f"FAILURE: Found {errors} consolidation violations.")
        return 1

    print("SUCCESS: Tool consolidation matrix verified.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
