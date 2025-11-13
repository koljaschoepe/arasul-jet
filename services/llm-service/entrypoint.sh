#!/bin/bash
###############################################################################
# Arasul Platform - LLM Service Entrypoint
# Starts Ollama server and Management API in parallel
###############################################################################

set -e

echo "================================================================"
echo "Arasul LLM Service Starting..."
echo "================================================================"

# Start Ollama server in background
echo "[1/3] Starting Ollama server..."
ollama serve &
OLLAMA_PID=$!
echo "Ollama server started with PID: $OLLAMA_PID"

# Wait until Ollama is ready
echo "[2/3] Waiting for Ollama to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "✓ Ollama is ready!"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "Waiting for Ollama... ($ATTEMPT/$MAX_ATTEMPTS)"
    sleep 2
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo "ERROR: Ollama failed to start within $((MAX_ATTEMPTS * 2)) seconds"
    kill $OLLAMA_PID 2>/dev/null || true
    exit 1
fi

# Start Management API server in background
echo "[3/3] Starting Management API server on port 11436..."
python3 /app/api_server.py &
API_PID=$!
echo "Management API started with PID: $API_PID"

# Wait for API to be ready
sleep 3
if curl -s http://localhost:11436/health > /dev/null 2>&1; then
    echo "✓ Management API is ready!"
else
    echo "WARNING: Management API health check failed (may still be starting)"
fi

echo "================================================================"
echo "LLM Service ready!"
echo "  - Ollama API:      http://localhost:11434"
echo "  - Management API:  http://localhost:11436"
echo "================================================================"

# Function to handle shutdown
shutdown() {
    echo ""
    echo "Shutting down LLM Service..."
    kill $OLLAMA_PID $API_PID 2>/dev/null || true
    wait $OLLAMA_PID $API_PID 2>/dev/null || true
    echo "LLM Service stopped"
    exit 0
}

# Trap signals
trap shutdown SIGTERM SIGINT

# Wait for either process to exit
wait -n

# If we reach here, one process died - kill the other and exit
echo "ERROR: One of the processes died unexpectedly"
kill $OLLAMA_PID $API_PID 2>/dev/null || true
exit 1
