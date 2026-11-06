#!/usr/bin/env bash
set -euo pipefail

echo "Building shared..."
npm run build -w shared

echo "Building backend..."
npm run build -w backend

echo "Building extension..."
npm run build -w extension

echo "Build complete."
