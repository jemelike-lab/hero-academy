import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Legacy static pages live in /public and are served as-is at their old URLs
// (class-time.html, game-day.html, …) until each zone is ported to React.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: false },
});
