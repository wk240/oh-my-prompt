import { defineConfig } from 'vite'
import { baseConfig } from './vite.config.base'

export default defineConfig({
  ...baseConfig,
  define: {
    DEV_WEB_APP_URL: 'undefined', // Fallback to https://oh-my-prompt.com in production
  },
  build: {
    ...baseConfig.build,
    sourcemap: false, // Production builds don't need sourcemaps
  },
})