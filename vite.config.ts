import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react()],
  server: { port: 8811, proxy: { '/api': 'http://127.0.0.1:8810' } },
  build: { outDir: 'dist', sourcemap: false },
});
