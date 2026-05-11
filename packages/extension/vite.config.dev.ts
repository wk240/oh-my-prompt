import { defineConfig } from 'vite'
import { baseConfig } from './vite.config.base'
import type { Plugin } from 'vite'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Dev mode offscreen document plugin
 *
 * Creates loader files and copies HTML for offscreen document to work in dev mode.
 * @crxjs/vite-plugin doesn't automatically handle offscreen documents in dev mode.
 */
const devOffscreenPlugin = (): Plugin => ({
  name: 'dev-offscreen',
  enforce: 'pre',

  buildStart() {
    const distDir = resolve(__dirname, 'dist/src/offscreen')
    if (!existsSync(distDir)) {
      mkdirSync(distDir, { recursive: true })
    }

    // Create loader file that imports from Vite dev server
    const loaderContent = `
import 'http://localhost:5173/@vite/env';
import 'http://localhost:5173/src/offscreen/offscreen.ts';
`.trim()

    writeFileSync(resolve(distDir, 'offscreen.ts-loader.js'), loaderContent)

    // Create HTML that references the loader
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Oh My Prompt - Offscreen</title>
</head>
<body>
  <script type="module" src="./offscreen.ts-loader.js"></script>
</body>
</html>
`.trim()

    writeFileSync(resolve(distDir, 'offscreen.html'), htmlContent)

    console.log('[Oh My Prompt] Dev offscreen files created in dist/src/offscreen/')
  }
})

export default defineConfig({
  ...baseConfig,
  plugins: [
    ...baseConfig.plugins,
    devOffscreenPlugin()
  ],
  define: {
    DEV_WEB_APP_URL: '"http://localhost:3000"',
  },
})