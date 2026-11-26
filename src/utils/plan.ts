/**
 * Funciones puras que convierten la propuesta editable en árbol, conflictos
 * y plan final. La vista previa y la ejecución usan exactamente este plan,
 * así que lo que se ve es lo que se ejecuta.
 *
 * El árbol es lógico (segmentos como "Documentos/Finanzas"); `resolve.dir`
 * lo traduce a rutas absolutas según el destino elegido.
 */
import type { Classification, Conflict, FileEntry, FolderNode, OrganizePlan } from '@/types'
import type { Resolver } from './destination'
import { winJoin } from './destination'

export const joinPath = (segs: string[]) => segs.join('/')

export interface Draft {
  files: FileEntry[]
  plan: Record<string, Classification>
  excluded: Record<string, true>
  extraFolders: string[]
  /** Archivos que ya existen en disco (rutas absolutas). */
  existing: string[]
  resolve: Resolver
  dirExists: (absPath: string) => boolean
}

export function buildTree(d: Draft): FolderNode {
  const root: FolderNode = { path: '', name: 'raíz', depth: 0, children: [], fileIds: [], total: 0, isNew: false }
  const index = new Map<string, FolderNode>([['', root]])

  const ensure = (segs: string[]): FolderNode => {
    let parent = root
    for (let i = 0; i < segs.length; i++) {
      const path = joinPath(segs.slice(0, i + 1))
      let node = index.get(path)
      if (!node) {
        const abs = d.resolve.dir(segs.slice(0, i + 1))
        node = { path, name: segs[i], depth: i + 1, children: [], fileIds: [], total: 0, isNew: !d.dirExists(abs) }
        index.set(path, node)
        parent.children.push(node)
      }
      parent = node
    }
    return parent
  }

  for (const f of d.files) {
    if (d.excluded[f.id]) continue
    const c = d.plan[f.id]
    if (!c) continue
    ensure(c.dest).fileIds.push(f.id)
  }
  for (const p of d.extraFolders) ensure(p.split('/'))

  const finish = (n: FolderNode): number => {
    n.children.sort((a, b) => Number(isReview(a)) - Number(isReview(b)) || a.name.localeCompare(b.name, 'es'))
    n.total = n.fileIds.length + n.children.reduce((s, c) => s + finish(c), 0)
    return n.total
  }
  finish(root)
  return root
}

// "Por revisar" siempre al final del primer nivel.
const isReview = (n: FolderNode) => n.depth === 1 && n.name.toLowerCase().includes('revisar')

export function flattenFolders(n: FolderNode, out: FolderNode[] = []): FolderNode[] {
  for (const c of n.children) {
    out.push(c)
    flattenFolders(c, out)
  }
  return out
}

function nextFreeName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let i = 1
  let candidate = `${base} (${i})${ext}`
  while (taken.has(candidate.toLowerCase())) candidate = `${base} (${++i})${ext}`
  return candidate
}

const splitAbs = (p: string) => {
  const i = p.lastIndexOf('\\')
  return [p.slice(0, i).toLowerCase(), p.slice(i + 1).toLowerCase()] as const
}

/** Detecta colisiones: dos archivos con el mismo nombre en un destino, o un archivo que ya existe allí. */
export function findConflicts(d: Draft): Record<string, Conflict> {
  const out: Record<string, Conflict> = {}
  const taken = new Map<string, Set<string>>()
  const existing = new Set<string>()
  for (const p of d.existing) {
    const [dir, name] = splitAbs(p)
    existing.add(`${dir}\\${name}`)
    if (!taken.has(dir)) taken.set(dir, new Set())
    taken.get(dir)!.add(name)
  }
  for (const f of d.files) {
    if (d.excluded[f.id] || !d.plan[f.id]) continue
    const dir = d.resolve.dir(d.plan[f.id].dest).toLowerCase()
    const names = taken.get(dir) ?? new Set<string>()
    taken.set(dir, names)
    const key = f.name.toLowerCase()
    if (names.has(key)) {
      const renameTo = nextFreeName(f.name, names)
      out[f.id] = { fileId: f.id, kind: existing.has(`${dir}\\${key}`) ? 'exists' : 'same-name', renameTo }
      names.add(renameTo.toLowerCase())
    } else {
      names.add(key)
    }
  }
  return out
}

export function buildPlan(
  d: Draft,
  conflicts: Record<string, Conflict>,
  policy: 'rename' | 'skip',
  sourceId: string,
  sourcePath: string,
): OrganizePlan {
  const moves: OrganizePlan['moves'] = []
  const skipped: OrganizePlan['skipped'] = []
  const folders = new Set<string>()
  for (const n of flattenFolders(buildTree(d))) if (n.isNew) folders.add(d.resolve.dir(n.path.split('/')))

  for (const f of d.files) {
    const from = winJoin(sourcePath, f.relDir, f.name)
    if (d.excluded[f.id]) {
      skipped.push({ fileId: f.id, name: f.name, reason: 'Excluido por el usuario' })
      continue
    }
    const c = d.plan[f.id]
    if (!c) continue
    const conflict = conflicts[f.id]
    if (conflict && policy === 'skip') {
      skipped.push({ fileId: f.id, name: f.name, reason: 'Conflicto de nombre' })
      continue
    }
    const finalName = conflict ? conflict.renameTo : f.name
    moves.push({ fileId: f.id, name: f.name, from, to: winJoin(d.resolve.dir(c.dest), finalName), finalName })
  }
  return { sourceId, sourcePath, destinationLabel: d.resolve.label, moves, skipped, foldersToCreate: [...folders].sort() }
}

/** Renombra una carpeta reescribiendo el prefijo de todos los destinos afectados. */
export function renamePrefix(segs: string[], path: string, newName: string): string[] {
  const target = path.split('/')
  if (segs.length < target.length) return segs
  for (let i = 0; i < target.length; i++) if (segs[i] !== target[i]) return segs
  const copy = [...segs]
  copy[target.length - 1] = newName
  return copy
}
