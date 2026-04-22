#!/bin/bash

# ============================================================
#  start.sh — Orchestration script for Railway
#  Starts Python API in background, then Node.js in foreground.
# ============================================================

echo "🚀 Starting Python API Engine..."
# Export PATH agar background process bisa menemukan node/ffmpeg
export PATH=/app/venv/bin:/home/railway/.local/bin:/root/.local/bin:/usr/bin:/usr/local/bin:$PATH
export PYTHONUNBUFFERED=1
# Gunakan python dari venv yang dibuat pada saat build
PYTHON=/app/venv/bin/python
if [ ! -f "$PYTHON" ]; then
  echo "⚠️  venv tidak ditemukan, menggunakan python3 sistem..."
  PYTHON=python3
fi
$PYTHON python_api/main.py &

# Tunggu API siap (port 8000)
echo "⏳ Waiting for Python API to be ready on port 8000..."
MAX_RETRIES=30
COUNT=0
while ! curl -s http://127.0.0.1:8000/ping > /dev/null; do
    sleep 1
    COUNT=$((COUNT + 1))
    if [ $COUNT -ge $MAX_RETRIES ]; then
        echo "❌ Python API failed to start in time!"
        exit 1
    fi
done

echo "✅ Python API is up and running!"

echo "🤖 Starting Node.js Telegram Bot..."
node src/index.js
