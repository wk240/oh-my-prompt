#!/bin/bash

# Check if packages/shared and web-app/src/shared are identical
# Run in CI to catch sync drift

set -e

SOURCE="packages/shared"
DEST="packages/web-app/src/shared"

echo "🔍 Checking shared package sync status..."

# Function to strip sync headers from file
strip_headers() {
  sed '/^\/\*\*/,/\*\//d' "$1"
}

# Compare each .ts file, ignoring sync headers
check_file() {
  local src_file="$1"
  local dest_file="$2"

  # Strip headers and compare
  diff <(strip_headers "$src_file") <(strip_headers "$dest_file") > /dev/null 2>&1
}

DRIFT_FOUND=false

# Check all TypeScript files
for src_file in "$SOURCE"/**/*.ts; do
  if [ -f "$src_file" ]; then
    # Get relative path
    rel_path="${src_file#$SOURCE/}"
    dest_file="$DEST/$rel_path"

    # Check if destination exists
    if [ ! -f "$dest_file" ]; then
      echo "❌ Missing: $rel_path in web-app/src/shared"
      DRIFT_FOUND=true
      continue
    fi

    # Compare content (strip headers)
    if ! check_file "$src_file" "$dest_file"; then
      echo "❌ Different: $rel_path"
      DRIFT_FOUND=true
    fi
  fi
done

if [ "$DRIFT_FOUND" = false ]; then
  echo "✅ packages/shared and web-app/src/shared are in sync"
  exit 0
else
  echo ""
  echo "🛠️ Fix: Run npm run sync-shared to sync"
  echo "   Or update packages/shared first, then sync to web-app"
  exit 1
fi