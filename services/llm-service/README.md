# Arasul LLM Service

Flexible LLM service based on Ollama with Dashboard-managed model downloads, optimized for NVIDIA Jetson AGX Orin.

## Overview

| Property | Value |
|----------|-------|
| Ollama Port | 11434 (inference API) |
| Management Port | 11436 (Flask API) |
| Container | llm-service |
| GPU | NVIDIA Jetson AGX Orin (64GB) |
| Default Model | qwen3:14b-q8 |

## Features

- **No Pre-loaded Models**: Fast startup (<30s), download on-demand
- **Dashboard Integration**: Manage models via web interface
- **Persistent Storage**: Models stored in Docker volume
- **n8n Integration**: Direct access to Ollama API
- **Self-Healing APIs**: Cache clear, session reset, GPU stats
- **Multi-Model Support**: Run any Ollama-compatible model
- **Jetson Optimization**: GPU memory handling for ARM64

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      LLM SERVICE                            │
├─────────────────────────────────────────────────────────────┤
│  Port 11434: Ollama API          Port 11436: Management API │
│  - /api/generate                 - /health                  │
│  - /api/chat                     - /api/models              │
│  - /api/embeddings               - /api/models/pull         │
│  - /api/tags                     - /api/cache/clear         │
│                                  - /api/session/reset       │
│                                  - /api/stats               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Jetson Orin    │
                    │  GPU (64GB)     │
                    └─────────────────┘
```

**Note:** Port 11435 is reserved for the Embedding Service.

## API Endpoints

### Management API (Port 11436)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | 4-point health check |
| `/api/models` | GET | List downloaded models with metadata |
| `/api/models/loaded` | GET | Currently loaded model in VRAM |
| `/api/models/pull` | POST | Download model (with retry) |
| `/api/models/delete` | DELETE | Delete cached model |
| `/api/cache/clear` | POST | Unload all models (GPU recovery) |
| `/api/session/reset` | POST | Unload then reload default model |
| `/api/stats` | GET | GPU/CPU/Memory metrics |
| `/api/info` | GET | Service metadata |

### Ollama API (Port 11434)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate` | POST | Text generation |
| `/api/chat` | POST | Chat completion |
| `/api/tags` | GET | List available models |
| `/api/show` | POST | Model information |
| `/api/pull` | POST | Download model (streaming) |
| `/api/delete` | DELETE | Remove model |

