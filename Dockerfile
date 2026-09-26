# ==============================================================================
# Musify Ultra Hi-Fi - Device GPU-Accelerated Audio Engine Dockerfile
# Self-contained container with FFmpeg, Node.js runtime & Hardware Acceleration
# ==============================================================================

FROM python:3.11-slim-bookworm

# Environment optimizations
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    DEBIAN_FRONTEND=noninteractive \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,video,utility

# Install system dependencies:
# - ffmpeg: 320kbps audio transcoding & hardware DSP
# - nodejs & npm: JS challenge runtime for yt-dlp (prevents bot blocks)
# - curl & ca-certificates: healthcheck & secure downloads
# - libva2 & vainfo: VAAPI hardware acceleration for device GPU
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    npm \
    curl \
    ca-certificates \
    git \
    libva2 \
    vainfo \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements with caching
COPY server/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy server application
COPY server/ /app/

# Ensure required runtime directories exist
RUN mkdir -p /app/downloads /app/artwork /app/metadata /app/temp

# Expose audio engine port
EXPOSE 8000

# Health check probe
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Run FastAPI backend with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
