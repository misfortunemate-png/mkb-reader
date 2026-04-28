import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// 何を: Vite設定（React + Tailwind + PWA + GitHub Pages base）
// なぜ: 仕様書 Phase 1 §10 の base 設定 / Phase 2 §9 の PWA + オフライン
export default defineConfig({
  base: '/mkb-reader/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 何を: アプリシェル + Google Fonts のキャッシュを Workbox で生成
      // なぜ: 仕様書 §9 — オフライン起動と読書体験の継続を保証する
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'mkb-reader',
        short_name: 'mkb-reader',
        description: 'MarkBook & Markdown ビューア',
        theme_color: '#faf8f5',
        background_color: '#faf8f5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/mkb-reader/',
        scope: '/mkb-reader/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // 何を: アプリシェル一式 + 同梱の test.mkb を precache
        // なぜ: オフラインで test.mkb を開いて検証できるように
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mkb,json,cbz}'],
        navigateFallback: '/mkb-reader/index.html',
        // 何を: 新しい SW を即座にアクティブ化し、既存タブにも反映する
        // なぜ: 既定の autoUpdate では新 SW が waiting 状態で止まり、
        //       全タブを閉じるまで反映されない。検証中の体感更新を確実にする
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Google Fonts CSS のキャッシュ（仕様書 §9）
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-css',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Google Fonts woff2 のキャッシュ
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-woff2',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
