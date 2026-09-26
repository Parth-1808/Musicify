#!/bin/bash
set -e

echo "========================================================"
echo "  MUSIFY ULTRA HI-FI AUDIO ENGINE"
echo "  Device GPU-Accelerated Audio Processing Node"
echo "========================================================"
echo ""

if command -v docker &> /dev/null && docker info &> /dev/null; then
    echo "[OK] Docker is running. Starting containerized GPU engine..."
    docker compose up -d --build
    echo ""
    echo "Musify Engine is running at http://localhost:8000"
    exit 0
fi

echo "[INFO] Running Musify Engine locally via Python..."
if command -v python3 &> /dev/null; then
    python3 -m pip install -r server/requirements.txt
    python3 -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
elif command -v python &> /dev/null; then
    python -m pip install -r server/requirements.txt
    python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "[ERROR] Python 3 or Docker is required to run the local audio engine."
    exit 1
fi
