import { create } from 'zustand'
import { api } from '@/services/api'
import { LIBRARY_LABEL } from '@/services/localFs'
import type { Environment, LibrariesInfo } from '@/types'

/** Entorno del equipo (bibliotecas y nube), leído una vez al arrancar. */
interface EnvState {
  env: Environment | null
  load: () => Promise<void>
}

export const useEnv = create<EnvState>((set) => ({
  env: null,
  load: async () => set({ env: await api.environment() }),
}))

const EMPTY: LibrariesInfo = { documents: '', pictures: '', videos: '', music: '' }

export const librariesOf = (env: Environment | null): LibrariesInfo => env?.libraries ?? EMPTY

/** Bibliotecas sincronizadas con la nube (vacío = todas locales). */
export function cloudLibrariesOf(env: Environment | null): { label: string; provider: string }[] {
  if (!env) return []
  return (Object.keys(env.libraryCloud) as (keyof LibrariesInfo)[])
    .filter((k) => env.libraryCloud[k])
    .map((k) => ({ label: LIBRARY_LABEL[k], provider: env.libraryCloud[k]! }))
}
