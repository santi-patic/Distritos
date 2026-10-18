import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: la misma construcción sirve en GitHub Pages (/Distritos/) y en Capacitor.
  base: './',
  // El commit de la construcción, para que un probador diga qué versión tenía.
  define: { __BUILD__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'local') },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        fixtures: resolve(import.meta.dirname, 'fixtures.html'),
        informe: resolve(import.meta.dirname, 'informe.html'),
      },
    },
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, strictPort: true },
});
