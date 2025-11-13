# Arasul LLM Service

Flexible LLM service based on Ollama with Dashboard-managed model downloads.

## Features

- **No Pre-loaded Models**: Start fast (<30s), download models on-demand
- **Dashboard Integration**: Manage models via web interface
- **Persistent Storage**: Models stored in Docker volume
- **n8n Integration**: Direct access to Ollama API
- **Self-Healing APIs**: Cache clear, session reset, GPU stats
- **Multi-Model Support**: Run any Ollama-compatible model

## Architecture

```
Port 11434: Ollama API (for n8n workflows)
Port 11435: Management API (for Dashboard + Self-Healing)
```

## API Endpoints

### Management API (Port 11435)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service health check |
| `/api/models` | GET | List downloaded models |
| `/api/models/pull` | POST | Download a model |
| `/api/models/delete` | DELETE | Delete a model |
| `/api/cache/clear` | POST | Clear LLM cache |
| `/api/session/reset` | POST | Reset LLM session |
| `/api/stats` | GET | GPU/Memory stats |
| `/api/info` | GET | Service information |

### Ollama API (Port 11434)

See [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)

## Usage

### Building

```bash
docker-compose build llm-service
```

### Running

```bash
docker-compose up -d llm-service
```

### Downloading a Model

```bash
curl -X POST http://localhost:11435/api/models/pull \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.1:8b"}'
```

### Listing Models

```bash
curl http://localhost:11435/api/models
```

### Using in n8n

```javascript
// HTTP Request Node
URL: http://llm-service:11434/api/generate
Method: POST
Body: {
  "model": "llama3.1:8b",
  "prompt": "Your prompt here",
  "stream": false
}
```

## Volume

Models are stored in the `arasul-llm-models` volume at `/root/.ollama`:

```
/root/.ollama/
├── models/
│   ├── blobs/        (model files)
│   └── manifests/    (model metadata)
```

## Environment Variables

- `LLM_MODEL`: Default model name (default: `llama3.1:8b`)
- `LLM_CONTEXT_LENGTH`: Context window size (default: `8192`)
- `LLM_GPU_LAYERS`: GPU layers to use (default: `33`)

## Self-Healing Integration

The Self-Healing Engine uses these endpoints:

- `/api/cache/clear`: Free GPU memory on overload
- `/api/session/reset`: Recover from GPU errors
- `/api/stats`: Monitor resource usage

## Supported Models

Any model from [Ollama Library](https://ollama.com/library):

- `llama3.1:8b` (4.7GB)
- `llama3.1:70b` (40GB)
- `mistral:7b` (4.1GB)
- `codellama:7b` (3.8GB)
- `phi3:mini` (2.3GB)
- And many more...

## Troubleshooting

### Health check fails

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Check Management API
curl http://localhost:11435/health
```

### No models available

Download a model first:

```bash
curl -X POST http://localhost:11435/api/models/pull \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.1:8b"}'
```

### GPU not detected

Check NVIDIA Container Runtime:

```bash
docker run --rm --runtime=nvidia nvidia/cuda:12.0-base nvidia-smi
```

## License

Part of the Arasul Platform
