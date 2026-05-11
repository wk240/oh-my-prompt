import { defineConfig } from 'vite'
import { baseConfig } from './vite.config.base'
import { resolve } from 'path'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  ...baseConfig,
  resolve: {
    ...baseConfig.resolve,
    alias: {
      ...baseConfig.resolve.alias,
      '@/lib/config': resolve(__dirname, './src/lib/config.prod.ts'),
    },
  },
  build: {
    ...baseConfig.build,
    sourcemap: false, // Production builds don't need sourcemaps
  },
})