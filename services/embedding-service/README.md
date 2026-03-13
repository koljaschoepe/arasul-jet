# Embedding Service

Text-to-vector embedding service for RAG and semantic search.

## Overview

| Property  | Value                            |
| --------- | -------------------------------- |
| Port      | 11435 (internal)                 |
| Framework | Flask                            |
| Runtime   | Python 3.10+                     |
| GPU       | CUDA-enabled (with CPU fallback) |

## Model

| Property    | Value               |
| ----------- | ------------------- |
| Model       | BAAI/bge-m3         |
| Vector Size | 1024 dimensions     |
| Max Tokens  | 8192                |
| Performance | <50ms per embedding |

## Directory Structure

```
embedding-service/
├── embedding_server.py   # Flask server with embedding logic
├── requirements.txt      # Python dependencies
├── Dockerfile           # Container definition (CUDA-enabled)
└── healthcheck.sh       # Custom health check script
```

## API Endpoints

| Method | Path      | Description                 |
| ------ | --------- | --------------------------- |
| POST   | `/embed`  | Generate embedding for text |
| GET    | `/health` | Health check                |
| GET    | `/models` | List loaded models          |

### POST /embed

**Request:**

```json
{
  "text": "Text to embed"
}
```

**Response:**

```json
{
  "embedding": [0.123, -0.456, ...],
  "dimensions": 1024,
  "model": "BAAI/bge-m3"
}
```

### GET /health

**Response:**

```json
{
  "status": "healthy",
  "model_loaded": true,
  "gpu_available": true,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Environment Variables

| Variable                   | Default     | Description       |
| -------------------------- | ----------- | ----------------- |
| EMBEDDING_SERVICE_PORT     | 11435       | Service port      |
| EMBEDDING_MODEL            | BAAI/bge-m3 | HuggingFace model |
| EMBEDDING_VECTOR_SIZE      | 1024        | Vector dimensions |
| EMBEDDING_MAX_INPUT_TOKENS | 8192        | Max input tokens  |
| CUDA_VISIBLE_DEVICES       | 0           | GPU device ID     |

## GPU Support

The service runs on NVIDIA GPU with CUDA:

- Base image: `dustynv/l4t-pytorch:${L4T_PYTORCH_TAG}` (Jetson-optimized, configurable via build arg)
- Default: `r36.4.0` (Orin/Ampere, JetPack 6.2). Override with `r37.0.0` for Thor/Blackwell.
- `TORCH_CUDA_ARCH_LIST` set at build time via `CUDA_ARCH_LIST` build arg (default: `8.7`)
- Automatic fallback to CPU if GPU unavailable
- GPU memory: ~2GB for model

## Health Check

Custom health check validates:

1. Flask server is responding
2. Model is loaded
3. Vectorization completes in <50ms

```bash
# Health check command
curl -s http://localhost:11435/health | grep -q '"status":"healthy"'
```

## Dependencies

- flask (3.0.0) - HTTP server
- sentence-transformers (2.3.1) - Embedding generation
- transformers (4.36.2) - ML framework
- torch - PyTorch (CUDA-enabled)
- numpy (1.26.3) - Numerical operations

## Performance

| Metric           | Target   |
| ---------------- | -------- |
| Single embedding | <50ms    |
| Batch (10 texts) | <200ms   |
| Model load time  | ~30s     |
| Memory usage     | ~2GB GPU |

## Docker Configuration

```yaml
embedding-service:
  runtime: nvidia
  environment:
    - NVIDIA_VISIBLE_DEVICES=all
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

## Related Documentation

- [Document Indexer](../document-indexer/README.md) - Uses embeddings for RAG
- [RAG System](../../CLAUDE.md#rag-system-retrieval-augmented-generation) - RAG overview
