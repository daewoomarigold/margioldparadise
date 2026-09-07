import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Repo is served at https://daewoomarigold.github.io/margioldparadise/,
  // so all built asset paths need this prefix.
  base: '/margioldparadise/',
})
