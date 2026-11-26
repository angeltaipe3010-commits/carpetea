/**
 * Tipos de dominio de DeskFlow.
 *
 * Son el contrato entre la interfaz y el motor. En la Fase 2 estos mismos
 * tipos se reflejarán en structs de Rust (serde) y viajarán por los comandos
 * y eventos de Tauri, así que se mantienen planos y serializables a JSON.
 */

export type Category =
  | 'documents'
  | 'images'
  | 'videos'
  | 'audio'
  | 'archives'
  | 'programs'
  | 'code'
  | 'other'

export type Confidence = 'high' | 'medium' | 'low'

/** Archivo encontrado durante el escaneo. `relDir` es relativo a la carpeta de origen. */
export interface FileEntry {
  id: string
  name: string
  ext: string
  size: number
  modified: string
  relDir: string
  /** El motor lo detecta como bloqueado por otro proceso. */
  locked?: boolean
}

/** Resultado del clasificador para un archivo. `dest` son segmentos de carpeta relativos al origen. */
export interface Classification {
  fileId: string
  category: Category
  dest: string[]
  confidence: Confidence
  reason: string
  ruleId?: string
}

export interface SourceFolder {
  id: string
  name: string
  path: string
  fileCount: number
  size: number
}

export type ScanPhase = 'walking' | 'metadata' | 'rules' | 'classifying' | 'done'

export interface ScanProgress {
  phase: ScanPhase
  processed: number
  total: number
  current: string
}

export interface ScanOptions {
  maxDepth: number
  recursive: boolean
  applyRules: boolean
  yearSubfolders: boolean
  reviewFolderName: string
}

export interface ScanResult {
  source: SourceFolder
  files: FileEntry[]
  classifications: Classification[]
  /** Rutas destino (carpeta/archivo) que ya existen en disco: generan conflictos. */
  existing: string[]
  durationMs: number
}

export interface FolderNode {
  path: string
  name: string
  depth: number
  children: FolderNode[]
  fileIds: string[]
  /** Archivos en este nodo y todos sus descendientes. */
  total: number
  /** Carpeta que todavía no existe y se creará al confirmar. */
  isNew: boolean
}

export type ConflictKind = 'same-name' | 'exists'

export interface Conflict {
  fileId: string
  kind: ConflictKind
  renameTo: string
}

export type ConflictPolicy = 'rename' | 'skip'

/** Lo que el usuario confirma: es exactamente lo que el motor ejecutará. */
export interface OrganizePlan {
  sourceId: string
  sourcePath: string
  moves: { fileId: string; name: string; from: string; to: string; finalName: string }[]
  skipped: { fileId: string; name: string; reason: string }[]
  foldersToCreate: string[]
}

export type OperationStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'rolled_back'

export interface MoveRecord {
  fileId: string
  name: string
  from: string
  to: string
  status: 'moved' | 'skipped' | 'failed' | 'restored' | 'not_restored'
  note?: string
}

export interface Operation {
  id: string
  kind: 'organize' | 'duplicates'
  createdAt: string
  source: string
  status: OperationStatus
  moves: MoveRecord[]
  foldersCreated: string[]
  errors: string[]
  undoneAt?: string
  /** Operaciones de ejemplo sembradas en el prototipo. */
  sample?: boolean
}

export interface ExecProgress {
  done: number
  total: number
  current: string
}

export type RuleField = 'extension' | 'name' | 'size' | 'modified' | 'category'
export type RuleOperator = 'is' | 'contains' | 'gt' | 'lt'

export interface RuleCondition {
  id: string
  field: RuleField
  operator: RuleOperator
  value: string
}

export interface Rule {
  id: string
  name: string
  enabled: boolean
  conditions: RuleCondition[]
  action: 'move' | 'review'
  destination: string
}

export interface DuplicateFile {
  id: string
  name: string
  path: string
  size: number
  modified: string
}

export interface DuplicateGroup {
  id: string
  hash: string
  size: number
  files: DuplicateFile[]
}

export type DuplicatePhase = 'sizes' | 'partial-hash' | 'full-hash' | 'done'

export interface DuplicateProgress {
  phase: DuplicatePhase
  processed: number
  total: number
}

export type ThemePref = 'system' | 'light' | 'dark'
export type MotionPref = 'system' | 'reduced' | 'full'
