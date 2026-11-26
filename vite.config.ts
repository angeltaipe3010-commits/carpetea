import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Puerto fijo: Tauri 2 apuntará a este devUrl en la Fase 2.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // El motor de Rust se recompila por su cuenta; Vite no debe vigilar src-tauri.
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
