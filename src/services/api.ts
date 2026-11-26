/**
 * Capa de servicios de DeskFlow.
 *
 * `DeskFlowApi` es el contrato con el motor. Hay dos implementaciones:
 * - `mockApi` (este archivo): todo en memoria, para el navegador y el prototipo.
 * - `tauriApi` (`tauriApi.ts`): comandos de Rust dentro de la app de escritorio.
 * Las pantallas solo usan `api` y no saben cuál está activa.
 */
import { isTauri } from '@tauri-apps/api/core'
import { DUPLICATE_GROUPS, EXISTING_FILES, MOCK_FILES, SOURCE_FOLDERS } from '@/data/mock'
import { classify } from '@/services/classifier'
import { localFs } from '@/services/localFs'
import { tauriApi } from '@/services/tauriApi'
import type {
  DirProbe,
  DuplicateGroup,
  DuplicateProgress,
  Environment,
  ExecProgress,
  IndexedFolderRaw,
  MoveRecord,
  Operation,
  OrganizePlan,
  PickedFolder,
  Rule,
  ScanOptions,
  ScanProgress,
  ScanResult,
  SourceFolder,
} from '@/types'
import { uid } from '@/lib/id'
import { cloudProvider } from '@/utils/destination'
export { NotAvailableError } from '@/services/errors'

export interface DeskFlowApi {
  /** `mock`: datos simulados. `native`: disco real a través de Rust. */
  readonly mode: 'mock' | 'native'
  environment(): Promise<Environment>
  listSuggestedFolders(): Promise<SourceFolder[]>
  /** Selector de carpetas. En modo nativo, la carpeta elegida queda autorizada. */
  pickFolder(title: string, start?: string): Promise<PickedFolder | null>
  /** Qué carpetas de destino existen y qué archivos contienen. */
  probeDirs(paths: string[]): Promise<DirProbe[]>
  /** Carpeta Documentos que no está en la nube; la crea si no existe. */
  localDocuments(): Promise<{ path: string; created: boolean }>
  /** Si el motor tiene permiso sobre cada ruta (las elegidas en el selector o sugeridas). */
  checkAccess(paths: string[]): Promise<boolean[]>
  /** Estructura de carpetas existente bajo `root` (solo lectura). `skip`: rutas absolutas a omitir. */
  indexStructure(root: string, maxDepth: number, skip: string[]): Promise<IndexedFolderRaw[]>
  /** `skipDirs`: carpetas relativas al origen que DeskFlow ya organizó. */
  scan(
    source: SourceFolder,
    opts: ScanOptions,
    rules: Rule[],
    skipDirs: string[],
    onProgress: (p: ScanProgress) => void,
    signal: AbortSignal,
  ): Promise<ScanResult>
  execute(plan: OrganizePlan, onProgress: (p: ExecProgress) => void, signal: AbortSignal): Promise<Operation>
  undo(op: Operation, onProgress: (p: ExecProgress) => void): Promise<Operation>
  /** Historial persistente (null en modo simulado: lo guarda el navegador). */
  loadHistory(): Promise<{ operations: Operation[]; managed: string[] } | null>
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

export const isAbort = (e: unknown) =>
  (e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && /cancelad/i.test(e.message))

const mockApi: DeskFlowApi = {
  mode: 'mock',

  async environment() {
    const libraries = localFs.libraries()
    const libraryCloud: Environment['libraryCloud'] = {}
    for (const k of Object.keys(libraries) as (keyof typeof libraries)[]) {
      const p = cloudProvider(libraries[k])
      if (p) libraryCloud[k] = p
    }
    return { home: 'C:\\Users\\Usuario', libraries, libraryCloud }
  },

  async listSuggestedFolders() {
    await sleep(120)
    return SOURCE_FOLDERS
  },

  async pickFolder() {
    // En el navegador se usa el selector simulado (FolderPicker); este método no se llama.
    return null
  },

  async probeDirs(paths) {
    return paths.map((path) => {
      const prefix = path.toLowerCase() + '\\'
      const files = EXISTING_FILES.filter((f) => f.toLowerCase().startsWith(prefix) && !f.slice(prefix.length).includes('\\')).map((f) =>
        f.slice(prefix.length),
      )
      return { path, exists: localFs.exists(path), files }
    })
  },

  async localDocuments() {
    return localFs.findOrCreateLocalDocuments()
  },

  async checkAccess(paths) {
    return paths.map(() => true)
  },

  async indexStructure(root, maxDepth, skip) {
    await sleep(180)
    return localFs.index(root, maxDepth, skip)
  },

  async scan(sourceFolder, opts, rules, skipDirs, onProgress, signal) {
    const t0 = performance.now()
    const source = SOURCE_FOLDERS.find((s) => s.id === sourceFolder.id)
    if (!source) throw new Error('Carpeta no encontrada')
    const skip = skipDirs.map((d) => d.toLowerCase())
    const inManaged = (relDir: string) => {
      const r = relDir.toLowerCase()
      return !!r && skip.some((d) => r === d || r.startsWith(d + '/'))
    }
    const candidates = MOCK_FILES[source.id].filter((f) => opts.recursive || !f.relDir)
    const files = candidates.filter((f) => !inManaged(f.relDir))
    const skippedManaged = candidates.length - files.length
    const total = files.length
    const tick = (phase: ScanProgress['phase'], processed: number, current: string) => onProgress({ phase, processed, total, current })

    for (let i = 0; i < total; i += 6) {
      tick('walking', Math.min(i + 6, total), `${source.path}\\${files[i].relDir ? files[i].relDir + '\\' : ''}${files[i].name}`)
      await sleep(28, signal)
    }
    for (let i = 0; i < total; i += 9) {
      tick('metadata', Math.min(i + 9, total), files[i].name)
      await sleep(22, signal)
    }
    tick('rules', total, `${rules.filter((r) => r.enabled).length} reglas activas`)
    await sleep(280, signal)
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
    return { source, files, classifications, existing: [], skippedManaged, durationMs: performance.now() - t0 }
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
    for (const s of plan.skipped) moves.push({ fileId: s.fileId, name: s.name, from: s.name, to: '', status: 'skipped', note: s.reason })
    await sleep(200, signal)
    return {
      id: uid('op'),
      kind: 'organize',
      createdAt: new Date().toISOString(),
      source: plan.sourcePath,
      destination: plan.destinationLabel,
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
      restored.push(modified ? { ...m, status: 'not_restored', note: 'Se modificó después de organizarlo. Se dejó en su ubicación actual.' } : { ...m, status: 'restored' })
    }
    onProgress({ done: total, total, current: '' })
    await sleep(200)
    const failed = restored.filter((m) => m.status === 'not_restored').length
    return {
      ...op,
      moves: op.moves.map((m) => restored.find((r) => r.fileId === m.fileId) ?? m),
      status: 'rolled_back',
      undoneAt: new Date().toISOString(),
      errors: failed ? [...op.errors, `${failed} archivo(s) no se restauraron porque cambiaron después de organizarlos.`] : op.errors,
    }
  },

  async loadHistory() {
    return null
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

export const api: DeskFlowApi = isTauri() ? tauriApi : mockApi
export const isNative = api.mode === 'native'
