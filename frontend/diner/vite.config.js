import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // /t is a React route — do NOT proxy it
    // API calls use the full VITE_API_URL so no proxy needed here at all
    proxy: {
      '/payments/initiate': 'http://localhost:8000',
    }
  }
})