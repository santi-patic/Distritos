import { defineConfig } from '@playwright/test';

// Prueba entre runtimes: la misma lista de órdenes da el mismo hash en Node (vitest) y en
// Chromium (esta página). PW_CHROMIUM_PATH permite usar un Chromium ya instalado.
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  webServer: {
    command: 'pnpm exec vite --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    launchOptions: executablePath === undefined ? {} : { executablePath },
  },
});
