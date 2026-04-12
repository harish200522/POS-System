import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://pos-backend-harish.onrender.com',
        changeOrigin: true,
        secure: false,
        headers: {
          Origin: 'https://stalwart-daifuku-d6ed88.netlify.app'
        }
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
