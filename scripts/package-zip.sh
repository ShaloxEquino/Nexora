#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('./extension/package.json').version")
OUTPUT="nexora-extension-v${VERSION}.zip"

echo "Building extension..."
npm run build -w extension

echo "Creating zip: $OUTPUT"
cd extension/dist
zip -r "../../${OUTPUT}" .
cd ../..

echo "Extension packaged: $OUTPUT"
echo "Upload this file to the Chrome Web Store / Edge Add-ons portal."
