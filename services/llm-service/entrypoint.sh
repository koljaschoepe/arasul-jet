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
# CRITICAL-FIX: Configurable timeout via environment variable (default: 120s)
# This prevents startup failures on heavily loaded systems where Ollama takes longer to initialize
OLLAMA_STARTUP_TIMEOUT=${OLLAMA_STARTUP_TIMEOUT:-120}
MAX_ATTEMPTS=$((OLLAMA_STARTUP_TIMEOUT / 2))
ATTEMPT=0

echo "[2/3] Waiting for Ollama to be ready (max ${OLLAMA_STARTUP_TIMEOUT}s)..."

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "✓ Ollama is ready! (took $((ATTEMPT * 2))s)"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "Waiting for Ollama... ($ATTEMPT/$MAX_ATTEMPTS)"
    sleep 2
done

if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
    echo "ERROR: Ollama failed to start within ${OLLAMA_STARTUP_TIMEOUT} seconds"
    echo "TIP: Set OLLAMA_STARTUP_TIMEOUT to a higher value if this persists"
    kill $OLLAMA_PID 2>/dev/null || true
    exit 1
fi

# BUG-001 FIX: Auto-import GGUF models from /host-models if not already imported
echo "[2.5/3] Checking for models to import..."

# Check if Qwen3 14B GGUF exists and needs to be imported
GGUF_FILE="/host-models/Qwen3-14B-Q8_0.gguf"
MODEL_NAME="qwen3:14b-q8"

if [ -f "$GGUF_FILE" ]; then
    echo "Found GGUF file: $GGUF_FILE"

    # PHASE1-FIX (HIGH-P04): Use -F (fixed string) instead of regex with variable
    # This prevents potential issues if MODEL_NAME ever contains regex special chars
    MODEL_EXISTS=$(curl -s http://localhost:11434/api/tags | grep -F "\"name\":\"${MODEL_NAME}\"" || true)

    if [ -z "$MODEL_EXISTS" ]; then
        echo "Importing model (this will take ~30 seconds)..."

        # Create Modelfile
        cat > /tmp/Modelfile <<EOF
FROM ${GGUF_FILE}

TEMPLATE """{{- if .System }}
<|im_start|>system
{{ .System }}<|im_end|>
{{- end }}
<|im_start|>user
{{ .Prompt }}<|im_end|>
<|im_start|>assistant
"""

PARAMETER stop <|im_start|>
PARAMETER stop <|im_end|>
PARAMETER temperature 0.7
PARAMETER top_p 0.8
PARAMETER top_k 40
PARAMETER repeat_penalty 1.05
EOF

        # Import model
        if ollama create ${MODEL_NAME} -f /tmp/Modelfile; then
            echo "✓ Model imported successfully: ${MODEL_NAME}"
        else
            echo "ERROR: Failed to import model"
        fi
    else
        echo "✓ Model already imported: ${MODEL_NAME}"
    fi
else
    echo "No GGUF file found at ${GGUF_FILE}"
fi

# Model is NOT pre-loaded - will load on-demand at first request
# This saves GPU RAM when LLM is idle
echo "[2.75/3] Skipping model pre-load (on-demand loading enabled)"
echo "✓ Model will load automatically on first request"

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
