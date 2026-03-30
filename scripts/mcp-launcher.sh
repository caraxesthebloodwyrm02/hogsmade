#!/bin/bash
# MCP Server Launcher - Starts all configured MCP servers
# Usage: ./mcp-launcher.sh [start|stop|restart|status]

set -e

LAUNCHER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/tmp/mcp-servers"
mkdir -p "$LOG_DIR"

MCP_CONFIG="/home/caraxes/CascadeProjects/mcp_config.json"
NPM_PREFIX="/home/caraxes/.npm/_npx/fd45a72a545557e9/node_modules"
TSX_BIN="$NPM_PREFIX/.bin/tsx"
GRID_VENV="/home/caraxes/roots/GRID/.venv/bin/python"

start_server() {
    local name="$1"
    local cmd="$2"
    local args="$3"
    local env="$4"
    local workdir="$5"
    
    local logfile="$LOG_DIR/${name}.log"
    
    if pgrep -f "$name" > /dev/null 2>&1; then
        echo "[$name] already running"
        return
    fi
    
    echo "[$name] starting..."
    
    if [ -n "$env" ]; then
        IFS=',' read -ra ENVS <<< "$env"
        for e in "${ENVS[@]}"; do
            export "$e"
        done
    fi
    
    if [ -n "$workdir" ]; then
        (cd "$workdir" && nohup $cmd $args > "$logfile" 2>&1 &)
    else
        nohup $cmd $args > "$logfile" 2>&1 &
    fi
    
    sleep 2
    
    if pgrep -f "$name" > /dev/null 2>&1; then
        echo "[$name] started (pid: $(pgrep -f "$name" | head -1))"
    else
        echo "[$name] FAILED - check $logfile"
    fi
}

stop_server() {
    local name="$1"
    
    local pids=$(pgrep -f "$name" 2>/dev/null || true)
    
    if [ -n "$pids" ]; then
        echo "[$name] stopping (pids: $pids)..."
        echo "$pids" | xargs -r kill -9 2>/dev/null || true
    else
        echo "[$name] not running"
    fi
}