See [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| LLM_MODEL | qwen3:14b-q8 | Default model name |
| LLM_CONTEXT_LENGTH | 8192 | Context window size |
| LLM_GPU_LAYERS | 33 | GPU layers to use |
| LLM_KEEP_ALIVE_SECONDS | 300 | Model keep-alive time |
| OLLAMA_STARTUP_TIMEOUT | 120 | Startup timeout (seconds) |
| OLLAMA_HOST | 0.0.0.0 | Ollama bind address |
| OLLAMA_ORIGINS | * | Allowed CORS origins |

## Health Check Implementation

The health check performs a 4-point verification:

```bash
# 1. API Availability
curl -s http://localhost:11434/api/tags

# 2. GPU Status
nvidia-smi --query-gpu=memory.used --format=csv,noheader

# 3. Model Loaded (optional)
curl -s http://localhost:11436/api/models/loaded

# 4. Error Log Check
grep -i "error\|fatal" /var/log/ollama.log | tail -5
```

**Behavior:**
- Uses jq for JSON parsing with grep fallback
- Handles Jetson Orin GPU memory reporting quirks
- Does NOT test model prompt (avoids loading model into RAM)
- Gracefully handles startup period (300s timeout)

## Management API Details

### Retry Logic

The Management API uses HTTPAdapter with retry logic:

```python
# Retry configuration
retries = Retry(
    total=3,
    backoff_factor=0.5,
    status_forcelist=[500, 502, 503, 504]
)
```

### Model Metadata Caching

- Cache TTL: 30 seconds
- Reduces Ollama API calls
- Invalidated on model operations

### Background CPU Monitoring

- Runs in separate thread
- Avoids blocking API requests
- Updates every 5 seconds

## Jetson Orin Platform

### GPU Memory Handling

The Jetson AGX Orin reports GPU memory differently:

```python
# Handle [N/A] responses from nvidia-smi
if "N/A" in gpu_memory:
    # Use jetson_stats or fallback values
    gpu_memory = get_jetson_memory()
```

### CUDA Compatibility

- CUDA 12.x required
- JetPack 6.0+ recommended
- ARM64 optimized builds

### Memory Management

```python
# Default VRAM allocation
OLLAMA_GPU_MEMORY_FRACTION=0.8  # 80% of available GPU memory
```

## Usage

### Building

```bash
docker compose build llm-service
```

### Running

```bash
docker compose up -d llm-service
```

### Downloading a Model

```bash
# Via Management API (recommended)
curl -X POST http://localhost:11436/api/models/pull \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3:14b-q8"}'

# Via Ollama API (streaming)
curl http://localhost:11434/api/pull \
  -d '{"name":"qwen3:14b-q8"}'
```

### Listing Models

```bash
# Management API (with metadata)
curl http://localhost:11436/api/models

# Response:
{
  "models": [
    {
      "name": "qwen3:14b-q8",
      "size": 15032385536,
      "modified_at": "2024-01-24T10:00:00Z",
      "digest": "sha256:...",
      "format": "gguf",
      "family": "qwen3",
      "parameter_size": "14B",
      "quantization": "Q8_0"
    }
  ]
}
```

### Using in n8n

```javascript
// HTTP Request Node
URL: http://llm-service:11434/api/generate
Method: POST
Body: {
  "model": "qwen3:14b-q8",
  "prompt": "Your prompt here",
  "stream": false,
  "options": {
    "temperature": 0.7,
    "num_ctx": 8192
  }
}
```

### Chat Completion

```bash
curl http://localhost:11434/api/chat \
  -d '{
    "model": "qwen3:14b-q8",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'
```

## Volume

Models are stored in the `arasul-llm-models` volume:

```
/root/.ollama/
├── models/
│   ├── blobs/        (model weight files)
│   └── manifests/    (model metadata)
└── logs/             (Ollama logs)
```

## Self-Healing Integration

The Self-Healing Engine uses these endpoints:

| Endpoint | Trigger | Action |
|----------|---------|--------|
| `/api/cache/clear` | GPU memory >95% | Free VRAM |
| `/api/session/reset` | GPU errors | Reload model |
| `/api/stats` | Monitoring | Check resources |

## Supported Models

Recommended models for Jetson AGX Orin (64GB):

| Model | Size | VRAM | Use Case |
|-------|------|------|----------|
| qwen3:14b-q8 | 15GB | ~20GB | General purpose (default) |
| llama3.1:8b | 4.7GB | ~8GB | Fast responses |
| llama3.1:70b-q4 | 40GB | ~50GB | High quality |
| codellama:34b | 19GB | ~25GB | Code generation |
| mistral:7b | 4.1GB | ~7GB | Lightweight |
| phi3:mini | 2.3GB | ~4GB | Edge deployment |

Full catalog: [Ollama Library](https://ollama.com/library)

## Performance Tuning

### Context Length

```bash
# Increase for longer conversations
LLM_CONTEXT_LENGTH=16384

# Memory impact: ~2GB per 4096 tokens
```

### Keep-Alive

```bash
# Keep model in VRAM longer (reduces reload time)
LLM_KEEP_ALIVE_SECONDS=600

# Set to 0 to unload immediately after request
LLM_KEEP_ALIVE_SECONDS=0
```

### GPU Layers

```bash
# Full GPU acceleration (default)
LLM_GPU_LAYERS=33

# Partial (saves VRAM, slower)
LLM_GPU_LAYERS=20
```

## Troubleshooting

### Health Check Fails

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Check Management API
curl http://localhost:11436/health

# Check logs
docker compose logs llm-service --tail 50
```

### No Models Available

```bash
# Download default model
curl -X POST http://localhost:11436/api/models/pull \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3:14b-q8"}'
```

### GPU Not Detected

```bash
# Check NVIDIA runtime
docker run --rm --runtime=nvidia nvidia/cuda:12.0-base nvidia-smi

# Check Jetson GPU
tegrastats
```

### Out of Memory (OOM)

```bash
# Clear GPU cache
curl -X POST http://localhost:11436/api/cache/clear

# Check GPU memory
nvidia-smi --query-gpu=memory.used,memory.free --format=csv
```

### Slow Startup

- First model download takes time (network dependent)
- Model loading: 30-60 seconds for 14B models
- Increase OLLAMA_STARTUP_TIMEOUT if needed

## Related Documentation

- [Embedding Service](../embedding-service/README.md)
- [Self-Healing Agent](../self-healing-agent/README.md)
- [Models API](../../docs/API_REFERENCE.md#models)
- [Ollama Docs](https://github.com/ollama/ollama)
