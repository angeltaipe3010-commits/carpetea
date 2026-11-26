/**
 * Capa de servicios de DeskFlow.
 *
 * La interfaz `DeskFlowApi` es el contrato con el motor. En la Fase 1 la
 * implementa `mockApi` (todo en memoria, con tiempos simulados). En la
 * Fase 2 se añadirá `tauriApi`, que llama a comandos de Rust con `invoke` y
 * recibe el progreso por eventos; las pantallas no tendrán que cambiar.
 */
import { DUPLICATE_GROUPS, EXISTING_AT_DEST, MOCK_FILES, SOURCE_FOLDERS } from '@/data/mock'
import { classify } from '@/services/classifier'
import type {
  DuplicateGroup,
  DuplicateProgress,
  ExecProgress,
  MoveRecord,
  Operation,
  OrganizePlan,
  Rule,
  ScanOptions,
  ScanProgress,
  ScanResult,
  SourceFolder,
} from '@/types'
import { uid } from '@/lib/id'

export interface DeskFlowApi {
  /** Indica si las operaciones afectan al disco real. */
  readonly mode: 'mock' | 'native'
  listSuggestedFolders(): Promise<SourceFolder[]>
  scan(sourceId: string, opts: ScanOptions, rules: Rule[], onProgress: (p: ScanProgress) => void, signal: AbortSignal): Promise<ScanResult>
  execute(plan: OrganizePlan, onProgress: (p: ExecProgress) => void, signal: AbortSignal): Promise<Operation>
  undo(op: Operation, onProgress: (p: ExecProgress) => void): Promise<Operation>
  findDuplicates(onProgress: (p: DuplicateProgress) => void, signal: AbortSignal): Promise<DuplicateGroup[]>
  quarantineDuplicates(fileIds: string[], groups: DuplicateGroup[]): Promise<Operation>
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Operación cancelada', 'AbortError'))
    })
  })

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

const mockApi: DeskFlowApi = {
  mode: 'mock',

  async listSuggestedFolders() {
    await sleep(120)
    return SOURCE_FOLDERS
  },

  async scan(sourceId, opts, rules, onProgress, signal) {
    const t0 = performance.now()
    const source = SOURCE_FOLDERS.find((s) => s.id === sourceId)
    if (!source) throw new Error('Carpeta no encontrada')
    const files = MOCK_FILES[sourceId].filter((f) => opts.recursive || !f.relDir)
    const total = files.length
    const tick = (phase: ScanProgress['phase'], processed: number, current: string) =>
      onProgress({ phase, processed, total, current })

    // Fase 1: recorrer directorios.
    for (let i = 0; i < total; i += 6) {
      tick('walking', Math.min(i + 6, total), `${source.path}\\${files[i].relDir ? files[i].relDir + '\\' : ''}${files[i].name}`)
      await sleep(28, signal)
    }
    // Fase 2: metadatos (nombre, tamaño, fecha).
    for (let i = 0; i < total; i += 9) {
      tick('metadata', Math.min(i + 9, total), files[i].name)
      await sleep(22, signal)
    }
    // Fase 3: reglas.
    tick('rules', total, `${rules.filter((r) => r.enabled).length} reglas activas`)
    await sleep(280, signal)
    // Fase 4: clasificación.
    const classifications = []
    for (let i = 0; i < total; i++) {
      classifications.push(classify(files[i], rules, opts))
      if (i % 8 === 0) {
        tick('classifying', i + 1, files[i].name)
        await sleep(20, signal)
      }
    }
    tick('done', total, '')
    await sleep(240, signal)
    return { source, files, classifications, existing: EXISTING_AT_DEST[sourceId] ?? [], durationMs: performance.now() - t0 }
  },

  async execute(plan, onProgress, signal) {
    const files = MOCK_FILES[plan.sourceId] ?? []
    const locked = new Set(files.filter((f) => f.locked).map((f) => f.id))
    const moves: MoveRecord[] = []
    const errors: string[] = []
    const total = plan.moves.length
    for (let i = 0; i < total; i++) {
      const m = plan.moves[i]
      onProgress({ done: i, total, current: m.name })
      await sleep(total > 60 ? 18 : 40, signal)
      if (locked.has(m.fileId)) {
        moves.push({ fileId: m.fileId, name: m.name, from: m.from, to: m.to, status: 'skipped', note: 'Archivo en uso por otro proceso' })
        errors.push(`${m.name}: archivo en uso por otro proceso. No se movió.`)
      } else {
        moves.push({ fileId: m.fileId, name: m.name, from: m.from, to: m.to, status: 'moved' })
      }
    }
    onProgress({ done: total, total, current: '' })
    for (const s of plan.skipped)
      moves.push({ fileId: s.fileId, name: s.name, from: s.name, to: '', status: 'skipped', note: s.reason })
    await sleep(200, signal)
    return {
      id: uid('op'),
      kind: 'organize',
      createdAt: new Date().toISOString(),
      source: plan.sourcePath,
      status: errors.length ? 'partial' : 'completed',
      moves,
      foldersCreated: plan.foldersToCreate,
      errors,
    }
  },

  async undo(op, onProgress) {
    const toRestore = op.moves.filter((m) => m.status === 'moved')
    const total = toRestore.length
    const restored: MoveRecord[] = []
    for (let i = 0; i < total; i++) {
      const m = toRestore[i]
      onProgress({ done: i, total, current: m.name })
      await sleep(total > 60 ? 14 : 36)
      // Simulación: un archivo modificado tras moverse no se restaura a ciegas.
      const modified = i === 3 && total > 20
      restored.push(
        modified
          ? { ...m, status: 'not_restored', note: 'Se modificó después de organizarlo. Se dejó en su ubicación actual.' }
          : { ...m, status: 'restored' },
      )
    }
    onProgress({ done: total, total, current: '' })
    await sleep(200)
    const failed = restored.filter((m) => m.status === 'not_restored').length
    return {
      ...op,
      moves: op.moves.map((m) => restored.find((r) => r.fileId === m.fileId) ?? m),
      // Deshecha aunque quede algún archivo sin restaurar: el detalle lo explica en `errors`.
      status: 'rolled_back',
      undoneAt: new Date().toISOString(),
      errors: failed ? [...op.errors, `${failed} archivo(s) no se restauraron porque cambiaron después de organizarlos.`] : op.errors,
    }
  },

  async findDuplicates(onProgress, signal) {
    const total = 1284
    const phases: DuplicateProgress['phase'][] = ['sizes', 'partial-hash', 'full-hash']
    for (const phase of phases) {
      for (let i = 0; i <= total; i += 107) {
        onProgress({ phase, processed: Math.min(i, total), total })
        await sleep(36, signal)
      }
    }
    onProgress({ phase: 'done', processed: total, total })
    await sleep(160, signal)
    return DUPLICATE_GROUPS
  },

  async quarantineDuplicates(fileIds, groups) {
    await sleep(700)
    const all = groups.flatMap((g) => g.files)
    const moves: MoveRecord[] = fileIds.map((id) => {
      const f = all.find((x) => x.id === id)!
      return { fileId: id, name: f.name, from: `${f.path}\\${f.name}`, to: `Por revisar/Duplicados/${f.name}`, status: 'moved' }
    })
    return {
      id: uid('op'),
      kind: 'duplicates',
      createdAt: new Date().toISOString(),
      source: 'Varias ubicaciones',
      status: 'completed',
      moves,
      foldersCreated: ['Por revisar/Duplicados'],
      errors: [],
    }
  },
}

export const api: DeskFlowApi = mockApi
