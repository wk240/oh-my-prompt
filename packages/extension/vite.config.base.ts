import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import manifest from './manifest.json'
import { stabilizeContentScriptManifest } from './src/lib/build/stable-content-scripts'

const stableContentScriptsPlugin = (): Plugin => {
  let patchTimer: ReturnType<typeof setTimeout> | undefined

  const patchDistManifest = () => {
    const distDir = path.resolve(__dirname, 'dist')
    const manifestPath = path.resolve(distDir, 'manifest.json')
    if (!existsSync(manifestPath)) return

    const distManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    const result = stabilizeContentScriptManifest(distManifest)
    if (result.copies.length === 0) return

    for (const copy of result.copies) {
      const source = path.resolve(distDir, copy.from)
      const target = path.resolve(distDir, copy.to)
      if (existsSync(source)) {
        copyFileSync(source, target)
      }
    }

    writeFileSync(manifestPath, `${JSON.stringify(result.manifest, null, 2)}\n`)
    console.log('[Oh My Prompt] Stable content script paths written to dist/manifest.json')
  }

  const schedulePatch = () => {
    if (patchTimer) clearTimeout(patchTimer)
    patchTimer = setTimeout(patchDistManifest, 500)
  }

  return {
    name: 'stable-content-scripts',
    closeBundle: patchDistManifest,
    configureServer(server) {
      server.httpServer?.once('listening', schedulePatch)
      server.watcher.on('change', schedulePatch)
    }
  }
}

export const baseConfig = {
  plugins: [
    react(),
    crx({ manifest }),
    stableContentScriptsPlugin()
  ],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@oh-my-prompt/shared': path.resolve(__dirname, '../shared')
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
      protocol: 'ws',
      host: 'localhost'
    },
    cors: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        sidepanel: 'src/sidepanel/sidepanel.html',
        offscreen: 'src/offscreen/offscreen.html'
      },
      output: {
        manualChunks(id) {
          // Extract React ecosystem into separate chunk
          if (id.includes('react') || id.includes('react-dom')) {
            return 'vendor-react'
          }
          // Extract lucide-react icons
          if (id.includes('lucide-react')) {
            return 'vendor-icons'
          }
          // Extract dnd-kit drag-and-drop library
          if (id.includes('@dnd-kit')) {
            return 'vendor-dnd'
          }
          // Extract zustand state management
          if (id.includes('zustand')) {
            return 'vendor-zustand'
          }
          // Extract resource library JSON data (5MB+) - separate from code
          if (id.includes('resource-library/categories') || id.includes('resource-library/index.json')) {
            return 'resource-library'
          }
        }
      }
    }
  }
}
