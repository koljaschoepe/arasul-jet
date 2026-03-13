# NVIDIA Jetson Compatibility Guide

This guide covers running the Arasul Platform on different NVIDIA Jetson devices.

## Supported Devices

| Device          | RAM   | GPU       | Status          | Recommended LLM |
| --------------- | ----- | --------- | --------------- | --------------- |
| Thor 128GB      | 128GB | Blackwell | Planned         | qwen3:32b-q8    |
| Thor 64GB       | 64GB  | Blackwell | Planned         | qwen3:14b-q8    |
| AGX Orin 64GB   | 64GB  | Ampere    | Fully Supported | qwen3:14b-q8    |
| AGX Orin 32GB   | 32GB  | Ampere    | Fully Supported | qwen3:8b-q8     |
| Orin NX 16GB    | 16GB  | Ampere    | Fully Supported | llama3.1:8b     |
| Orin NX 8GB     | 8GB   | Ampere    | Supported       | phi3:mini       |
| Orin Nano 8GB   | 8GB   | Ampere    | Supported       | phi3:mini       |
| Orin Nano 4GB   | 4GB   | Ampere    | Limited         | tinyllama:1.1b  |
| Xavier AGX 32GB | 32GB  | Volta     | Supported       | llama3.1:8b     |
| Xavier AGX 16GB | 16GB  | Volta     | Supported       | mistral:7b      |
| Xavier NX 8GB   | 8GB   | Volta     | Supported       | phi3:mini       |
| Jetson Nano 4GB | 4GB   | Maxwell   | Limited         | tinyllama:1.1b  |

## Quick Setup

### Auto-Detection

```bash
# Detect your device and generate configuration
./scripts/setup/detect-jetson.sh detect

# Generate and apply configuration
./scripts/setup/detect-jetson.sh generate
./scripts/setup/detect-jetson.sh apply

# See recommended models
./scripts/setup/detect-jetson.sh recommend
```

### Manual Configuration

Edit `.env` with values from your device profile:

```bash
# Copy template
cp .env.template .env

# Edit with your profile settings
nano .env
```

## Device Profiles

### Thor 128GB (Maximum Performance)

> **Note:** Thor support is based on preliminary specifications (Blackwell GPU, sm_100 compute capability). Configuration values may need adjustment when hardware is available. The `L4T_PYTORCH_TAG` for Thor (`r37.0.0`) is speculative and must be updated once NVIDIA publishes the corresponding dustynv base image.

```bash
# Resource Limits
# Budget: ~120G for services, ~8G reserved for OS
RAM_LIMIT_POSTGRES=4G
RAM_LIMIT_LLM=92G
RAM_LIMIT_EMBEDDING=8G
RAM_LIMIT_BACKEND=2G
RAM_LIMIT_FRONTEND=1G
RAM_LIMIT_N8N=2G
RAM_LIMIT_QDRANT=4G
RAM_LIMIT_MINIO=2G
RAM_LIMIT_METRICS=512M
RAM_LIMIT_SELF_HEALING=512M
RAM_LIMIT_TELEGRAM=256M
RAM_LIMIT_DOCUMENT_INDEXER=2G
RAM_LIMIT_REVERSE_PROXY=512M
RAM_LIMIT_BACKUP=256M
# Total allocated: ~119.5G

# CPU Limits (Thor expected 12-16+ cores)
CPU_LIMIT_LLM=12
CPU_LIMIT_EMBEDDING=4
CPU_LIMIT_BACKEND=4

# LLM Configuration
LLM_MODEL=qwen3:32b-q8
LLM_CONTEXT_LENGTH=32768
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=900
OLLAMA_STARTUP_TIMEOUT=240

# GPU Configuration
TORCH_CUDA_ARCH_LIST=10.0
L4T_PYTORCH_TAG=r37.0.0

# Recommended Models (in order of capability)
# - qwen3:32b-q8 (32GB) - Default, best quality
# - llama3.1:70b-q4 (40GB) - Maximum capability
# - codellama:70b (38GB) - Best for coding
# - mixtral:8x7b (26GB) - MoE architecture
# - deepseek-coder:33b (18GB) - Code specialist
```

### Thor 64GB (High Performance)

> **Note:** Same preliminary-specs caveat as Thor 128GB above.

