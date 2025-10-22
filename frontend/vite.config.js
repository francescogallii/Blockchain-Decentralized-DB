// Percorso: ./frontend/vite.config.js (CORRETTO)

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Proxy semplificato - funzionerà tramite Nginx
    proxy: {
      '/api': {
        target: 'http://node1:4001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})