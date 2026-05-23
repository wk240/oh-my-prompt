#!/bin/bash

# Sync packages/shared to web-app/src/shared
# Run from project root: ./scripts/sync-shared.sh

set -e

SOURCE="packages/shared"
DEST="packages/web-app/src/shared"

echo "🔄 Syncing $SOURCE → $DEST"

# Delete destination contents
rm -rf "$DEST"/*

# Copy all files from source
cp -r "$SOURCE"/* "$DEST"/

# Update version in all copied files (inject header comment)
VERSION=$(node -e "console.log(require('./packages/shared/package.json').version)")
DATE=$(date +%Y-%m-%d)

# Add sync header to each .ts file
for file in "$DEST"/**/*.ts; do
  if [ -f "$file" ]; then
    # Skip if already has header
    if ! grep -q "@source packages/shared" "$file"; then
      # Create temp file with header
      echo "/**" > "$file.tmp"
      echo " * @source packages/shared/${file#$DEST/}" >> "$file.tmp"
      echo " * @version $VERSION" >> "$file.tmp"
      echo " * @last-sync $DATE" >> "$file.tmp"
      echo " *" >> "$file.tmp"
      echo " * ⚠️ DO NOT EDIT DIRECTLY" >> "$file.tmp"
      echo " * 此文件是 packages/shared 的副本" >> "$file.tmp"
      echo " * 请在 packages/shared 修改，然后运行 sync-shared.sh" >> "$file.tmp"
      echo " */" >> "$file.tmp"
      cat "$file" >> "$file.tmp"
      mv "$file.tmp" "$file"
    fi
  fi
done

echo "✅ Sync complete: $VERSION at $DATE"
echo ""
echo "Changed files:"
git diff --stat "$DEST"