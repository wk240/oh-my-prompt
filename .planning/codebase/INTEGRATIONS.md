# External Integrations

**Analysis Date:** 2026/05/06

## APIs & External Services

**Vision API (Image-to-Prompt):**
- User-configured API endpoint (OpenAI or Anthropic compatible)
  - SDK/Client: Native `fetch` in `src/lib/vision-api.ts`
  - Auth: User-provided API key stored in `chrome.storage.local` with key `_visionApiConfig`
  - Config stored in backup folder encrypted (AES-GCM via Web Crypto API)
  - Supported formats: OpenAI GPT-4V, Anthropic Claude Vision
  - Request timeout: 5 minutes (300000ms)

**GitHub Releases API:**
- Update version checking
  - Endpoint: `https://api.github.com/repos/wk240/oh-my-prompt/releases/latest`
  - SDK/Client: Native `fetch` in `src/lib/version-checker.ts`
  - Auth: None (public API)
  - Used for: Checking latest version, download URL, release notes

**File System Access API:**
- Local folder backup sync
  - SDK/Client: Native browser API via offscreen document (`src/offscreen/offscreen.ts`)
  - Auth: User-selected folder with readwrite permission
  - Folder handle persisted in IndexedDB (`oh-my-prompt-sync` database)
  - Backup files: `omps-latest.json`, `omps-backup-{timestamp}.json`
  - Images stored in `images/` subdirectory

## Data Storage

**Databases:**
- `chrome.storage.local` - Primary data storage (10MB quota)
  - Key: `prompt_script_data` - Full `StorageSchema` object
  - Key: `_visionApiConfig` - Vision API configuration
  - Key: `_capturedImageUrl` - Context menu captured image tracking
  - Key: `omps_update_status` - Update check status

**IndexedDB:**
- Database: `oh-my-prompt-sync`
- Store: `handles`
- Key: `syncFolderHandle` - FileSystemDirectoryHandle persistence

**File Storage:**
- Local folder backup - User-selected via File System Access API
  - JSON backup files (full data + version history)
  - Image files in `images/` directory
  - Encrypted API config in `secrets/api-config.enc` with `secrets/salt.bin`

**Caching:**
- None - All data persisted in chrome.storage.local

## Authentication & Identity

**Auth Provider:**
- None (no user accounts)

**Vision API Auth:**
- User-provided API key
  - Stored locally in chrome.storage.local
  - Encrypted and synced to backup folder
  - Never logged in console (security rule T-11-01)
  - HTTPS required for API endpoints (security rule T-11-02)

## Monitoring & Observability

**Error Tracking:**
- None - Console logging only

**Logs:**
- Prefix: `[Oh My Prompt]` - All console logs filtered by prefix
- Log levels: `console.log`, `console.warn`, `console.error`
- Vision API logs: baseUrl, modelName, image size (never apiKey)

## CI/CD & Deployment

**Hosting:**
- Chrome Web Store (distribution)
- GitHub Releases (download alternative)

**CI Pipeline:**
- None detected

**Build Process:**
- `npm run build` - TypeScript check + Vite build
- Output: `dist/` directory
- Manual upload to Chrome Web Store

## Environment Configuration

**Required env vars:**
- None - All configuration stored in chrome.storage.local

**Secrets location:**
- User-provided Vision API key stored in `chrome.storage.local`
- Encrypted backup in local folder (`secrets/api-config.enc`)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- Vision API requests to user-configured endpoint
- GitHub Releases API for version check

## Extension Permissions

**Required permissions:**
- `activeTab` - Access active tab content
- `downloads` - Export data as JSON download
- `storage` - chrome.storage.local access
- `tabs` - Tab management, sendMessage
- `alarms` - Scheduled tasks
- `contextMenus` - Right-click menu on images
- `sidePanel` - Side panel UI
- `scripting` - Script injection
- `offscreen` - Offscreen document for file operations

**Host permissions:**
- `https://raw.githubusercontent.com/*` - Resource library data
- `https://api.github.com/*` - Version check API
- `https://*/*` - Universal Vision modal support

---

*Integration audit: 2026/05/06*