/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// `vite build --mode artifact` : version d'essai publiée comme page claude.ai (chemins relatifs, sans service worker).
export default defineConfig(({ mode }) => ({
  base: mode === 'artifact' ? './' : '/',
  plugins: [
    react(),
    mode !== 'artifact' && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Mon budget',
        short_name: 'Budget',
        description: 'Suivi de budget personnel, chiffré de bout en bout',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#f6f5f2',
        theme_color: '#2f6b4f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [{ name: 'Ajouter une dépense', short_name: 'Ajouter', url: '/?ajout=1' }],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
}))