case "${1:-start}" in
    start)
        echo "Starting MCP servers..."
        
        # TypeScript servers (direct tsx) - cd to server dir first
        start_server "echoes-server" "node" "$TSX_BIN src/server.ts" "ECHOES_AUDIT_PATH=/home/caraxes/.echoes/audit.ndjson" "/home/caraxes/CascadeProjects/echoes-server"
        start_server "grid-server" "node" "$TSX_BIN src/server.ts" "CASCADE_WORKSPACE_ROOT=/home/caraxes/CascadeProjects,GATE_DIR=/home/caraxes/CascadeProjects/GATE,GRID_API_URL=http://localhost:8080" "/home/caraxes/CascadeProjects/grid-server"
        start_server "afloat-server" "node" "$TSX_BIN src/server.ts" "" "/home/caraxes/CascadeProjects/afloat-server"
        start_server "lots-server" "node" "$TSX_BIN src/server.ts" "LOTS_EXPERIMENTS_DIR=/home/caraxes/CascadeProjects/experiments,ECHOES_AUDIT_PATH=/home/caraxes/.echoes/audit.ndjson" "/home/caraxes/CascadeProjects/lots-server"
        start_server "seeds-server" "node" "$TSX_BIN src/server.ts" "SEEDS_ROOT=/home/caraxes/seed" "/home/caraxes/CascadeProjects/seeds-server"
        start_server "pulse-server" "node" "$TSX_BIN src/server.ts" "" "/home/caraxes/CascadeProjects/pulse-server"
        start_server "maintain-server" "node" "$TSX_BIN src/server.ts" "CASCADE_WORKSPACE_ROOT=/home/caraxes/CascadeProjects,SEEDS_ROOT=/home/caraxes/seed,ECHOES_AUDIT_PATH=/home/caraxes/.echoes/audit.ndjson" "/home/caraxes/CascadeProjects/maintain-server"
        start_server "overview-server" "node" "$TSX_BIN src/server.ts" "CASCADE_WORKSPACE_ROOT=/home/caraxes/CascadeProjects,SEEDS_ROOT=/home/caraxes/seed,ECHOES_AUDIT_PATH=/home/caraxes/.echoes/audit.ndjson,GATE_DIR=/home/caraxes/CascadeProjects/GATE" "/home/caraxes/CascadeProjects/overview-server"
        start_server "eligibility-server" "node" "$TSX_BIN src/server.ts" "ECHOES_AUDIT_PATH=/home/caraxes/.echoes/audit.ndjson,ELIGIBILITY_DATA_DIR=/home/caraxes/.eligibility-server" "/home/caraxes/CascadeProjects/eligibility-server"
        start_server "mangrove-server" "node" "$TSX_BIN src/server.ts" "MANGROVE_DIO_ROOT=/home/caraxes/CascadeProjects/DIO" "/home/caraxes/CascadeProjects/mangrove-server"
        start_server "glimpse-server" "node" "$TSX_BIN src/server.ts" "" "/home/caraxes/CascadeProjects/glimpse-server"
        
        # Python servers (GRID venv)
        PYTHONPATH="/home/caraxes/roots/GRID/src:/home/caraxes/roots/GRID"
        RAG_ENV="PYTHONPATH=$PYTHONPATH,RAG_EMBEDDING_PROVIDER=ollama,RAG_EMBEDDING_MODEL=nomic-embed-text-v2-moe:latest,RAG_LLM_MODE=local,RAG_LLM_MODEL_LOCAL=ministral-3:latest,RAG_VECTOR_STORE_PROVIDER=chromadb,RAG_VECTOR_STORE_PATH=/home/caraxes/roots/GRID/.rag_db,OLLAMA_BASE_URL=http://localhost:11434"
        
        start_server "grid-rag" "$GRID_VENV" "mcp-setup/server/grid_rag_mcp_server.py" "$RAG_ENV" "/home/caraxes/roots/GRID"
        start_server "grid-rag-enhanced" "$GRID_VENV" "-m grid.mcp.enhanced_rag_server" "$RAG_ENV" ""
        start_server "grid-enhanced-tools" "$GRID_VENV" "mcp-setup/server/enhanced_tools_mcp_server.py" "PYTHONPATH=$PYTHONPATH" "/home/caraxes/roots/GRID"
        start_server "portfolio-safety-lens" "$GRID_VENV" "mcp-setup/server/portfolio_safety_mcp_server.py" "PYTHONPATH=$PYTHONPATH:/home/caraxes/seed/archive/Coinbase_from_zip" "/home/caraxes/roots/GRID"
        start_server "code-analysis" "$GRID_VENV" "mcp-setup/server/code_analysis_mcp_server.py" "PYTHONPATH=$PYTHONPATH,EXTRA_ALLOWED_ROOTS=/home/caraxes/CascadeProjects" "/home/caraxes/roots/GRID"
        start_server "test-runner" "$GRID_VENV" "mcp-setup/server/test_runner_mcp_server.py" "PYTHONPATH=$PYTHONPATH,EXTRA_ALLOWED_ROOTS=/home/caraxes/CascadeProjects" "/home/caraxes/roots/GRID"
        start_server "grid-intelligence" "$GRID_VENV" "-m grid.mcp.intelligence_server" "PYTHONPATH=$PYTHONPATH" ""
        
        echo ""
        echo "MCP servers started. Use '$0 status' to check."
        ;;
        
    stop)
        echo "Stopping MCP servers..."
        
        for name in echoes-server grid-server afloat-server lots-server seeds-server pulse-server maintain-server overview-server eligibility-server mangrove-server glimpse-server; do
            stop_server "$name"
        done
        
        for name in grid-rag grid-rag-enhanced grid-enhanced-tools portfolio-safety-lens code-analysis test-runner grid-intelligence; do
            stop_server "$name"
        done
        
        echo "MCP servers stopped."
        ;;
        
    restart)
        $0 stop
        sleep 2
        $0 start
        ;;
        
    status)
        echo "=== MCP Server Status ==="
        echo ""
        
        echo "TypeScript servers:"
        for name in echoes-server grid-server afloat-server lots-server seeds-server pulse-server maintain-server overview-server eligibility-server mangrove-server glimpse-server; do
            if pgrep -f "$name" > /dev/null 2>&1; then
                echo "  ✅ $name"
            else
                echo "  ❌ $name"
            fi
        done
        
        echo ""
        echo "Python servers:"
        for name in grid-rag grid-rag-enhanced grid-enhanced-tools portfolio-safety-lens code-analysis test-runner grid-intelligence; do
            if pgrep -f "$name" > /dev/null 2>&1; then
                echo "  ✅ $name"
            else
                echo "  ❌ $name"
            fi
        done
        ;;
        
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
