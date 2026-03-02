#!/usr/bin/env bash
# start.sh — install deps and launch the API server

set -e

echo "→ Creating virtual environment..."
python3 -m venv .venv
source .venv/bin/activate

echo "→ Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "→ Starting server on http://localhost:8000"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
