#!/usr/bin/env python3
"""
Arasul Platform - LLM Service Management API
Provides endpoints for Dashboard and Self-Healing Engine

Endpoints:
  - GET  /health                  - Health check (Service availability)
  - GET  /api/models              - List all downloaded models
  - POST /api/models/pull         - Download a model
  - DELETE /api/models/delete     - Delete a model
  - POST /api/cache/clear         - Clear LLM cache (Self-Healing)
  - POST /api/session/reset       - Reset LLM session (Self-Healing)
  - GET  /api/stats               - GPU/Memory statistics
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import subprocess
import logging
import psutil
import os
import json

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
DEFAULT_MODEL = os.environ.get("LLM_MODEL", "llama3.1:8b")


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
    """
    try:
        data = request.get_json()
        model_name = data.get("model")

        if not model_name:
            return jsonify({"error": "model parameter required"}), 400

        logger.info(f"Pulling model: {model_name}")

        # Start model pull (can take long!)
        response = requests.post(
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
    Clear LLM cache by unloading model
    Called by Self-Healing Engine on GPU overload
    """
    try:
        logger.info("Clearing LLM cache...")

        # Unload all models (frees GPU memory)
        # Ollama doesn't have direct "unload" endpoint, but we can
        # unload by sending keep_alive: 0
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": DEFAULT_MODEL,
                "prompt": "",
                "stream": False,
                "keep_alive": 0  # Unload model immediately
            },
            timeout=5
        )

        if response.status_code == 200 or response.status_code == 404:
            logger.info("Cache cleared successfully")
            return jsonify({
                "status": "success",
                "message": "Cache cleared"
            }), 200
        else:
            logger.error(f"Cache clear failed: {response.text}")
            return jsonify({
                "status": "error",
                "message": "Failed to clear cache"
            }), 500

    except Exception as e:
        logger.error(f"Cache clear error: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route('/api/session/reset', methods=['POST'])
def reset_session():
    """
    Reset LLM Session (reload model completely)
    Called by Self-Healing Engine on GPU errors
    """
    try:
        logger.info("Resetting LLM session...")

        # First unload
        requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": DEFAULT_MODEL,
                "prompt": "",
                "stream": False,
                "keep_alive": 0
            },
            timeout=5
        )

        # Then reload with small test prompt
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": DEFAULT_MODEL,
                "prompt": "test",
                "stream": False,
                "keep_alive": 300  # Keep in memory for 5 minutes
            },
            timeout=10
        )

        if response.status_code == 200:
            logger.info("Session reset successfully")
            return jsonify({
                "status": "success",
                "message": "Session reset"
            }), 200
        else:
            logger.error(f"Session reset failed: {response.text}")
            return jsonify({
                "status": "error",
                "message": "Failed to reset session"
            }), 500

    except Exception as e:
        logger.error(f"Session reset error: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route('/api/stats', methods=['GET'])
def stats():
    """Return current GPU/Memory statistics"""
    try:
        # GPU Stats via nvidia-smi
        gpu_util = "N/A"
        gpu_memory = "N/A"
        gpu_temp = "N/A"

        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
                 "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0:
                parts = result.stdout.strip().split(',')
                gpu_util = f"{parts[0].strip()}%"
                gpu_memory = f"{parts[1].strip()}MB / {parts[2].strip()}MB"
                gpu_temp = f"{parts[3].strip()}°C"
        except Exception as e:
            logger.warning(f"Could not get GPU stats: {e}")

        # Process Memory
        process = psutil.Process()
        mem_info = process.memory_info()

        # CPU usage
        cpu_percent = psutil.cpu_percent(interval=1)

        return jsonify({
            "gpu_utilization": gpu_util,
            "gpu_memory": gpu_memory,
            "gpu_temperature": gpu_temp,
            "process_memory_mb": round(mem_info.rss / 1024 / 1024, 2),
            "cpu_percent": cpu_percent,
            "timestamp": subprocess.check_output(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"]).decode().strip()
        }), 200

    except Exception as e:
        logger.error(f"Stats error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/info', methods=['GET'])
def info():
    """Return service information"""
    return jsonify({
        "service": "llm-service",
        "version": "1.0.0",
        "ollama_url": OLLAMA_BASE_URL,
        "default_model": DEFAULT_MODEL,
        "api_port": 11435
    }), 200


if __name__ == '__main__':
    logger.info("Starting LLM Management API on port 11435...")
    # Run on port 11435 (not 11434, that's Ollama itself)
    app.run(host='0.0.0.0', port=11435, debug=False)
