import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/mysoul-12wy/command-centre/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
