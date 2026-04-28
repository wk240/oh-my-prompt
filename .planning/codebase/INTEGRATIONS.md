# External Integrations

**Analysis Date:** 2026/04/28

## APIs & External Services

**GitHub Releases API:**
- Purpose: Check for extension updates from repository releases
- Endpoint: `https://api.github.com/repos/wk240/oh-my-prompt/releases/latest`
- SDK/Client: Native `fetch()` API
- Auth: None (public repository)
- Implementation: `src/lib/version-checker.ts`
- Host permission: `https://api.github.com/*` in manifest

**GitHub Raw Content:**
- Purpose: Resource library prompt data loading
- Host permission: `https://raw.githubusercontent.com/*` in manifest

**Lovart AI Platform:**
- Purpose: Target platform for prompt insertion
- Domain: `lovart.ai` and subdomains
- Integration: Content script injection via manifest `content_scripts.matches`
- Input selector: `[data-testid="agent-message-input"]`, `[data-lexical-editor="true"]`
- Injection point: `[data-testid="agent-input-bottom-more-button"]`
- Implementation: `src/content/input-detector.ts`, `src/content/insert-handler.ts`

## Data Storage

**Databases:**
- chrome.storage.local - Primary data persistence
  - Connection: Chrome Extension API
  - Client: `StorageManager` singleton at `src/lib/storage.ts`
  - Key: `prompt_script_data` (single key stores entire `StorageSchema`)
  - Quota: 10MB maximum (warning at 80% usage, `checkStorageQuota()` in `src/lib/storage.ts`)
  - Schema: `{ version, userData: { prompts, categories }, settings, _migrationComplete }`

- IndexedDB - Folder handle persistence for File System Access API
  - Database: `oh-my-prompt-sync` (constants: `SYNC_DB_NAME`)
  - Store: `handles` (constants: `SYNC_STORE_NAME`)
  - Key: `syncFolderHandle` (constants: `SYNC_HANDLE_KEY`)
  - Implementation: `src/lib/sync/indexeddb.ts`

**File Storage:**
- File System Access API - Local folder backup/sync
  - Implementation: `src/lib/sync/file-sync.ts`
  - Primary file: `omps-latest.json` (constants: `BACKUP_FILE_NAME`)
  - History files: `omps-backup-{YYYYMMDD}-{HHMMSS}.json`
  - History pattern: `BACKUP_HISTORY_PATTERN = /^omps-backup-\d{8}-\d{6}\.json$/`
  - Max history: 100 backup files (`MAX_BACKUP_HISTORY`)
  - Images directory: `images/` (`IMAGE_DIR_NAME`)
  - Max image size: 5MB (`MAX_IMAGE_SIZE`)
  - Allowed extensions: jpg, jpeg, png, webp, gif (`ALLOWED_IMAGE_EXTENSIONS`)
  - Requires: User folder selection and read/write permission

**Caching:**
- None - All data persisted to chrome.storage.local immediately

## Authentication & Identity

**Auth Provider:**
- Not applicable - Extension runs locally without authentication
- No login/registration required
- User identity: Browser profile level (extension installed per-profile)

## Monitoring & Observability

**Error Tracking:**
- None - Console logging only

**Logs:**
- Browser console with prefixed messages
- Pattern: `console.log('[Oh My Prompt]', message)` for easy filtering
- Warning logs: Large datasets (>500 prompts), storage quota (>80%)

## CI/CD & Deployment

**Hosting:**
- GitHub Releases - `.crx` or `.zip` packages
- Chrome Web Store - Extension distribution
- Project site: `https://oh-my-prompt.com/`

**CI Pipeline:**
- None detected - No GitHub Actions or CI workflows found
- Manual build and release process

## Environment Configuration

**Required env vars:**
- None - Extension does not use environment variables
- All configuration in `manifest.json` and source code constants

**Secrets location:**
- Not applicable - No secrets or API keys required

## Webhooks & Callbacks

**Incoming:**
- None - Extension does not receive external webhooks

**Outgoing:**
- GitHub API GET request for release information
- No outbound webhooks

## Chrome Extension APIs Used

**Storage:**
- `chrome.storage.local.get()` - Read data
- `chrome.storage.local.set()` - Write data
- `chrome.storage.local.remove()` - Clear update status
- `chrome.storage.local.getBytesInUse()` - Check quota usage

**Runtime:**
- `chrome.runtime.getManifest()` - Get extension version dynamically
- `chrome.runtime.sendMessage()` - Message to service worker
- `chrome.runtime.onMessage.addListener()` - Receive messages
- `chrome.runtime.getURL()` - Extension resource URLs

**Tabs:**
- `chrome.tabs.create()` - Open backup page, extensions page
- `chrome.tabs.sendMessage()` - Message to content script
- `chrome.tabs.query()` - Query Lovart tabs for broadcast

**Downloads:**
- `chrome.downloads.download()` - Export JSON files (data URL method in service worker)

**Alarms:**
- Permission granted but not actively used

## Extension Permissions (from manifest.json)

**Required permissions:**
- `activeTab` - Access to active tab content
- `downloads` - Export data as JSON download
- `storage` - chrome.storage.local access
- `tabs` - Tab querying for messaging
- `alarms` - Scheduled tasks (reserved)

**Host permissions:**
- `https://raw.githubusercontent.com/*` - Resource library fetching
- `https://api.github.com/*` - Version checking

---

*Integration audit: 2026/04/28*