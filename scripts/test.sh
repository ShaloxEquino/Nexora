#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DATABASE_URL_TEST:-}" ]; then
  echo "ERROR: DATABASE_URL_TEST must be set for integration tests."
  exit 1
fi

echo "Running shared build..."
npm run build -w shared

echo "Running unit tests..."
npx jest --testPathPattern="tests/unit" --runInBand

echo "Running integration tests..."
npx jest --testPathPattern="tests/integration" --runInBand

echo "All tests complete."
