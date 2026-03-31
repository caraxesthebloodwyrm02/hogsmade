#!/bin/bash
# MCP Server Launcher - Starts all configured MCP servers
# Usage: ./mcp-launcher.sh [start|stop|restart|status]

set -e

LAUNCHER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$LAUNCHER_DIR/../.." && pwd)"
LOG_DIR="/tmp/mcp-servers"
PID_DIR="/tmp/mcp-servers/pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

MCP_CONFIG="$WORKSPACE_ROOT/mcp_config.json"
TSX_BIN="tsx"
GRID_VENV="$HOME/roots/GRID/.venv/bin/python"

start_server() {
    local name="$1"
    local cmd="$2"
    local args="$3"
    local env="$4"
    local workdir="$5"

    local logfile="$LOG_DIR/${name}.log"
    local pidfile="$PID_DIR/${name}.pid"

    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
        echo "[$name] already running (pid: $(cat "$pidfile"))"
        return
    fi

    echo "[$name] starting..."

    # Run in a subshell so exported env vars don't leak to subsequent calls
    (
        if [ -n "$env" ]; then
            IFS=',' read -ra ENVS <<< "$env"
            for e in "${ENVS[@]}"; do
                export "$e"
            done
        fi

        if [ -n "$workdir" ]; then
            cd "$workdir" || exit 1
        fi

        nohup $cmd $args > "$logfile" 2>&1 &
        echo $! > "$pidfile"
    )

    sleep 2

    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
        echo "[$name] started (pid: $(cat "$pidfile"))"
    else
        echo "[$name] FAILED - check $logfile"
        rm -f "$pidfile"
    fi
}

stop_server() {
    local name="$1"
    local pidfile="$PID_DIR/${name}.pid"

    if [ -f "$pidfile" ]; then
        local pid
        pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            echo "[$name] stopping (pid: $pid)..."
            kill "$pid" 2>/dev/null || true
            sleep 1
            # Force kill only if still alive
            kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
        else
            echo "[$name] not running (stale pid file)"
        fi
        rm -f "$pidfile"
    else
        echo "[$name] not running"
    fi
}

