import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

// The backend serves HTTPS (self-signed in development); Vite proxies the API
// and the live WebSocket so the browser talks to a single origin.
const backend = process.env.DOMUS_BACKEND ?? 'https://127.0.0.1:8443'

// The release's name and build number, bumped by the release PR (scripts/set-version.mjs).
const root = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(root.version),
    __APP_BUILD__: JSON.stringify(root.build),
  },
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: backend, changeOrigin: true, secure: false, ws: true },
    },
  },
  build: {
    // lib/i18n.ts awaits the language catalog at the top level.
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})
