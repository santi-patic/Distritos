import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        fixtures: resolve(import.meta.dirname, 'fixtures.html'),
      },
    },
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, strictPort: true },
});
