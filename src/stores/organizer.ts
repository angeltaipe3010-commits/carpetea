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
import { joinPath, renamePrefix } from '@/utils/plan'
import { useHistory } from './history'
import { useRules } from './rules'
import { useSettings } from './settings'

export type OrganizerStep = 'source' | 'scanning' | 'preview' | 'executing' | 'done'

interface OrganizerState {
  step: OrganizerStep
  source: SourceFolder | null
  scan: ScanProgress | null
  files: FileEntry[]
  plan: Record<string, Classification>
  excluded: Record<string, true>
  extraFolders: string[]
  existing: string[]
  scanMs: number
  selectedPath: string
  policy: ConflictPolicy
  exec: ExecProgress | null
  operation: Operation | null
  error: string | null

  selectSource: (s: SourceFolder | null) => void
  startScan: () => Promise<void>
  cancel: () => void
  select: (path: string) => void
  moveFiles: (ids: string[], dest: string[]) => void
  toggleExclude: (id: string) => void
  renameFolder: (path: string, name: string) => void
  createFolder: (parent: string, name: string) => void
  setPolicy: (p: ConflictPolicy) => void
  execute: (plan: OrganizePlan) => Promise<void>
  reset: () => void
}

let controller: AbortController | null = null

const initial = {
  step: 'source' as OrganizerStep,
  scan: null,
  files: [],
  plan: {},
  excluded: {},
  extraFolders: [],
  existing: [],
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

  selectSource: (source) => set({ source }),

  startScan: async () => {
    const source = get().source
    if (!source) return
    const s = useSettings.getState()
    controller = new AbortController()
    set({ ...initial, source, step: 'scanning' })
    try {
      const result = await api.scan(
        source.id,
        {
          maxDepth: s.maxDepth,
          recursive: s.recursive,
          applyRules: true,
          yearSubfolders: s.yearSubfolders,
          reviewFolderName: s.reviewFolderName,
        },
        useRules.getState().rules,
        (scan) => set({ scan }),
        controller.signal,
      )
      const plan: Record<string, Classification> = {}
      for (const c of result.classifications) plan[c.fileId] = c
      set({
        step: 'preview',
        files: result.files,
        plan,
        existing: result.existing,
        scanMs: result.durationMs,
        selectedPath: '',
      })
    } catch (e) {
      if (isAbort(e)) set({ step: 'source', scan: null })
      else set({ step: 'source', error: e instanceof Error ? e.message : 'Error desconocido' })
    }
  },

  cancel: () => controller?.abort(),

  select: (selectedPath) => set({ selectedPath }),

  moveFiles: (ids, dest) =>
    set((s) => {
      const plan = { ...s.plan }
      for (const id of ids) {
        const c = plan[id]
        if (!c || joinPath(c.dest) === joinPath(dest)) continue
        plan[id] = { ...c, dest, confidence: 'high', reason: 'Asignado manualmente', ruleId: undefined }
      }
      return { plan }
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
      const clean = name.trim().replace(/[\\/:*?"<>|]/g, '')
      if (!clean) return s
      const plan = { ...s.plan }
      for (const id in plan) {
        const dest = renamePrefix(plan[id].dest, path, clean)
        if (dest !== plan[id].dest) plan[id] = { ...plan[id], dest }
      }
      const extraFolders = s.extraFolders.map((p) => joinPath(renamePrefix(p.split('/'), path, clean)))
      const selectedPath = joinPath(renamePrefix(s.selectedPath.split('/'), path, clean))
      return { plan, extraFolders, selectedPath }
    }),

  createFolder: (parent, name) =>
    set((s) => {
      const clean = name.trim().replace(/[\\/:*?"<>|]/g, '')
      if (!clean) return s
      const path = parent ? `${parent}/${clean}` : clean
      return { extraFolders: [...s.extraFolders, path], selectedPath: path }
    }),

  setPolicy: (policy) => set({ policy }),

  execute: async (plan) => {
    controller = new AbortController()
    set({ step: 'executing', exec: { done: 0, total: plan.moves.length, current: '' } })
    try {
      const op = await api.execute(plan, (exec) => set({ exec }), controller.signal)
      useHistory.getState().add(op)
      set({ step: 'done', operation: op })
    } catch (e) {
      set({ step: 'preview', error: isAbort(e) ? 'Se detuvo la organización antes de terminar.' : 'No se pudo completar la operación.' })
    }
  },

  reset: () => set({ ...initial, source: get().source }),
}))
