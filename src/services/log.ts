/**
 * Registro de errores de la interfaz. En la app de escritorio se escriben en
 * el archivo de registro de DeskFlow (junto a los del motor), para poder
 * diagnosticar un problema sin pedir capturas. Nunca sale del equipo.
 */
import { invoke, isTauri } from '@tauri-apps/api/core'

const native = isTauri()

function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}${e.stack ? `\n${e.stack}` : ''}`
  try {
    return typeof e === 'string' ? e : JSON.stringify(e)
  } catch {
    return String(e)
  }
}

export function reportError(where: string, e: unknown) {
  const message = `[${where}] ${describe(e)}`.slice(0, 8000)
  console.error(message)
  if (native) void invoke('log_event', { level: 'error', message }).catch(() => {})
}

/** Errores no capturados en cualquier parte de la interfaz. */
export function installErrorHandlers() {
  window.addEventListener('error', (ev) => reportError('window', ev.error ?? ev.message))
  window.addEventListener('unhandledrejection', (ev) => reportError('promise', ev.reason))
}

export const openLogFolder = () => invoke('open_log_dir')
