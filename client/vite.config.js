import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React dev server runs on http://localhost:5173 and forwards /api requests
// to the Express API. Change API_URL if you run the API on another port.
const API_URL = process.env.API_URL || 'http://127.0.0.1:4000';

const proxy = {
  '/api': { target: API_URL, changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
