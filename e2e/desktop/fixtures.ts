/**
 * Fixture de la app de escritorio: arranca Carpetea (compilación de depuración)
 * con datos aislados y se conecta a su WebView2 por CDP.
 */
import { test as base, chromium, expect, type Browser, type Page } from '@playwright/test'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSandbox, type Sandbox } from './sandbox'

const EXE = resolve('src-tauri', 'target', 'debug', 'carpetea.exe')
const CDP_PORT = 9333
const DEV_URL = 'http://localhost:1420'

export interface DesktopApp {
  page: Page
  sandbox: Sandbox
  /** Cambia el destino guardado en las preferencias y recarga la interfaz. */
  setDestination: (dest: { mode: 'source' | 'libraries' | 'custom'; customPath?: string; allowCloud?: boolean }) => Promise<void>
}

/** Espera a que el proceso abra el puerto de depuración (arranque del proceso, no de la interfaz). */
async function connect(): Promise<Browser> {
  const deadline = Date.now() + 60_000
  let last: unknown
  while (Date.now() < deadline) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  throw new Error(`Carpetea no abrió el puerto de depuración: ${String(last)}`)
}

async function appPage(browser: Browser): Promise<Page> {
  const context = browser.contexts()[0]
  if (!context) throw new Error('Carpetea no expuso ninguna ventana por CDP')
  // La ventana puede existir ya (en about:blank) y navegar después: se sondea la URL.
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const page = context.pages().find((p) => p.url().startsWith(DEV_URL))
    if (page) return page
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`La ventana de Carpetea no cargó ${DEV_URL}`)
}

export const test = base.extend<object, { app: DesktopApp }>({
  app: [
    async ({}, use) => {
      if (!existsSync(EXE)) throw new Error(`Falta ${EXE}. Compila con "npm run tauri dev" o "cargo build".`)
      const sandbox = createSandbox()
      let proc: ChildProcess | undefined
      let browser: Browser | undefined
      try {
        proc = spawn(EXE, [], {
          stdio: 'ignore',
          env: {
            ...process.env,
            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
            // Perfil propio: no comparte almacenamiento con tu instancia de Carpetea.
            WEBVIEW2_USER_DATA_FOLDER: sandbox.webview,
            CARPETEA_DATA_DIR: sandbox.data,
            CARPETEA_E2E_ROOT: sandbox.root,
          },
        })
        browser = await connect()
        const page = await appPage(browser)
        await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()

        const setDestination: DesktopApp['setDestination'] = async (dest) => {
          await page.evaluate((d) => {
            const raw = localStorage.getItem('carpetea:settings')
            const saved = raw ? JSON.parse(raw) : { state: {}, version: 0 }
            saved.state.destination = { customPath: '', ...d }
            localStorage.setItem('carpetea:settings', JSON.stringify(saved))
          }, dest)
          await page.reload()
          await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
        }

        await use({ page, sandbox, setDestination })
      } finally {
        await browser?.close().catch(() => {})
        // Cierra también los procesos de WebView2: si quedan vivos retienen el
        // puerto de depuración y bloquean el borrado de la carpeta de pruebas.
        if (proc?.pid) spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
        sandbox.cleanup()
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
})

export { expect }
