import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Support for React Router - fallback all routes to index.html
    historyApiFallback: true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
      },
      '/health': 'http://localhost:8787',
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    outDir: 'dist',
  },
})
