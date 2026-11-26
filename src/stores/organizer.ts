import { create } from 'zustand'
import { api, isAbort } from '@/services/api'
import type {
  Classification,
  ConflictPolicy,
  ExecProgress,
  FileEntry,
  Operation,
  OrganizePlan,
  ScanProgress,
  SourceFolder,
} from '@/types'
import { cleanFolderName } from '@/utils/names'
import { joinPath, renamePrefix } from '@/utils/plan'
import { structureRoots } from '@/utils/destination'
import { adapt, buildIndex } from '@/utils/structure'
import { librariesOf, useEnv } from './env'
import { managedWithin, useHistory } from './history'
import { useRules } from './rules'
import { useSettings } from './settings'

export type OrganizerStep = 'source' | 'scanning' | 'preview' | 'executing' | 'done'

export interface StructureState {
  status: 'off' | 'loading' | 'ready' | 'error'
  /** Carpetas existentes que se aprendieron. */
  folders: number
  error?: string
}

interface OrganizerState {
  step: OrganizerStep
  source: SourceFolder | null
  scan: ScanProgress | null
  files: FileEntry[]
  plan: Record<string, Classification>
  /** Clasificación del motor antes de aplicar la estructura del usuario. */
  base: Record<string, Classification>
  /** Archivos que el usuario colocó a mano: la estructura no los vuelve a mover. */
  manual: Record<string, true>
  structure: StructureState
  excluded: Record<string, true>
  extraFolders: string[]
  existing: string[]
  skippedManaged: number
  scanMs: number
  selectedPath: string
  policy: ConflictPolicy
  exec: ExecProgress | null
  operation: Operation | null
  error: string | null

  selectSource: (s: SourceFolder | null) => void
  startScan: () => Promise<void>
  /** Recalcula los destinos con la estructura existente del destino actual. */
  applyStructure: () => Promise<void>
  cancel: () => void
  select: (path: string) => void
  moveFiles: (ids: string[], dest: string[]) => void
  toggleExclude: (id: string) => void
  /** Excluye o incluye varios archivos en un solo cambio. */
  setExcluded: (ids: string[], value: boolean) => void
  renameFolder: (path: string, name: string) => void
  createFolder: (parent: string, name: string) => void
  setPolicy: (p: ConflictPolicy) => void
  execute: (plan: OrganizePlan) => Promise<void>
  reset: () => void
}

let controller: AbortController | null = null
// Evita que una indexación antigua pise a una más reciente.
let structureRun = 0

const initial = {
  step: 'source' as OrganizerStep,
  scan: null,
  files: [],
  plan: {},
  base: {},
  manual: {},
  structure: { status: 'off', folders: 0 } as StructureState,
  excluded: {},
  extraFolders: [],
  existing: [],
  skippedManaged: 0,
  scanMs: 0,
  selectedPath: '',
  policy: 'rename' as ConflictPolicy,
  exec: null,
  operation: null,
  error: null,
}

