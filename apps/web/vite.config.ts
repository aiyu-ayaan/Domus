import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// The backend serves HTTPS (self-signed in development); Vite proxies the API
// and the live WebSocket so the browser talks to a single origin.
const backend = process.env.DOCUS_BACKEND ?? 'https://127.0.0.1:8443'

export default defineConfig({
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
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['motion'],
        },
      },
    },
  },
})