```bash
# Resource Limits
# Budget: ~58G for services, ~6G reserved for OS
RAM_LIMIT_POSTGRES=2G
RAM_LIMIT_LLM=38G
RAM_LIMIT_EMBEDDING=6G
RAM_LIMIT_BACKEND=2G
RAM_LIMIT_FRONTEND=1G
RAM_LIMIT_N8N=2G
RAM_LIMIT_QDRANT=3G
RAM_LIMIT_MINIO=2G
RAM_LIMIT_METRICS=512M
RAM_LIMIT_SELF_HEALING=512M
RAM_LIMIT_TELEGRAM=256M
RAM_LIMIT_DOCUMENT_INDEXER=2G
RAM_LIMIT_REVERSE_PROXY=512M
RAM_LIMIT_BACKUP=256M
# Total allocated: ~57.5G

# CPU Limits
CPU_LIMIT_LLM=10
CPU_LIMIT_EMBEDDING=4
CPU_LIMIT_BACKEND=4

# LLM Configuration
LLM_MODEL=qwen3:14b-q8
LLM_CONTEXT_LENGTH=16384
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=600
OLLAMA_STARTUP_TIMEOUT=180

# GPU Configuration
TORCH_CUDA_ARCH_LIST=10.0
L4T_PYTORCH_TAG=r37.0.0

# Recommended Models
# - qwen3:14b-q8 (15GB) - Default, best balance
# - llama3.1:70b-q4 (40GB) - Maximum capability
# - codellama:34b (19GB) - Best for coding
# - mixtral:8x7b (26GB) - MoE architecture
```

### AGX Orin 64GB (Maximum Performance)

```bash
# Resource Limits
RAM_LIMIT_LLM=48G
RAM_LIMIT_EMBEDDING=8G
RAM_LIMIT_QDRANT=4G
RAM_LIMIT_MINIO=4G

# LLM Configuration
LLM_MODEL=qwen3:14b-q8
LLM_CONTEXT_LENGTH=16384
LLM_GPU_LAYERS=99

# Recommended Models
# - qwen3:14b-q8 (15GB) - Default, excellent quality
# - llama3.1:70b-q4 (40GB) - Maximum capability
# - codellama:34b (19GB) - Best for coding
# - mixtral:8x7b (26GB) - MoE architecture
```

### AGX Orin 32GB (High Performance)

```bash
# Resource Limits
RAM_LIMIT_LLM=24G
RAM_LIMIT_EMBEDDING=4G
RAM_LIMIT_QDRANT=2G
RAM_LIMIT_MINIO=2G

# LLM Configuration
LLM_MODEL=qwen3:8b-q8
LLM_CONTEXT_LENGTH=8192
LLM_GPU_LAYERS=99

# Recommended Models
# - qwen3:8b-q8 (8GB) - Default, great balance
# - llama3.1:8b (5GB) - Fast & capable
# - codellama:13b (7GB) - Good for coding
# - mistral:7b (4GB) - Efficient
```

### Orin NX 16GB (Balanced)

```bash
# Resource Limits
RAM_LIMIT_LLM=10G
RAM_LIMIT_EMBEDDING=2G
RAM_LIMIT_QDRANT=1G
RAM_LIMIT_MINIO=1G

# LLM Configuration
LLM_MODEL=llama3.1:8b
LLM_CONTEXT_LENGTH=4096
LLM_GPU_LAYERS=99

# Recommended Models
# - llama3.1:8b (5GB) - Default
# - mistral:7b (4GB) - Fast
# - phi3:mini (2GB) - Efficient
```

### Orin 8GB (NX/Nano)

```bash
# Resource Limits
RAM_LIMIT_LLM=5G
RAM_LIMIT_EMBEDDING=1G
RAM_LIMIT_QDRANT=512M
RAM_LIMIT_MINIO=512M

# LLM Configuration
LLM_MODEL=phi3:mini
LLM_CONTEXT_LENGTH=2048
LLM_GPU_LAYERS=99

# Recommended Models
# - phi3:mini (2GB) - Default, best for 8GB
# - gemma:2b (1.5GB) - Lightweight
# - tinyllama:1.1b (0.6GB) - Minimal
```

### Minimal 4GB (Orin Nano 4GB / Jetson Nano)

