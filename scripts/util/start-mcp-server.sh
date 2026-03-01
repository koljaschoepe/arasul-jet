#!/bin/bash
# Start MCP Remote Bash Server on the Jetson host
# This allows Claude Code CLI on your laptop to execute commands on the Jetson

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/../services/mcp-remote-bash"
PORT=${MCP_PORT:-3100}
WORKSPACE=${WORKSPACE:-/home/arasul/arasul/arasul-jet}

# Check if Python dependencies are installed
if ! python3 -c "import flask" 2>/dev/null; then
    echo "Installing Python dependencies..."
    pip3 install flask flask-cors --user
fi

echo "Starting MCP Remote Bash Server..."
echo "Port: $PORT"
echo "Workspace: $WORKSPACE"
echo ""
echo "To use with Claude Code on your laptop, add this to your MCP config:"
echo ""
echo "  mcpServers:"
echo "    jetson:"
echo "      url: http://$(hostname -I | awk '{print $1}'):$PORT"
echo ""

cd "$SERVER_DIR"
WORKSPACE="$WORKSPACE" PORT="$PORT" python3 -u server.py
