#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "→ Killing anything on ports 8000 and 3001..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

echo "→ Starting local FastAPI backend on :8000..."
cd "$ROOT/backend/local"
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

echo "   Waiting for backend to be ready..."
for i in {1..15}; do
  curl -s http://localhost:8000/health > /dev/null 2>&1 && break
  sleep 1
done
echo "   Backend ready (PID $BACKEND_PID)"

echo "→ Starting Next.js frontend on :3001..."
cd "$ROOT/frontend/bedside"
npm run dev -- --port 3001 &
FRONTEND_PID=$!

echo "   Waiting for frontend to be ready..."
for i in {1..20}; do
  curl -s http://localhost:3001 > /dev/null 2>&1 && break
  sleep 1
done

echo ""
echo "✓ MediSync Bedside running"
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:3001"
echo ""
echo "  Press Ctrl+C to stop everything."
echo ""

xdg-open http://localhost:3001 2>/dev/null || true

# On Ctrl+C, kill both
trap "echo ''; echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait $BACKEND_PID $FRONTEND_PID
