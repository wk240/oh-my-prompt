---
slug: rename-to-oh-my-prompt
created: 2026-04-24
---

# Rename oh-my-prompt-script to oh-my-prompt

## Goal
Rename project branding from "oh-my-prompt-script" to "oh-my-prompt" while preserving user data compatibility.

## Changes

### 1. Core Branding (user-visible)
- `manifest.json`: extension name → "Oh My Prompt"
- `package.json`: package name → "oh-my-prompt"
- `src/shared/constants.ts`: EXTENSION_NAME → "Oh My Prompt"

### 2. Console Log Prefixes (all files)
- `[Oh My Prompt Script]` → `[Oh My Prompt]`

### 3. UI Titles
- `src/popup/backup.html`: title → "本地备份 - Oh My Prompt"

### 4. GitHub Integration
- `src/lib/version-checker.ts`: REPO_NAME → "oh-my-prompt"

### 5. IndexedDB Migration (critical for data compatibility)
- Add migration logic in `src/lib/sync/indexeddb.ts` to:
  - Try opening new DB name first
  - If new DB empty, try old DB and migrate handle
  - This preserves existing sync folder handles

### 6. Documentation
- `docs/index.html`: Update all references
- `BUILD.md`: Update extension name
- `CLAUDE.md`: Update project description (optional)

### 7. Keep unchanged (for backward compatibility)
- `STORAGE_KEY = 'prompt_script_data'` - chrome.storage key
- `BACKUP_FILE_NAME/PREFIX` - backup files use "omps" prefix
- `UPDATE_STATUS_KEY` - uses "omps" prefix
- `prompts.json` preview image URLs - GitHub URLs (external dependency)

## Data Safety Strategy
- IndexedDB migration handles existing folder handles
- chrome.storage key unchanged - all user prompts/categories preserved
- Backup file names unchanged - existing backups still recognized