import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Single-app setup: in dev, this config is consumed by Vite running in *middleware
// mode* inside the Fastify server (see src/server/index.ts), so there is one Node
// process. `vite build` emits the client to dist/client for production.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
