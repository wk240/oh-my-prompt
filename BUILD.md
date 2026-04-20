# Build and Package Guide

## Build Commands

- **Development:** `npm run dev` - Hot reload enabled for local development
- **Production:** `npm run build` - Creates optimized `dist/` folder
- **Preview:** `npm run preview` - Preview production build locally

## Build Output

The production build outputs to the `dist/` directory:

```
dist/
├── manifest.json        # Extension manifest (auto-generated)
├── service-worker-loader.js  # Background script loader
├── assets/              # Static assets and compiled JS
│   ├── icon-16.png
│   ├── icon-48.png
│   ├── icon-128.png
│   ├── popup.html-D4gMU27h.js
│   ├── content-script.ts-CDrjZWPf.js
│   └── ...
└── src/
    └── popup/
        └── popup.html   # Popup entry point
```

## Loading in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** toggle (top right)
3. Click **Load unpacked** button
4. Select the `dist/` directory from the project

The extension should appear with:
- Name: "Oh My Prompt Script"
- Version: "1.0.0"
- Icon: Lightning bolt icon

## Creating .crx Package

In `chrome://extensions/` with Developer mode enabled:

1. Click **Pack extension** button
2. Extension root directory: Select the `dist/` folder
3. Private key: Leave empty for first pack (a `.pem` key will be generated)
4. Output: `.crx` file in project root

**Important:** Keep the generated `.pem` private key secure for future updates. Losing it prevents extension updates.

## Version Update Process

For future releases:

1. Update `version` in `manifest.json`
2. Update `version` in `package.json` (sync with manifest)
3. Run `npm run build` to regenerate `dist/`
4. Load in Chrome for smoke test
5. Pack extension if ready for release

## Build Configuration

- **Toolchain:** Vite + @crxjs/vite-plugin
- **TypeScript:** Strict mode enabled
- **Source maps:** Enabled for debugging (`sourcemap: true`)
- **Base path:** `./` (relative paths for extension)

## Known Considerations

- Source maps are included for debugging; exclude for production distribution
- @crxjs/vite-plugin handles manifest transformation automatically
- TypeScript compilation runs before Vite build (`tsc && vite build`)
- Content script matches include `file:///*` for local testing