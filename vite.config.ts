import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import path from 'path'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest })
  ],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    cors: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        backup: 'src/popup/backup.html'
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
        }
      }
    }
  }
})