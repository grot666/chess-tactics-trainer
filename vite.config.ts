import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: https://grot666.github.io/chess-tactics-trainer/
export default defineConfig({
  plugins: [react()],
  base: '/chess-tactics-trainer/',
})
