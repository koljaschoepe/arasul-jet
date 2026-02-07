# NVIDIA Jetson Compatibility Guide

This guide covers running the Arasul Platform on different NVIDIA Jetson devices.

## Supported Devices

| Device | RAM | GPU | Status | Recommended LLM |
|--------|-----|-----|--------|-----------------|
| AGX Orin 64GB | 64GB | Ampere | Fully Supported | qwen3:14b-q8 |
| AGX Orin 32GB | 32GB | Ampere | Fully Supported | qwen3:8b-q8 |
| Orin NX 16GB | 16GB | Ampere | Fully Supported | llama3.1:8b |
| Orin NX 8GB | 8GB | Ampere | Supported | phi3:mini |
| Orin Nano 8GB | 8GB | Ampere | Supported | phi3:mini |
| Orin Nano 4GB | 4GB | Ampere | Limited | tinyllama:1.1b |
| Xavier AGX 32GB | 32GB | Volta | Supported | llama3.1:8b |
| Xavier AGX 16GB | 16GB | Volta | Supported | mistral:7b |
| Xavier NX 8GB | 8GB | Volta | Supported | phi3:mini |
| Jetson Nano 4GB | 4GB | Maxwell | Limited | tinyllama:1.1b |

## Quick Setup

### Auto-Detection

```bash
# Detect your device and generate configuration
./scripts/detect-jetson.sh detect

# Generate and apply configuration
./scripts/detect-jetson.sh generate
./scripts/detect-jetson.sh apply

# See recommended models
./scripts/detect-jetson.sh recommend
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

## CUDA Architecture

Each Jetson family has a different CUDA compute capability:

| Family | Architecture | Compute Capability |
|--------|--------------|-------------------|
| Orin | Ampere | 8.7 |
| Xavier | Volta | 7.2 |
| TX2 | Pascal | 6.2 |
| Nano | Maxwell | 5.3 |

The detection script automatically sets `TORCH_CUDA_ARCH_LIST` based on your device.

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
./scripts/detect-jetson.sh recommend

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
|-----------------|-------------------|--------------|
| 6.0+ | Orin family | CUDA 12.2 |
| 5.x | Xavier, Orin | CUDA 11.4 |
| 4.6 | Nano, TX2 | CUDA 10.2 |

Minimum recommended: **JetPack 5.1** or higher.

## Related Documentation

- [Installation Guide](../INSTALLATION.md)
- [LLM Service](../services/llm-service/README.md)
- [Embedding Service](../services/embedding-service/README.md)
- [Self-Healing Agent](../services/self-healing-agent/README.md)