```bash
# Resource Limits
RAM_LIMIT_LLM=2G
RAM_LIMIT_EMBEDDING=512M
RAM_LIMIT_QDRANT=256M
RAM_LIMIT_MINIO=256M

# LLM Configuration
LLM_MODEL=tinyllama:1.1b
LLM_CONTEXT_LENGTH=1024
LLM_GPU_LAYERS=99

# Disable optional services
DISABLE_N8N=true
DISABLE_TELEGRAM=true

# Recommended Models
# - tinyllama:1.1b (0.6GB) - Default
# - qwen:0.5b (0.3GB) - Smallest
```

## Thor vs Orin: Key Differences

| Property               | Thor 128GB                 | AGX Orin 64GB   |
| ---------------------- | -------------------------- | --------------- |
| GPU Architecture       | Blackwell                  | Ampere          |
| Unified Memory         | 128GB                      | 64GB            |
| CUDA Compute Cap.      | sm_100 (speculative)       | sm_87           |
| Default LLM Model      | qwen3:32b-q8               | qwen3:14b-q8    |
| Max Context Length     | 32768                      | 16384           |
| LLM RAM Allocation     | 92G                        | 48G             |
| Ollama Startup Timeout | 240s                       | 180s            |
| L4T PyTorch Tag        | r37.0.0 (TBD)              | r36.4.0         |
| Expected CPU Cores     | 12-16+                     | 12              |
| Status                 | Planned (specs may change) | Fully Supported |

**Setup differences:**

- Thor detection uses a 5-level hierarchy in `detect-jetson.sh`: device-tree model, compatible string, chip ID (36/37/38), nvidia-smi GPU name, and RAM-based fallback (>=120GB).
- Thor profiles set a longer `OLLAMA_STARTUP_TIMEOUT` (240s for 128GB, 180s for 64GB) because larger default models take more time to load.
- The `L4T_PYTORCH_TAG` for Thor (`r37.0.0`) is a placeholder. It must be updated once NVIDIA publishes the Thor JetPack release and dustynv provides a matching base image.
- FP16 embeddings are disabled by default on Thor (enough RAM for FP32), while most Orin variants use FP16 to save memory.

## CUDA Architecture

Each Jetson family has a different CUDA compute capability:

| Family | Architecture | Compute Capability | L4T PyTorch Tag |
| ------ | ------------ | ------------------ | --------------- |
| Thor   | Blackwell    | 10.0 (speculative) | r37.0.0 (TBD)   |
| Orin   | Ampere       | 8.7                | r36.4.0         |
| Xavier | Volta        | 7.2                | r35.4.1         |
| TX2    | Pascal       | 6.2                | -               |
| Nano   | Maxwell      | 5.3                | -               |

The detection script automatically sets `TORCH_CUDA_ARCH_LIST` based on your device. The value is passed as the `CUDA_ARCH_LIST` build arg to the embedding-service Dockerfile and set as the `TORCH_CUDA_ARCH_LIST` runtime environment variable for PyTorch.

## Memory Management

### Unified Memory

Jetson devices use unified memory (CPU and GPU share RAM). Key considerations:

1. **Total RAM** is shared between system, GPU, and containers
2. **GPU memory** is dynamically allocated from system RAM
3. **Leave 2-4GB** for the operating system
4. **LLM models** load entirely into GPU memory when active

### Memory Calculation

```
Available for containers = Total RAM - OS overhead (2GB) - GPU buffer (1GB)

Example (AGX Orin 64GB):
Available = 64GB - 2GB - 1GB = 61GB
```

### Memory Optimization

For low-memory devices:

```bash
# Use FP16 for embeddings (50% memory savings)
EMBEDDING_USE_FP16=true

# Reduce LLM context length
LLM_CONTEXT_LENGTH=2048

# Reduce embedding batch size
EMBEDDING_MAX_BATCH_SIZE=10

# Unload LLM faster
LLM_KEEP_ALIVE_SECONDS=60
```

## Performance Tuning

### High Performance Mode

For maximum performance (higher power consumption):

```bash
# Set Jetson to MAX power mode
sudo nvpmodel -m 0
sudo jetson_clocks

# Increase LLM context
LLM_CONTEXT_LENGTH=16384

# Keep model loaded longer
LLM_KEEP_ALIVE_SECONDS=600
```

### Power-Saving Mode

For reduced power consumption:

```bash
# Set Jetson to power-saving mode
sudo nvpmodel -m 1

# Reduce context length
LLM_CONTEXT_LENGTH=4096

# Unload model faster
LLM_KEEP_ALIVE_SECONDS=60

# Use smaller models
LLM_MODEL=phi3:mini
```

