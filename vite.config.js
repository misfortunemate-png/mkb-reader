import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 何を: Vite設定
// なぜ: React + Tailwind v4 + GitHub Pages配信のbase設定（リポジトリ名 mkb-reader に合わせる）
export default defineConfig({
  base: '/mkb-reader/',
  plugins: [react(), tailwindcss()],
})
