import { defineConfig } from '@playwright/test'

/**
 * Pruebas E2E de la app de escritorio (Tauri 2 + WebView2 en Windows).
 *
 * El fixture de `e2e/desktop/fixtures.ts` arranca una instancia propia de
 * Carpetea (compilación de depuración) con una carpeta de pruebas aislada y se
 * conecta a su ventana por CDP. Hay una sola ventana y estado real en disco, así
 * que las pruebas van en serie con un único worker.
 */
export default defineConfig({
  testDir: './e2e/desktop',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // La ventana de depuración carga la interfaz desde Vite.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
