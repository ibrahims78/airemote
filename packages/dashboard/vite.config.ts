import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand', 'axios', 'clsx', 'date-fns'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: {
    port: 5000,
    host: true,
    allowedHosts: true,
    hmr: false,
    proxy: {
      // السيرفر المكتبي يخدم TLS فقط؛ http كان يجعل كل نداء /api يفشل بـ500 في التطوير.
      '/api': { target: 'https://localhost:3001', changeOrigin: true, secure: false },
      '/ws': { target: 'https://localhost:3001', ws: true, changeOrigin: true, secure: false },
      '/ssh': { target: 'https://localhost:3001', ws: true, changeOrigin: true, secure: false },
      '/pty':    { target: 'https://localhost:3001', ws: true, changeOrigin: true, secure: false },
      '/screen': { target: 'https://localhost:3001', ws: true, changeOrigin: true, secure: false }
    }
  }
})
