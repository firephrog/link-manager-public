import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const config = require('./config.js')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${config.PORT}`,
        changeOrigin: true,
      },
    },
    allowedHosts: [
      'phrogtools.site',
      'www.phrogtools.site'
    ]
  },
})