case "${1:-start}" in
    start)
        echo "Starting MCP servers..."

        # TypeScript servers (direct tsx) - cd to server dir first
        start_server "echoes-server" "$TSX_BIN" "src/server.ts" "ECHOES_AUDIT_PATH=$HOME/.echoes/audit.ndjson" "$WORKSPACE_ROOT/Tools/MCPServers/echoes-server"
        start_server "grid-server" "$TSX_BIN" "src/server.ts" "CASCADE_WORKSPACE_ROOT=$WORKSPACE_ROOT,GATE_DIR=$WORKSPACE_ROOT/GATE,GRID_API_URL=http://localhost:8080" "$WORKSPACE_ROOT/Tools/MCPServers/grid-server"
        start_server "afloat-server" "$TSX_BIN" "src/server.ts" "" "$WORKSPACE_ROOT/Tools/MCPServers/afloat-server"
        start_server "lots-server" "$TSX_BIN" "src/server.ts" "LOTS_EXPERIMENTS_DIR=$WORKSPACE_ROOT/experiments,ECHOES_AUDIT_PATH=$HOME/.echoes/audit.ndjson" "$WORKSPACE_ROOT/Tools/MCPServers/lots-server"
        start_server "seeds-server" "$TSX_BIN" "src/server.ts" "SEEDS_ROOT=$HOME/seed" "$WORKSPACE_ROOT/Tools/MCPServers/seeds-server"
        start_server "pulse-server" "$TSX_BIN" "src/server.ts" "" "$WORKSPACE_ROOT/Tools/MCPServers/pulse-server"
        start_server "maintain-server" "$TSX_BIN" "src/server.ts" "CASCADE_WORKSPACE_ROOT=$WORKSPACE_ROOT,SEEDS_ROOT=$HOME/seed,ECHOES_AUDIT_PATH=$HOME/.echoes/audit.ndjson" "$WORKSPACE_ROOT/Tools/MCPServers/maintain-server"
        start_server "overview-server" "$TSX_BIN" "src/server.ts" "CASCADE_WORKSPACE_ROOT=$WORKSPACE_ROOT,SEEDS_ROOT=$HOME/seed,ECHOES_AUDIT_PATH=$HOME/.echoes/audit.ndjson,GATE_DIR=$WORKSPACE_ROOT/GATE" "$WORKSPACE_ROOT/Tools/MCPServers/overview-server"
        start_server "eligibility-server" "$TSX_BIN" "src/server.ts" "ECHOES_AUDIT_PATH=$HOME/.echoes/audit.ndjson,ELIGIBILITY_DATA_DIR=$HOME/.eligibility-server" "$WORKSPACE_ROOT/Tools/MCPServers/eligibility-server"
        start_server "mangrove-server" "$TSX_BIN" "src/server.ts" "MANGROVE_DIO_ROOT=$WORKSPACE_ROOT/DIO" "$WORKSPACE_ROOT/Tools/MCPServers/mangrove-server"
        start_server "glimpse-server" "$TSX_BIN" "src/server.ts" "" "$WORKSPACE_ROOT/Tools/MCPServers/glimpse-server"

        # Python servers (GRID venv)
        PYTHONPATH="$HOME/roots/GRID/src:$HOME/roots/GRID"
        RAG_ENV="PYTHONPATH=$PYTHONPATH,RAG_EMBEDDING_PROVIDER=ollama,RAG_EMBEDDING_MODEL=nomic-embed-text-v2-moe:latest,RAG_LLM_MODE=local,RAG_LLM_MODEL_LOCAL=ministral-3:latest,RAG_VECTOR_STORE_PROVIDER=chromadb,RAG_VECTOR_STORE_PATH=$HOME/roots/GRID/.rag_db,OLLAMA_BASE_URL=http://localhost:11434"

        start_server "grid-rag" "$GRID_VENV" "mcp-setup/server/grid_rag_mcp_server.py" "$RAG_ENV" "$HOME/roots/GRID"
        start_server "grid-rag-enhanced" "$GRID_VENV" "-m grid.mcp.enhanced_rag_server" "$RAG_ENV" ""
        start_server "grid-enhanced-tools" "$GRID_VENV" "mcp-setup/server/enhanced_tools_mcp_server.py" "PYTHONPATH=$PYTHONPATH" "$HOME/roots/GRID"
        start_server "portfolio-safety-lens" "$GRID_VENV" "mcp-setup/server/portfolio_safety_mcp_server.py" "PYTHONPATH=$PYTHONPATH:$HOME/seed/archive/Coinbase_from_zip" "$HOME/roots/GRID"
        start_server "code-analysis" "$GRID_VENV" "mcp-setup/server/code_analysis_mcp_server.py" "PYTHONPATH=$PYTHONPATH,EXTRA_ALLOWED_ROOTS=$WORKSPACE_ROOT" "$HOME/roots/GRID"
        start_server "test-runner" "$GRID_VENV" "mcp-setup/server/test_runner_mcp_server.py" "PYTHONPATH=$PYTHONPATH,EXTRA_ALLOWED_ROOTS=$WORKSPACE_ROOT" "$HOME/roots/GRID"
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
            pidfile="$PID_DIR/${name}.pid"
            if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
                echo "  [ok] $name (pid: $(cat "$pidfile"))"
            else
                echo "  [--] $name"
                rm -f "$pidfile" 2>/dev/null
            fi
        done

        echo ""
        echo "Python servers:"
        for name in grid-rag grid-rag-enhanced grid-enhanced-tools portfolio-safety-lens code-analysis test-runner grid-intelligence; do
            pidfile="$PID_DIR/${name}.pid"
            if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
                echo "  [ok] $name (pid: $(cat "$pidfile"))"
            else
                echo "  [--] $name"
                rm -f "$pidfile" 2>/dev/null
            fi
        done
        ;;

    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
