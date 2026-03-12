#!/usr/bin/env python3
"""
Trim trailing whitespaces from all Python files in the project
"""

import os
import sys


def trim_trailing_whitespace(file_path):
    """Trim trailing whitespace from a single file"""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        # Trim trailing whitespace from each line
        trimmed_lines = [line.rstrip() for line in lines]

        # Check if any changes were made
        if lines != [
            line + "\n" if line and not line.endswith("\n") else line
            for line in trimmed_lines
        ]:
            # Write back the trimmed content
            with open(file_path, "w", encoding="utf-8") as f:
                for i, line in enumerate(trimmed_lines):
                    if i < len(trimmed_lines) - 1:  # Not the last line
                        f.write(line + "\n")
                    else:  # Last line
                        f.write(line)
            return True

        return False

    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False


def trim_all_python_files(directory="."):
    """Trim trailing whitespace from all Python files in directory"""

    print("Trimming trailing whitespaces from Python files...")
    print("=" * 60)

    # Find all Python files
    python_files = []
    for root, dirs, files in os.walk(directory):
        # Skip hidden directories and virtual environments
        dirs[:] = [
            d
            for d in dirs
            if not d.startswith(".") and d != "__pycache__" and "venv" not in d
        ]

        for file in files:
            if file.endswith(".py"):
                python_files.append(os.path.join(root, file))

    print(f"Found {len(python_files)} Python files")

    # Process each file
    modified_files = []
    for file_path in python_files:
        if trim_trailing_whitespace(file_path):
            modified_files.append(file_path)
            print(f"PASS Modified: {file_path}")
        else:
            print(f"  No changes: {file_path}")

    # Summary
    print("\n" + "=" * 60)
    print(f"Total files processed: {len(python_files)}")
    print(f"Files modified: {len(modified_files)}")

    if modified_files:
        print("\nModified files:")
        for file_path in modified_files:
            print(f"  - {file_path}")
    else:
        print("\nNo files needed modification.")

    return len(modified_files)


def check_trailing_whitespace(directory="."):
    """Check for trailing whitespace without modifying files"""

    print("Checking for trailing whitespaces...")
    print("=" * 60)

    files_with_issues = []

    for root, dirs, files in os.walk(directory):
        dirs[:] = [
            d
            for d in dirs
            if not d.startswith(".") and d != "__pycache__" and "venv" not in d
        ]

        for file in files:
            if file.endswith(".py"):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        lines = f.readlines()

                    # Check each line for trailing whitespace
                    for i, line in enumerate(lines, 1):
                        if line.rstrip() != line.rstrip("\n\r"):
                            if file_path not in files_with_issues:
                                files_with_issues.append(file_path)
                            print(f"  {file_path}:{i} - Has trailing whitespace")
                            break

                except Exception as e:
                    print(f"Error checking {file_path}: {e}")

    if not files_with_issues:
        print("PASS No trailing whitespace found!")
    else:
        print(f"\nFound {len(files_with_issues)} files with trailing whitespace")

    return files_with_issues


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Trim trailing whitespaces from Python files"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check for trailing whitespace without modifying",
    )
    parser.add_argument(
        "--directory",
        default=".",
        help="Directory to process (default: current directory)",
    )

    args = parser.parse_args()

    if args.check:
        files_with_issues = check_trailing_whitespace(args.directory)
        sys.exit(1 if files_with_issues else 0)
    else:
        modified_count = trim_all_python_files(args.directory)
        sys.exit(0 if modified_count >= 0 else 1)
