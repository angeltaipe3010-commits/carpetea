import { create } from 'zustand'
import { isTauri } from '@tauri-apps/api/core'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { SAMPLE_HISTORY, SAMPLE_MANAGED } from '@/data/mock'
import type { Operation } from '@/types'

interface HistoryState {
  operations: Operation[]
  /**
   * Carpetas creadas por DeskFlow (rutas absolutas). Se omiten al volver a
   * analizar un origen, para no reorganizar lo que ya está ordenado.
   * En la Fase 2 será una tabla en SQLite.
   */
  managed: string[]
  add: (op: Operation) => void
  replace: (op: Operation) => void
  clearSamples: () => void
  addManaged: (paths: string[]) => void
  removeManaged: (paths: string[]) => void
}

// En escritorio el historial vive en SQLite (App lo carga al arrancar): no se
// duplica en localStorage, que tiene poco espacio y podría llenarse.
const native = isTauri()
const noStorage: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
// Copias de versiones anteriores que guardaban el historial aquí.
if (native) {
  try {
    localStorage.removeItem('deskflow:history')
  } catch {
    /* sin acceso a localStorage: no pasa nada */
  }
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      // Los ejemplos solo existen en el prototipo del navegador.
      operations: native ? [] : SAMPLE_HISTORY,
      managed: native ? [] : SAMPLE_MANAGED,
      add: (op) => set((s) => ({ operations: [op, ...s.operations] })),
      replace: (op) => set((s) => ({ operations: s.operations.map((o) => (o.id === op.id ? op : o)) })),
      clearSamples: () => set((s) => ({ operations: s.operations.filter((o) => !o.sample) })),
      addManaged: (paths) => set((s) => ({ managed: [...new Set([...s.managed, ...paths])] })),
      removeManaged: (paths) => {
        const drop = new Set(paths.map((p) => p.toLowerCase()))
        set((s) => ({ managed: s.managed.filter((p) => !drop.has(p.toLowerCase())) }))
      },
    }),
    {
      name: 'deskflow:history',
      storage: createJSONStorage(() => (native ? noStorage : localStorage)),
      // v2: rutas absolutas y carpetas gestionadas. Los datos de la v1 eran de ejemplo.
      version: 2,
      migrate: () => (native ? { operations: [], managed: [] } : { operations: SAMPLE_HISTORY, managed: SAMPLE_MANAGED }),
    },
  ),
)

/** Carpetas gestionadas dentro de un origen, como rutas relativas ("Imágenes/Capturas"). */
export function managedWithin(managed: string[], sourcePath: string): string[] {
  const prefix = sourcePath.toLowerCase().replace(/\\+$/, '') + '\\'
  return managed.filter((p) => p.toLowerCase().startsWith(prefix)).map((p) => p.slice(prefix.length).replace(/\\/g, '/'))
}