export const useOrganizer = create<OrganizerState>((set, get) => ({
  ...initial,
  source: null,

  // Cambiar de carpeta descarta el análisis anterior (si no, la vista previa
  // vieja se mostraría con el nombre de la carpeta nueva).
  selectSource: (source) => {
    const s = get()
    if (s.step === 'executing' || s.step === 'scanning') return
    set(s.source?.id === source?.id ? { source } : { ...initial, source })
  },

  startScan: async () => {
    const source = get().source
    if (!source) return
    const s = useSettings.getState()
    controller = new AbortController()
    set({ ...initial, source, step: 'scanning' })
    const skipDirs = managedWithin(useHistory.getState().managed, source.path)
    try {
      const result = await api.scan(
        source,
        {
          maxDepth: s.maxDepth,
          recursive: s.recursive,
          applyRules: true,
          yearSubfolders: s.yearSubfolders,
          reviewFolderName: s.reviewFolderName,
          skipHidden: s.skipHidden,
          exclusions: s.exclusions,
        },
        useRules.getState().rules,
        skipDirs,
        (scan) => set({ scan }),
        controller.signal,
      )
      const plan: Record<string, Classification> = {}
      for (const c of result.classifications) plan[c.fileId] = c
      set({
        step: 'preview',
        files: result.files,
        plan,
        base: plan,
        manual: {},
        existing: result.existing,
        skippedManaged: result.skippedManaged,
        scanMs: result.durationMs,
        selectedPath: '',
      })
      void get().applyStructure()
    } catch (e) {
      if (isAbort(e)) set({ step: 'source', scan: null })
      else set({ step: 'source', error: e instanceof Error ? e.message : 'Error desconocido' })
    }
  },

  applyStructure: async () => {
    const run = ++structureRun
    const { source, base, files } = get()
    const s = useSettings.getState()
    const withManual = (next: Record<string, Classification>) => {
      const { manual, plan } = get()
      const out = { ...next }
      for (const id in manual) if (plan[id]) out[id] = plan[id]
      return out
    }
    if (!source || !s.useStructure) {
      set({ plan: withManual(base), structure: { status: 'off', folders: 0 } })
      return
    }
    set({ structure: { status: 'loading', folders: 0 } })
    try {
      const roots = structureRoots(s.destination, source.path, librariesOf(useEnv.getState().env))
      const indexed = await Promise.all(
        roots.map(async (r) => ({ prefix: r.prefix, folders: await api.indexStructure(r.root, 4, [source.path]) })),
      )
      if (run !== structureRun) return
      const idx = buildIndex(indexed, s.reviewFolderName)
      const next: Record<string, Classification> = {}
      for (const f of files) if (base[f.id]) next[f.id] = adapt(idx, f, base[f.id], s.maxDepth, s.reviewFolderName)
      set({ plan: withManual(next), structure: { status: 'ready', folders: idx.folders.length } })
    } catch (e) {
      if (run !== structureRun) return
      set({ plan: withManual(base), structure: { status: 'error', folders: 0, error: e instanceof Error ? e.message : String(e) } })
    }
  },

  cancel: () => controller?.abort(),

  select: (selectedPath) => set({ selectedPath }),

  moveFiles: (ids, dest) =>
    set((s) => {
      const plan = { ...s.plan }
      const manual = { ...s.manual }
      for (const id of ids) {
        const c = plan[id]
        if (!c || joinPath(c.dest) === joinPath(dest)) continue
        plan[id] = { ...c, dest, confidence: 'high', reason: 'Asignado manualmente', ruleId: undefined, via: undefined }
        manual[id] = true
      }
      return { plan, manual }
    }),

  setExcluded: (ids, value) =>
    set((s) => {
      const excluded = { ...s.excluded }
      for (const id of ids) {
        if (value) excluded[id] = true
        else delete excluded[id]
      }
      return { excluded }
    }),

  toggleExclude: (id) =>
    set((s) => {
      const excluded = { ...s.excluded }
      if (excluded[id]) delete excluded[id]
      else excluded[id] = true
      return { excluded }
    }),

  renameFolder: (path, name) =>
    set((s) => {
      const clean = cleanFolderName(name)
      if (!clean) return s
      const plan = { ...s.plan }
      const manual = { ...s.manual }
      for (const id in plan) {
        const dest = renamePrefix(plan[id].dest, path, clean)
        if (dest !== plan[id].dest) {
          plan[id] = { ...plan[id], dest }
          manual[id] = true // un renombrado es una decisión del usuario
        }
      }
      const extraFolders = s.extraFolders.map((p) => joinPath(renamePrefix(p.split('/'), path, clean)))
      const selectedPath = joinPath(renamePrefix(s.selectedPath.split('/'), path, clean))
      return { plan, manual, extraFolders, selectedPath }
    }),

  createFolder: (parent, name) =>
    set((s) => {
      const clean = cleanFolderName(name)
      if (!clean) return s
      const path = parent ? `${parent}/${clean}` : clean
      return { extraFolders: [...s.extraFolders, path], selectedPath: path }
    }),

  setPolicy: (policy) => set({ policy }),

  execute: async (plan) => {
    // Un doble clic no debe lanzar dos organizaciones.
    if (get().step === 'executing') return
    controller = new AbortController()
    set({ step: 'executing', exec: { done: 0, total: plan.moves.length, current: '' } })
    try {
      const op = await api.execute(plan, (exec) => set({ exec }), controller.signal)
      useHistory.getState().add(op)
      useHistory.getState().addManaged(op.foldersCreated)
      set({ step: 'done', operation: op })
    } catch (e) {
      set({ step: 'preview', error: isAbort(e) ? 'Se detuvo la organización antes de terminar.' : 'No se pudo completar la operación.' })
    }
  },

  reset: () => set({ ...initial, source: get().source }),
}))
