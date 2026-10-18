import { defineConfig } from 'vitest/config';

// Pruebas unitarias del cliente (Node). Las de navegador van con Playwright (e2e/).
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
