import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The web app runs on :5173 and forwards /api and /media to the local server on :3001.
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3001', '/media': 'http://127.0.0.1:3001' },
  },
})
