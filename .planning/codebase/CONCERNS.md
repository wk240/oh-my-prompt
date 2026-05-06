# Codebase Concerns

**Analysis Date:** 2026-05-06

## Tech Debt

**DropdownContainer.tsx Monolithic Component:**
- Issue: Single file contains 1542 lines with multiple modal components, styles, and state management logic
- Files: `src/content/components/DropdownContainer.tsx`
- Impact: Difficult to maintain, test, and modify. Changes require understanding large interconnected state
- Fix approach: Extract modals to separate components, move styles to dedicated file, split state management

**Console.log Statements Throughout:**
- Issue: 399 console.log/warn/error statements for debugging, no structured logging
- Files: Throughout `src/lib/`, `src/content/`, `src/background/`
- Impact: Debug noise in production, no log levels, no filtering capability
- Fix approach: Implement structured logger with levels (debug/info/warn/error), remove from production build

**(Resolved) Pending GitHub Prompt Data Source Integration:**
- Issue: Previously documented pending feature for importing external prompt sources — network prompt fetching from prompts.chat now implemented
- Files: `src/lib/providers/nano-banana.ts`, `src/lib/resource-library.ts`
- Status: Completed in v1.1.0 (2026-04-19)

## Known Bugs

**Storage Fallback Returns Defaults Without Persisting:**
- Symptoms: On transient storage error, getData() returns default data but doesn't persist it
- Files: `src/lib/storage.ts` (lines 126-132)
- Trigger: Chrome storage API transient failure
- Workaround: User should check storage or reinstall extension if data loss occurs
- Impact: User's prompts/categories may be lost silently

**Large Dataset Loading Warning:**
- Symptoms: Warning logged for >500 prompts but no user notification or performance mitigation
- Files: `src/lib/store.ts` (line 132)
- Trigger: Loading user data with >500 prompts
- Workaround: None - just logged
- Impact: Potential UI slowdown, no guidance for users

## Security Considerations

**innerHTML Usage in UIInjector:**
- Risk: XSS if dynamic content were inserted via innerHTML
- Files: `src/content/ui-injector.tsx` (line 55)
- Current mitigation: Only static CSS/style content inserted, no user data
- Recommendations: Document security constraint, consider using DOM methods instead

**External GitHub API Calls Without Input Validation:**
- Risk: API responses parsed without schema validation
- Files: `src/lib/version-checker.ts` (lines 43-73)
- Current mitigation: Basic null checks on response fields
- Recommendations: Use schema validation (Zod) for GitHub API response

**Host Permissions Granted:**
- Risk: Extension can make requests to raw.githubusercontent.com and api.github.com
- Files: `manifest.json` (lines 36-38)
- Current mitigation: Limited to specific GitHub domains for update checking
- Recommendations: Document permission justification, consider using chrome.downloads for update files

## Performance Bottlenecks

**Large Embedded Resource Library:**
- Problem: 2848-line JSON file embedded in bundle, loaded at startup
- Files: `src/data/resource-library/prompts.json`, `src/lib/resource-library.ts`
- Cause: All resource prompts loaded regardless of usage
- Improvement path: Lazy load resource library, paginate display, or use IndexedDB for storage

**Storage Quota Warning Threshold:**
- Problem: Warning logged at >80% storage but no proactive cleanup guidance
- Files: `src/lib/storage.ts` (lines 204-206)
- Cause: chrome.storage.local has 10MB limit
- Improvement path: Add user notification, implement data cleanup recommendations

**Multiple MutationObservers Running:**
- Problem: InputDetector runs multiple observers (main + nav) with subtree watching
- Files: `src/content/input-detector.ts` (lines 52-61, 198-206)
- Cause: SPA navigation detection and dynamic input detection
- Improvement path: Consider single observer with targeted selectors, use IntersectionObserver for visibility

## Fragile Areas

**Lovart Platform Selector Dependencies:**
- Files: `src/content/input-detector.ts` (lines 13-25), `src/content/ui-injector.tsx` (lines 20-21)
- Why fragile: Specific Lovart UI selectors (`data-testid="agent-message-input"`), breaks if Lovart changes markup
- Safe modification: Add fallback selectors, document selector dependency, monitor Lovart updates
- Test coverage: None for selector detection logic

**History API Global Modification:**
- Files: `src/content/input-detector.ts` (lines 176-189)
- Why fragile: Overrides history.pushState and history.replaceState globally
- Safe modification: Ensure cleanup on unload restores original methods
- Test coverage: None for history interception

**React Portal Rendering Outside Shadow DOM:**
- Files: `src/content/ui-injector.tsx`, `src/content/components/DropdownContainer.tsx`
- Why fragile: Portal renders to document.body, escapes Shadow DOM isolation
- Safe modification: Document portal behavior, ensure styles are scoped via CSS class prefix
- Test coverage: None for portal positioning or click-outside detection

## Scaling Limits

**Chrome Storage Local Quota:**
- Current capacity: 10MB maximum
- Limit: Stores entire StorageSchema including prompts, categories, settings
- Scaling path: Migrate large prompt libraries to IndexedDB, implement data pruning

**Prompt Count Warning Threshold:**
- Current capacity: Warning at >500 prompts
- Limit: No hard limit, but performance concerns
- Scaling path: Implement pagination, lazy loading for prompt lists

## Dependencies at Risk

**@crxjs/vite-plugin (2.x):**
- Risk: CRXJS has history of maintenance delays and breaking changes
- Impact: Build may fail or require migration if plugin becomes unmaintained
- Migration plan: Monitor releases, consider direct Vite+Chrome Extension build

**React 19.x:**
- Risk: Latest React version, some ecosystem libraries may have compatibility issues
- Impact: Potential edge cases with concurrent features, Radix UI compatibility
- Migration plan: Monitor React ecosystem updates, test thoroughly with key libraries

## Missing Critical Features

**E2E Testing Implementation:**
- Problem: Playwright configured but no test files exist
- Files: `playwright.config.ts` points to empty `tests/` directory
- Blocks: No automated testing for critical user flows (prompt insertion, sync, backup)

**Structured Error Handling:**
- Problem: No error codes or structured error types for user-facing messages
- Blocks: Cannot provide specific guidance for error resolution

## Test Coverage Gaps

**Content Script Logic:**
- What's not tested: Input detection, Lovart selector matching, prompt insertion, portal positioning
- Files: `src/content/input-detector.ts`, `src/content/insert-handler.ts`, `src/content/ui-injector.tsx`
- Risk: Platform integration breaks silently on Lovart UI changes
- Priority: High - core functionality depends on fragile selectors

**Storage Operations:**
- What's not tested: Migration paths, quota handling, error fallbacks
- Files: `src/lib/storage.ts`, `src/lib/migrations/`
- Risk: Data loss scenarios not validated
- Priority: High - data persistence is critical

**Sync Operations:**
- What's not tested: File System Access API, IndexedDB handle persistence, backup/restore flows
- Files: `src/lib/sync/file-sync.ts`, `src/lib/sync/sync-manager.ts`, `src/lib/sync/indexeddb.ts`
- Risk: User backup data may be corrupted without detection
- Priority: Medium - affects users who enable sync

**UI Component Rendering:**
- What's not tested: Modal dialogs, dropdown positioning, drag-and-drop reorder
- Files: `src/content/components/`, `src/popup/components/`
- Risk: UI bugs may slip into production
- Priority: Medium - affects user experience

---

*Concerns audit: 2026-05-06*