## Troubleshooting

### Out of Memory (OOM)

```bash
# Clear GPU cache
docker exec llm-service curl -X POST http://localhost:11436/api/cache/clear

# Reduce model size
# Edit .env: LLM_MODEL=phi3:mini

# Reduce context length
# Edit .env: LLM_CONTEXT_LENGTH=2048
```

### Slow Startup

```bash
# Increase startup timeout
OLLAMA_STARTUP_TIMEOUT=300

# Check if model is being downloaded
docker compose logs llm-service -f
```

### GPU Not Detected

```bash
# Check NVIDIA runtime
docker run --rm --runtime=nvidia nvidia/cuda:12.0-base nvidia-smi

# Verify Jetson GPU
tegrastats

# Check JetPack version
cat /etc/nv_tegra_release
```

### Model Too Large

If a model doesn't fit in memory:

1. Try a quantized version (e.g., `llama3.1:8b-q4` instead of `llama3.1:8b`)
2. Use a smaller model from the recommendations
3. Reduce context length

## Model Download

```bash
# Download recommended model for your device
./scripts/setup/detect-jetson.sh recommend

# Download a specific model
docker exec llm-service ollama pull mistral:7b

# List installed models
docker exec llm-service ollama list
```

## Service Scaling

For low-memory devices, disable optional services:

```bash
# In .env
DISABLE_N8N=true
DISABLE_TELEGRAM=true

# Start without optional services
docker compose up -d --scale n8n=0 --scale telegram-bot=0
```

## JetPack Requirements

| JetPack Version | Supported Devices | CUDA Version |
| --------------- | ----------------- | ------------ |
| 7.x (planned)   | Thor family       | TBD          |
| 6.0+            | Orin family       | CUDA 12.2    |
| 5.x             | Xavier, Orin      | CUDA 11.4    |
| 4.6             | Nano, TX2         | CUDA 10.2    |

Minimum recommended: **JetPack 5.1** or higher. Thor devices will require JetPack 7.x (not yet released).

## GPU Error Handling & Recovery

The platform includes automatic GPU error detection and recovery via the Self-Healing Agent.

### GPU Monitoring

The metrics-collector runs a GPU monitor (`gpu_monitor.py`, NVML-based) with Jetson AGX Orin support and fallback to `nvidia-smi`.

**API endpoint**: `GET http://metrics-collector:9100/api/gpu`

### Error Detection Thresholds

| Type            | Threshold        | Action                          |
| --------------- | ---------------- | ------------------------------- |
| Memory Warning  | > 36 GB          | Clear LLM cache                 |
| Memory Critical | > 38 GB          | Reset GPU session (LLM restart) |
| Memory Max      | > 40 GB          | Hard limit (PRD)                |
| Temp Warning    | > 83 C           | Throttle GPU (power limit 80%)  |
| Temp Critical   | > 85 C           | Restart LLM service             |
| Temp Shutdown   | > 90 C           | Emergency stop LLM              |
| GPU Hang        | 99% util for 30s | `nvidia-smi --gpu-reset`        |

### Recovery Actions

| Action        | Trigger       | Method                   |
| ------------- | ------------- | ------------------------ |
| Clear Cache   | Memory > 36GB | Ollama models unload     |
| Reset Session | Memory > 38GB | LLM service restart      |
| Throttle GPU  | Temp > 83 C   | Power limit 80%          |
| Restart LLM   | Temp > 85 C   | Service restart          |
| Stop LLM      | Temp > 90 C   | Emergency stop           |
| Reset GPU     | GPU Hang      | `nvidia-smi --gpu-reset` |

### Jetson-Specific Features

- `jetson_clocks --fan` for thermal management
- Thermal zone reading (`/sys/class/thermal/`)
- Power limiting via nvidia-smi

### Files

- `services/metrics-collector/gpu_monitor.py` - GPU monitoring module
- `services/self-healing-agent/gpu_recovery.py` - Recovery actions
- `apps/dashboard-backend/src/routes/system/services.js` - `/api/services/ai` endpoint

## Related Documentation

- [Deployment Guide](DEPLOYMENT.md)
- [LLM Service](../services/llm-service/README.md)
- [Embedding Service](../services/embedding-service/README.md)
- [Self-Healing Agent](../services/self-healing-agent/README.md)
