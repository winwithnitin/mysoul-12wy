import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/mysoul-12wy/dashboard/',
  build: {
    outDir: '../docs/dashboard',
    emptyOutDir: true,
  }
})
