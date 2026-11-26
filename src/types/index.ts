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
  /** Cómo se eligió el destino: carpeta existente del usuario o categoría encajada en ella. */
  via?: 'structure' | 'anchored' | 'course'
}

/** Carpeta existente en el destino, tal como la devuelve el motor. */
export interface IndexedFolderRaw {
  rel: string
  files: string[]
  fileCount: number
  project: boolean
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
  skipHidden: boolean
  exclusions: string[]
}

export interface ScanResult {
  source: SourceFolder
  files: FileEntry[]
  classifications: Classification[]
  /** Rutas absolutas de archivos que ya existen en disco: generan conflictos. */
  existing: string[]
  /** Archivos omitidos por estar en carpetas que DeskFlow ya organizó antes. */
  skippedManaged: number
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
  /** Descripción legible del destino, para el historial. */
  destinationLabel: string
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
  destination?: string
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

/**
 * Dónde se crea la estructura organizada.
 * - `source`: dentro de la misma carpeta que se organiza.
 * - `libraries`: en las bibliotecas de Windows (Documentos, Imágenes, Vídeos, Música).
 * - `custom`: en una carpeta elegida por el usuario.
 * Una carpeta sincronizada con la nube solo se usa si el usuario lo confirma
 * (`allowCloud`); si no, se usa una carpeta Documentos local.
 */
export type DestinationMode = 'source' | 'libraries' | 'custom'

export interface Destination {
  mode: DestinationMode
  customPath: string
  /** El usuario confirmó guardar en una carpeta sincronizada con la nube. */
  allowCloud?: boolean
  /** Proveedor detectado por el motor al elegir la carpeta (más fiable que el nombre). */
  cloudProvider?: string
}

/** Carpeta del sistema de archivos local (lo que devuelve el selector). */
export interface FsFolder {
  name: string
  path: string
  kind: 'drive' | 'folder'
  /** Proveedor si la carpeta está sincronizada con la nube. */
  cloud?: string
  /** Carpeta del sistema protegida. */
  system?: boolean
}

export interface LibrariesInfo {
  documents: string
  pictures: string
  videos: string
  music: string
}

/** Entorno del equipo: bibliotecas de Windows y si están en la nube. */
export interface Environment {
  home: string
  libraries: LibrariesInfo
  /** Proveedor de nube por biblioteca (`documents` → `OneDrive`). */
  libraryCloud: Partial<Record<keyof LibrariesInfo, string>>
}

export interface PickedFolder {
  name: string
  path: string
  cloud?: string
  problem?: string
}

export interface DirProbe {
  path: string
  exists: boolean
  files: string[]
}

export type ThemePref = 'system' | 'light' | 'dark'
export type MotionPref = 'system' | 'reduced' | 'full'
