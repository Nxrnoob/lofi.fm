#!/bin/bash

# lofi.fm Development Script
# This script helps you start both frontend and worker in development mode

echo "🎵 lofi.fm - Development Setup"
echo "================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js $(node --version) detected"
echo ""

# Check if dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

if [ ! -d "worker/node_modules" ]; then
    echo "📦 Installing worker dependencies..."
    cd worker && npm install && cd ..
fi

echo ""
echo "🚀 Starting development servers..."
echo ""
echo "Frontend: http://localhost:3000"
echo "Worker:   http://localhost:8787"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $(jobs -p) 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start worker in background
cd worker
npm run dev &
WORKER_PID=$!

# Wait a bit for worker to start
sleep 2

# Start frontend in background
cd ../frontend
npm run dev &
FRONTEND_PID=$!

# Wait for both processes
wait $WORKER_PID $FRONTEND_PID
