#!/usr/bin/env bash
set -euo pipefail

echo "Starting NEXORA development servers..."

# Run backend
(cd backend && npm run dev) &
BACKEND_PID=$!

# Run extension watcher
(cd extension && npm run dev) &
EXT_PID=$!

trap "kill $BACKEND_PID $EXT_PID 2>/dev/null; exit 0" INT TERM

wait
