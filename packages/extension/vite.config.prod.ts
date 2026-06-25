import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { baseConfig } from './vite.config.base'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const productionManifestPlugin = (): Plugin => ({
  name: 'production-manifest',
  closeBundle() {
    const manifestPath = resolve(__dirname, 'dist/manifest.json')
    if (!existsSync(manifestPath)) return

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

    manifest.content_security_policy = {
      extension_pages: "script-src 'self'; object-src 'self'"
    }

    manifest.content_scripts = manifest.content_scripts?.map((script: { matches?: string[] }) => ({
      ...script,
      matches: script.matches?.filter(match => !match.startsWith('http://localhost:3000/'))
    }))

    manifest.host_permissions = manifest.host_permissions?.filter(
      (permission: string) => !permission.startsWith('http://localhost:3000/')
    )

    manifest.web_accessible_resources = manifest.web_accessible_resources?.map(
      (entry: { matches?: string[] }) => ({
        ...entry,
        matches: entry.matches?.filter(match => !match.startsWith('http://localhost:3000/'))
      })
    )

    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log('[Oh My Prompt] Production manifest sanitized for Chrome Web Store')
  }
})

export default defineConfig({
  ...baseConfig,
  plugins: [
    ...baseConfig.plugins,
    productionManifestPlugin()
  ],
  resolve: {
    ...baseConfig.resolve,
    alias: {
      // Note: '@/lib/config' must come BEFORE the spread of baseConfig.resolve.alias
      // because Vite resolves aliases in order. The '@' alias in baseConfig would
      // match '@/lib/config' first if it comes before this specific alias.
      '@/lib/config': resolve(__dirname, './src/lib/config.prod.ts'),
      ...baseConfig.resolve.alias,
    },
  },
  build: {
    ...baseConfig.build,
    sourcemap: false, // Production builds don't need sourcemaps
  },
})
