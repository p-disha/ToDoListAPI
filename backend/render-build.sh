#!/usr/bin/env bash
# Build React frontend and move it into backend for serving

echo "Building frontend..."
cd ../frontend
npm install
npm run build

echo "Copying build folder to backend..."
cp -r build ../backend/

echo "Frontend build complete."
