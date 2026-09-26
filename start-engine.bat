@echo off
title Musify Ultra Hi-Fi - Device GPU Audio Engine
echo ========================================================
echo   MUSIFY ULTRA HI-FI AUDIO ENGINE
echo   Device GPU-Accelerated Audio Processing Node
echo ========================================================
echo.

where docker >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Docker detected. Checking Docker daemon...
    docker info >nul 2>nul
    if %errorlevel% equ 0 (
        echo [OK] Launching Musify Engine via Docker with GPU Acceleration...
        docker compose up -d --build
        echo.
        echo Musify Engine is running at http://localhost:8000
        echo Open Musify app or Web Preview to start listening!
        pause
        exit /b 0
    )
)

echo [INFO] Running Musify Engine locally via Python...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Neither Docker nor Python was found.
    echo Please install Docker Desktop or Python 3.11+ to run the local audio engine.
    pause
    exit /b 1
)

python -m pip install -r server\requirements.txt
echo [OK] Starting FastAPI Audio Engine on port 8000...
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
pause
