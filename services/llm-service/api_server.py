#!/usr/bin/env python3
"""
Arasul Platform - LLM Service Management API
Provides endpoints for Dashboard and Self-Healing Engine

Endpoints:
  - GET  /health                  - Health check (Service availability)
  - GET  /api/models              - List all downloaded models
  - GET  /api/models/loaded       - List currently loaded models in RAM/VRAM
  - POST /api/models/pull         - Download a model
  - DELETE /api/models/delete     - Delete a model
  - POST /api/cache/clear         - Clear LLM cache (Self-Healing)
  - POST /api/session/reset       - Reset LLM session (Self-Healing)
  - GET  /api/stats               - GPU/Memory statistics
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import subprocess
import logging
import psutil
import os
import re
import json
import threading
import time
from datetime import datetime

app = Flask(__name__)
CORS(app)  # Enable CORS for Dashboard

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_MODEL = os.environ.get("LLM_MODEL", "llama3.1:8b")  # Used for session reset

# HIGH-PRIORITY-FIX 2.2: Background CPU monitoring to avoid blocking requests
_cpu_percent = 0.0
_cpu_last_update = 0
_cpu_lock = threading.Lock()

def _update_cpu_percent():
    """Background thread for CPU monitoring - updates every 3 seconds"""
    global _cpu_percent, _cpu_last_update
    while True:
        try:
            cpu = psutil.cpu_percent(interval=1)
            with _cpu_lock:
                _cpu_percent = cpu
                _cpu_last_update = time.time()
        except Exception as e:
            logger.warning(f"CPU monitoring error: {e}")
        time.sleep(2)  # Total cycle: 1s measure + 2s sleep = 3s

# Start CPU monitoring thread
_cpu_thread = threading.Thread(target=_update_cpu_percent, daemon=True)
_cpu_thread.start()


def create_retry_session(retries=3, backoff_factor=0.5):
    """
    HIGH-PRIORITY-FIX 2.3: Create HTTP session with automatic retry logic
    for transient network failures during model operations
    """
    session = requests.Session()
    retry = Retry(
        total=retries,
        backoff_factor=backoff_factor,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["POST", "GET", "DELETE"]
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=5, pool_maxsize=10)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session


# Global session with connection pooling and retry logic
_http_session = create_retry_session()


@app.route('/health', methods=['GET'])
def health():
    """
    Health check endpoint - checks only service availability
    NOT if a specific model is loaded (for flexibility)
    """
    try:
        # Check if Ollama is reachable
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        if response.status_code != 200:
            return jsonify({
                "status": "unhealthy",
                "reason": "Ollama API not responding"
            }), 503

        models = response.json().get("models", [])

        return jsonify({
            "status": "healthy",
            "models_count": len(models),
            "models": [m.get("name") for m in models]
        }), 200

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            "status": "unhealthy",
            "reason": str(e)
        }), 503


@app.route('/api/models', methods=['GET'])
def list_models():
    """List all downloaded models"""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if response.status_code != 200:
            return jsonify({"error": "Failed to fetch models"}), 500

        models_data = response.json().get("models", [])
        models = []
        for m in models_data:
            models.append({
                "name": m.get("name"),
                "size": m.get("size", 0),
                "modified_at": m.get("modified_at"),
                "digest": m.get("digest")
            })

        return jsonify({
            "models": models,
            "count": len(models)
        }), 200

    except Exception as e:
        logger.error(f"List models error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/models/pull', methods=['POST'])
def pull_model():
    """
    Download a model (called from Dashboard)
    Body: {"model": "llama3.1:8b"}

    HIGH-PRIORITY-FIX 2.3: Added retry logic and input validation
    """
    try:
        data = request.get_json()
        model_name = data.get("model")

        if not model_name:
            return jsonify({"error": "model parameter required"}), 400

        # Input validation - prevent injection and limit length
        if len(model_name) > 255:
            return jsonify({"error": "Model name too long (max 255 chars)"}), 400
        if not re.match(r'^[a-zA-Z0-9_:./-]+$', model_name):
            return jsonify({"error": "Invalid model name format"}), 400

        logger.info(f"Pulling model: {model_name}")

        # Use retry session for transient network failures
        # This will automatically retry up to 3 times with exponential backoff
        response = _http_session.post(
            f"{OLLAMA_BASE_URL}/api/pull",
            json={"name": model_name},
            stream=False,
            timeout=3600  # 1 hour timeout for large models
        )

        if response.status_code == 200:
            logger.info(f"Model {model_name} pulled successfully")
            return jsonify({
                "status": "success",
                "message": f"Model {model_name} pulled successfully"
            }), 200
        else:
            logger.error(f"Model pull failed: {response.text}")
            return jsonify({
                "status": "error",
                "message": response.text
            }), 500

    except requests.exceptions.RetryError as e:
        logger.error(f"Model pull failed after retries: {e}")
        return jsonify({
            "error": "Download failed after multiple retries. Please check network connection."
        }), 503
    except Exception as e:
        logger.error(f"Pull model error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/models/delete', methods=['DELETE'])
def delete_model():
    """
    Delete a model (called from Dashboard)
    Body: {"model": "llama3.1:8b"}
    """
    try:
        data = request.get_json()
        model_name = data.get("model")

        if not model_name:
            return jsonify({"error": "model parameter required"}), 400

        logger.info(f"Deleting model: {model_name}")

        response = requests.delete(
            f"{OLLAMA_BASE_URL}/api/delete",
            json={"name": model_name},
            timeout=30
        )

        if response.status_code == 200:
            logger.info(f"Model {model_name} deleted successfully")
            return jsonify({
                "status": "success",
                "message": f"Model {model_name} deleted successfully"
            }), 200
        else:
            logger.error(f"Model delete failed: {response.text}")
            return jsonify({
                "status": "error",
                "message": response.text
            }), 500

    except Exception as e:
        logger.error(f"Delete model error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """
    Clear LLM cache by unloading ALL currently loaded models
    Called by Self-Healing Engine on GPU overload
    """
    try:
        logger.info("Clearing LLM cache...")

        # First, get list of currently loaded models
        ps_response = requests.get(f"{OLLAMA_BASE_URL}/api/ps", timeout=3)
        loaded_models = ps_response.json().get('models', [])

        if not loaded_models:
            logger.info("No models loaded, cache already clear")
            return jsonify({
                "status": "success",
                "message": "Cache already clear (no models loaded)"
            }), 200

        # Unload each loaded model
        unloaded = []
        for model in loaded_models:
            model_name = model.get('name')
            try:
                response = requests.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": model_name,
                        "prompt": "",
                        "stream": False,
                        "keep_alive": 0  # Unload immediately
                    },
                    timeout=5
                )

                if response.status_code == 200:
                    unloaded.append(model_name)
                    logger.info(f"Unloaded model: {model_name}")
            except Exception as e:
                logger.warning(f"Failed to unload {model_name}: {e}")

        logger.info(f"Cache cleared successfully, unloaded {len(unloaded)} model(s)")
        return jsonify({
            "status": "success",
            "message": f"Cache cleared ({len(unloaded)} models unloaded)",
            "unloaded_models": unloaded
        }), 200

    except Exception as e:
        logger.error(f"Cache clear error: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route('/api/session/reset', methods=['POST'])
def reset_session():
    """
    Reset LLM Session (unload all models, then reload default model)
    Called by Self-Healing Engine on GPU errors
    """
    try:
        logger.info("Resetting LLM session...")

        # First, unload ALL loaded models (use cache/clear logic)
        ps_response = requests.get(f"{OLLAMA_BASE_URL}/api/ps", timeout=3)
        loaded_models = ps_response.json().get('models', [])

        for model in loaded_models:
            model_name = model.get('name')
            try:
                requests.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": model_name,
                        "prompt": "",
                        "stream": False,
                        "keep_alive": 0
                    },
                    timeout=5
                )
                logger.info(f"Unloaded model: {model_name}")
            except Exception as e:
                logger.warning(f"Failed to unload {model_name}: {e}")

        # Then reload the default model with test prompt
        # Use LLM_KEEP_ALIVE_SECONDS from environment (default 300)
        keep_alive = int(os.environ.get("LLM_KEEP_ALIVE_SECONDS", "300"))

        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": DEFAULT_MODEL,
                "prompt": "test",
                "stream": False,
                "keep_alive": keep_alive
            },
            timeout=60  # Allow time for model loading
        )

        if response.status_code == 200:
            logger.info(f"Session reset successfully, reloaded {DEFAULT_MODEL}")
            return jsonify({
                "status": "success",
                "message": f"Session reset, reloaded {DEFAULT_MODEL}"
            }), 200
        else:
            logger.error(f"Session reset failed: {response.text}")
            return jsonify({
                "status": "error",
                "message": "Failed to reload model after reset"
            }), 500

    except Exception as e:
        logger.error(f"Session reset error: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route('/api/stats', methods=['GET'])
def stats():
    """
    Return current GPU/Memory statistics

    HIGH-PRIORITY-FIX 2.1: Added validation for Jetson Orin GPU memory values
    HIGH-PRIORITY-FIX 2.2: Non-blocking CPU measurement via background thread
    """
    try:
        # GPU Stats via nvidia-smi
        gpu_util = "N/A"
        gpu_memory = "N/A"
        gpu_temp = "N/A"

        try:
            # SEC-010 FIX: Added check=True for safer subprocess execution
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
                 "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                timeout=2,
                check=True
            )
            parts = result.stdout.strip().split(',')

            # HIGH-PRIORITY-FIX 2.1: Validate GPU values (Jetson Orin returns [N/A])
            raw_util = parts[0].strip() if len(parts) > 0 else ""
            raw_mem_used = parts[1].strip() if len(parts) > 1 else ""
            raw_mem_total = parts[2].strip() if len(parts) > 2 else ""
            raw_temp = parts[3].strip() if len(parts) > 3 else ""

            # GPU Utilization validation
            if raw_util and raw_util.replace('%', '').isdigit():
                gpu_util = f"{raw_util}%"
            elif '[N/A]' in raw_util or 'N/A' in raw_util:
                gpu_util = "Integrated GPU"
            else:
                gpu_util = raw_util if raw_util else "N/A"

            # GPU Memory validation (Jetson uses shared memory)
            if raw_mem_used.isdigit() and raw_mem_total.isdigit():
                gpu_memory = f"{raw_mem_used}MB / {raw_mem_total}MB"
            elif '[N/A]' in raw_mem_used or '[N/A]' in raw_mem_total:
                gpu_memory = "Shared (Jetson)"
            else:
                gpu_memory = "N/A"

            # GPU Temperature validation
            if raw_temp and raw_temp.replace('.', '').isdigit():
                gpu_temp = f"{raw_temp}°C"
            elif '[N/A]' in raw_temp:
                gpu_temp = "N/A (Jetson)"
            else:
                gpu_temp = raw_temp if raw_temp else "N/A"

        except subprocess.CalledProcessError as e:
            logger.warning(f"nvidia-smi command failed: {e}")
        except Exception as e:
            logger.warning(f"Could not get GPU stats: {e}")

        # Process Memory
        process = psutil.Process()
        mem_info = process.memory_info()

        # HIGH-PRIORITY-FIX 2.2: Use cached CPU value from background thread
        # This eliminates the 1-second blocking call that was slowing down the endpoint
        with _cpu_lock:
            cpu_percent = _cpu_percent

        return jsonify({
            "gpu_utilization": gpu_util,
            "gpu_memory": gpu_memory,
            "gpu_temperature": gpu_temp,
            "process_memory_mb": round(mem_info.rss / 1024 / 1024, 2),
            "cpu_percent": cpu_percent,
            "timestamp": datetime.utcnow().isoformat() + 'Z'
        }), 200

    except Exception as e:
        logger.error(f"Stats error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/models/loaded', methods=['GET'])
def get_loaded_models():
    """
    Return which models are currently loaded in memory
    Uses Ollama's /api/ps endpoint to query running models
    """
    try:
        # Query Ollama's process status endpoint
        response = requests.get(f"{OLLAMA_BASE_URL}/api/ps", timeout=5)

        if response.status_code != 200:
            return jsonify({
                "loaded_models": [],
                "count": 0,
                "error": "Could not query Ollama process status"
            }), 200  # Return 200 with empty list instead of error

        data = response.json()
        models = data.get('models', [])

        # Extract relevant info
        loaded = []
        for model in models:
            loaded.append({
                "name": model.get("name"),
                "size_vram": model.get("size_vram", 0),
                "expires_at": model.get("expires_at")
            })

        return jsonify({
            "loaded_models": loaded,
            "count": len(loaded),
            "timestamp": datetime.utcnow().isoformat() + 'Z'
        }), 200

    except requests.exceptions.Timeout:
        logger.warning("Timeout querying Ollama /api/ps")
        return jsonify({
            "loaded_models": [],
            "count": 0,
            "error": "Timeout"
        }), 200
    except Exception as e:
        logger.error(f"Error getting loaded models: {e}")
        return jsonify({
            "loaded_models": [],
            "count": 0,
            "error": str(e)
        }), 200


@app.route('/api/info', methods=['GET'])
def info():
    """Return service information"""
    return jsonify({
        "service": "llm-service",
        "version": "1.0.0",
        "ollama_url": OLLAMA_BASE_URL,
        "default_model": DEFAULT_MODEL,
        "api_port": 11436
    }), 200


if __name__ == '__main__':
    logger.info("Starting LLM Management API on port 11436...")
    # Run on port 11436 (not 11434, that's Ollama itself)
    # Note: Port 11435 is used by embedding-service
    app.run(host='0.0.0.0', port=11436, debug=False)
