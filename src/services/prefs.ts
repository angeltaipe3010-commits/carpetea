/**
 * Almacenamiento de preferencias y reglas.
 *
 * - La copia de trabajo vive en localStorage: se lee al instante, sin parpadeo
 *   de tema ni de valores por defecto al abrir la app.
 * - En la app de escritorio cada cambio se copia también en SQLite. Si se
 *   borran los datos del WebView (o se reinstala), `restorePrefs()` los
 *   recupera de SQLite al arrancar.
 */
import { invoke, isTauri } from '@tauri-apps/api/core'
import { createJSONStorage, type StateStorage } from 'zustand/middleware'

export const PREF_KEYS = ['deskflow:settings', 'deskflow:rules'] as const

const native = isTauri()

const mirrored: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    localStorage.setItem(name, value)
    if (native) void invoke('pref_set', { key: name, value }).catch((e) => console.error('[deskflow] pref_set', e))
  },
  removeItem: (name) => localStorage.removeItem(name),
}

export const prefsStorage = createJSONStorage(() => mirrored)

/**
 * Antes de pintar la app: lo que falte en localStorage se trae de SQLite, y lo
 * que solo esté en localStorage (versiones anteriores) se copia a SQLite.
 * Devuelve las claves recuperadas, para rehidratar esos stores.
 */
export async function restorePrefs(): Promise<string[]> {
  if (!native) return []
  const restored: string[] = []
  await Promise.all(
    PREF_KEYS.map(async (key) => {
      try {
        const local = localStorage.getItem(key)
        const saved = await invoke<string | null>('pref_get', { key })
        if (local === null && saved !== null) {
          localStorage.setItem(key, saved)
          restored.push(key)
        } else if (local !== null && saved === null) {
          await invoke('pref_set', { key, value: local })
        }
      } catch (e) {
        console.error('[deskflow] restorePrefs', key, e)
      }
    }),
  )
  return restored
}
