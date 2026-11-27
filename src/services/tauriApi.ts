/**
 * Implementación nativa de `CarpeteaApi`: llama a los comandos de Rust
 * (`src-tauri/src/lib.rs`) y recibe el progreso por canales.
 * Ninguna ruta se toca desde JavaScript.
 */
import { Channel, invoke } from '@tauri-apps/api/core'
import type { CarpeteaApi } from '@/services/api'
import type { DirProbe, DuplicateProgress, DuplicateSearch, Environment, ExecProgress, IndexedFolderRaw, Operation, PickedFolder, ScanProgress, ScanResult, SourceFolder } from '@/types'

function channel<T>(cb: (p: T) => void) {
  const ch = new Channel<T>()
  ch.onmessage = cb
  return ch
}

/** Los errores de Rust llegan como texto: se convierten en Error para la interfaz. */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

export const tauriApi: CarpeteaApi = {
  mode: 'native',

  environment: () => call<Environment>('environment'),

  listSuggestedFolders: () => call<SourceFolder[]>('list_suggested_folders'),

  pickFolder: (title, start) => call<PickedFolder | null>('pick_folder', { title, start: start ?? null }),

  probeDirs: (paths) => (paths.length ? call<DirProbe[]>('probe_dirs', { paths }) : Promise.resolve([])),

  localDocuments: () => call<{ path: string; created: boolean }>('local_documents'),

  checkAccess: (paths) => (paths.length ? call<boolean[]>('check_access', { paths }) : Promise.resolve([])),

  indexStructure: (root, maxDepth, skip) => call<IndexedFolderRaw[]>('index_structure', { root, maxDepth, skip }),

  async scan(source, opts, rules, skipDirs, onProgress, signal) {
    const onAbort = () => void call('cancel')
    signal.addEventListener('abort', onAbort)
    try {
      return await call<ScanResult>('scan', {
        sourcePath: source.path,
        opts,
        rules,
        skipDirs,
        onProgress: channel<ScanProgress>(onProgress),
      })
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  },

  // La ejecución no se cancela a medias: cada movimiento se verifica y registra.
  execute: (plan, onProgress) => call<Operation>('execute', { plan, onProgress: channel<ExecProgress>(onProgress) }),

  undo: (op, onProgress) => call<Operation>('undo', { opId: op.id, onProgress: channel<ExecProgress>(onProgress) }),

  loadHistory: () => call<{ operations: Operation[]; managed: string[] }>('history'),

  async findDuplicates(root, skip, exclusions, onProgress, signal) {
    const onAbort = () => void call('cancel_duplicates')
    signal.addEventListener('abort', onAbort)
    try {
      return await call<DuplicateSearch>('find_duplicates', { root, skip, exclusions, onProgress: channel<DuplicateProgress>(onProgress) })
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  },

  quarantineDuplicates: (fileIds, _groups, root, reviewFolder) =>
    call<Operation>('quarantine_duplicates', { fileIds, root, reviewFolder, onProgress: channel<ExecProgress>(() => {}) }),
}
