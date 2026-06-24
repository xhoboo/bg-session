import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  // Vitest. Pure-logic tests (format.js, nickname.js) run in a plain Node
  // environment; the DB integration test self-skips unless SUPABASE_DB_URL is set.
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
})
