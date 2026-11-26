import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Destination, MotionPref, ThemePref } from '@/types'

/** Preferencias. En el prototipo viven en localStorage; en la Fase 2 pasan a SQLite. */
interface SettingsState {
  theme: ThemePref
  motion: MotionPref
  maxDepth: number
  yearSubfolders: boolean
  recursive: boolean
  reviewFolderName: string
  skipHidden: boolean
  contentAnalysis: boolean
  exclusions: string[]
  /** Destino predeterminado al organizar. */
  destination: Destination
  /** Encajar los archivos en las carpetas que ya existen en el destino. */
  useStructure: boolean
  set: (patch: Partial<Omit<SettingsState, 'set' | 'addExclusion' | 'removeExclusion' | 'reset'>>) => void
  addExclusion: (path: string) => void
  removeExclusion: (path: string) => void
  reset: () => void
}

const defaults = {
  theme: 'system' as ThemePref,
  motion: 'system' as MotionPref,
  maxDepth: 4,
  yearSubfolders: true,
  recursive: true,
  reviewFolderName: 'Por revisar',
  skipHidden: true,
  contentAnalysis: true,
  destination: { mode: 'source', customPath: '' } as Destination,
  useStructure: true,
  exclusions: ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', '%APPDATA%', 'node_modules', '.git'],
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      set: (patch) => set(patch),
      addExclusion: (path) =>
        set((s) => (s.exclusions.includes(path) ? s : { exclusions: [...s.exclusions, path] })),
      removeExclusion: (path) => set((s) => ({ exclusions: s.exclusions.filter((e) => e !== path) })),
      reset: () => set(defaults),
    }),
    { name: 'deskflow:settings' },
  ),
)
