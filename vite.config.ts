import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import pkg from './package.json' with { type: 'json' }

// Version: 1.0.N, where N goes up by one with every commit (so every update shows a new number).
function version(): string {
  const [major, minor] = pkg.version.split('.')
  try {
    const count = Number(execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim())
    return `${major}.${minor}.${Math.max(0, count - pkg.buildBase)}`
  } catch { return pkg.version }
}

// GitHub Pages serves the app under the repository name (case matters). The deploy workflow
// passes it in, so renaming the repository needs no code change.
const BASE = process.env.BASE_PATH || '/Maestro-Sarrassoua/'

export default defineConfig({
  base: BASE,
  define: { __VERSION__: JSON.stringify(version()) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: ['apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'Hablemos',
        short_name: 'Hablemos',
        description: 'Spanish conversation practice, voice first.',
        lang: 'en',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F3EA',
        theme_color: '#F7F3EA',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ttf}'],
        navigateFallback: BASE + 'index.html',
        // The tutor (api.anthropic.com) is never cached: it always goes to the network.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  build: { target: 'es2022', cssCodeSplit: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
