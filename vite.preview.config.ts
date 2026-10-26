import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

// Single-file build for hosted design previews (no API). `npm run build:preview`.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  publicDir: false,
  define: { 'import.meta.env.VITE_PREVIEW': '"1"' },
  build: { outDir: 'dist-preview', emptyOutDir: true },
});
