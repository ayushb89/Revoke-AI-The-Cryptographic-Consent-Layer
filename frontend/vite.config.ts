import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev server proxies /api to the FastAPI backend, so the browser talks to
// one origin and no CORS configuration is needed during the demo.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The single bundle is ~580 kB (~195 kB gzipped), mostly ethers for in-browser
    // receipt verification. That is acceptable here; raise the limit so Vercel's
    // build log doesn't flag it.
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
