#!/bin/bash
# Debug script for eligibility-server
# Usage: ./debug.sh <function-name> <breakpoint-line>

set -e

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if function name provided
if [ -z "$1" ]; then
    echo "Usage: $0 <function-name> [breakpoint-line]"
    echo "Example: $0 handleCaseOpen 45"
    exit 1
fi

FUNCTION_NAME="$1"
BREAKPOINT_LINE="${2:-10}"

echo "Setting up debug session for function: $FUNCTION_NAME"
echo "Breakpoint at line: $BREAKPOINT_LINE"

# Start the server in debug mode
echo "Starting eligibility-server in debug mode..."
cd "$SERVER_DIR"

# Launch with inspector protocol for breakpoint support
npx tsx --inspect=9229 src/server.ts &

# Wait for server to start
sleep 3

echo "Server started. Attach your debugger to port 9229"
echo "Set breakpoint at line $BREAKPOINT_LINE in src/server.ts"
echo "Press Ctrl+C to stop the server when done debugging"

# Keep script running until user interrupts
trap "echo 'Shutting down server...'; pkill -f 'tsx src/server.ts'; exit 0" INT
wait
