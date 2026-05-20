import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import path from 'path'
import manifest from './manifest.json'

export const baseConfig = {
  plugins: [
    react(),
    crx({ manifest })
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