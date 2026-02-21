# Jetson PyTorch Container with CUDA 12.6 Support
# This container already includes PyTorch with GPU acceleration for ARM64
FROM dustynv/l4t-pytorch:r36.2.0

LABEL maintainer="Arasul Platform"
LABEL description="Embedding Service - Text vectorization with GPU support (Jetson Orin)"
LABEL org.opencontainers.image.architecture="arm64"

# Note: curl, wget, git, gcc already included in base image
# PyTorch 2.5 with CUDA 12.6 already pre-installed

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt ./

# Install Python dependencies WITHOUT torch (already in base image with CUDA)
# CRITICAL: sentence-transformers depends on torch, so install it without dependencies first
# Then install other packages normally
RUN pip3 install --no-cache-dir --index-url https://pypi.org/simple --ignore-installed blinker --no-deps sentence-transformers==3.0.1 && \
    pip3 install --no-cache-dir --index-url https://pypi.org/simple --ignore-installed blinker \
    flask==3.0.0 numpy==1.26.3 transformers==4.44.2 einops==0.7.0 "protobuf>=3.20" \
    tqdm scikit-learn scipy nltk sentencepiece huggingface-hub Pillow safetensors \
    flashrank==0.2.5

# Copy application code
COPY . .

# Create models directory
RUN mkdir -p /models

# Expose service port
EXPOSE 11435

# Health check
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:11435/health || exit 1

# Start the embedding service
CMD ["python3", "-u", "embedding_server.py"]
