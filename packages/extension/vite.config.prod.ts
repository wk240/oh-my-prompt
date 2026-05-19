import { defineConfig } from 'vite'
import { baseConfig } from './vite.config.base'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  ...baseConfig,
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