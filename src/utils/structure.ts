/**
 * "Usar mi estructura": encaja cada archivo en las carpetas que el usuario ya tiene.
 *
 * 1. Se indexan las carpetas del destino: palabras de su nombre (y de sus
 *    antecesoras), siglas ("Programacion Orientada a Objetos" → "poo") y
 *    palabras que se repiten en los archivos que ya contienen.
 * 2. Cada archivo se puntúa contra cada carpeta. Las palabras raras pesan más
 *    que las comunes (IDF): "orientada" vale más que "cibertec".
 * 3. Si una carpeta coincide con claridad, el archivo va ahí. Si no, se usa la
 *    categoría normal, pero encajada en las carpetas existentes ("Estudios",
 *    "Grabaciones de pantalla"…) en vez de crear otras paralelas.
 *
 * Las reglas del usuario siguen teniendo prioridad y no se tocan.
 */
import type { Classification, FileEntry, IndexedFolderRaw } from '@/types'
import { categoryOf } from '@/services/classifier'

export interface IndexedFolder {
  /** Segmentos lógicos del árbol de DeskFlow (con el prefijo de la raíz). */
  segs: string[]
  name: string
  depth: number
  own: Set<string>
  ancestors: Set<string>
  acronyms: Set<string>
  siblings: Set<string>
  /** Categoría predominante de los archivos que ya contiene. */
  categories: Map<string, number>
  fileCount: number
  /** Proyecto de código, carpeta de un programa o "Por revisar": no es destino. */
  blocked: boolean
}

export interface StructureIndex {
  folders: IndexedFolder[]
  df: Map<string, number>
  /** En cuántas carpetas se repite una palabra entre sus archivos (tu nombre, "t1"…). */
  sibDf: Map<string, number>
  /** Rutas lógicas existentes en minúsculas, para encajar categorías. */
  byPath: Map<string, IndexedFolder>
}

const STOP = new Set(
  'de del la las el los lo y e a o u en para con por sin sobre the of and to for in un una unos unas al mi mis tu tus su sus copia final nuevo nueva nuevos version ver'.split(
    ' ',
  ),
)

// Palabras genéricas de categoría: no sirven para elegir una carpeta concreta.
const GENERIC = new Set(
  'documento documentos documents docs archivo archivos carpeta carpetas varios otros otro imagen imagenes images image foto fotos video videos audio audios musica music programa programas proyectos proyecto projects project descargas downloads download escritorio desktop pdf docx doc xlsx pptx ppt txt png jpg jpeg zip rar exe config configuracion settings log logs temp tmp cache data src public assets lib bin backup old test tests demo sample ejemplo ejemplos'.split(
    ' ',
  ),
)

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Palabras significativas de un nombre (sin extensión, tildes ni números sueltos). */
export function tokens(name: string, keepGeneric = false): string[] {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '')
  const out = new Set<string>()
  for (const raw of strip(base.replace(/([a-z])([A-Z])/g, '$1 $2')).split(/[^a-z0-9]+/)) {
    if (!raw || /^\d+$/.test(raw)) continue
    const mixed = /\d/.test(raw) && /[a-z]/.test(raw)
    if (raw.length < 3 && !mixed) continue
    if (STOP.has(raw)) continue
    if (!keepGeneric && GENERIC.has(raw)) continue
    out.add(raw)
  }
  return [...out]
}

/** Siglas de 3–5 letras formadas por palabras seguidas: "programacion orientada objetos" → "poo". */
function acronyms(words: string[]): Set<string> {
  const w = words.filter((x) => /^[a-z]/.test(x))
  const out = new Set<string>()
  for (let len = 3; len <= Math.min(5, w.length); len++) {
    for (let i = 0; i + len <= w.length; i++) out.add(w.slice(i, i + len).map((x) => x[0]).join(''))
  }
  return out
}

const isReviewName = (n: string) => /^(por )?revisar$|^pendientes?$/.test(strip(n))

/**
 * Carpetas que gestionan programas (no el usuario): existen, pero no son destino.
 * Incluye apps portables descomprimidas ("scrcpy-win64-v5.0.1").
 */
const APP_FOLDER = /^(iisexpress|my web sites|visual studio.*|windowspowershell|powershell|custom office templates|zoom|wps.*|sql server management studio.*|outlook files|onenote notebooks|my games|rockstar games|electronic arts|ubisoft|riot games|fiddler.*|adobe|blackmagic design|obs-studio)$/
const PORTABLE = /(win64|win32|x64|x86|amd64|portable|-v?\d+\.\d+)/
const isAppFolder = (n: string) => APP_FOLDER.test(strip(n)) || PORTABLE.test(strip(n))

/** "pooii" → "poo", "poo2" → "poo": sigla seguida de número de curso. */
const acronymBase = (t: string) => t.match(/^([a-z]{3,5}?)(iii|ii|iv|vi|v|i|\d{1,2})$/)?.[1]

export function buildIndex(roots: { prefix: string[]; folders: IndexedFolderRaw[] }[], reviewName: string): StructureIndex {
  const folders: IndexedFolder[] = []
  const byPath = new Map<string, IndexedFolder>()
  for (const { prefix, folders: raw } of roots) {
    for (const f of raw) {
      const rel = f.rel.split('/').filter(Boolean)
      const segs = [...prefix, ...rel]
      const name = rel[rel.length - 1] ?? ''
      if (!name) continue
      const own = tokens(name)
      const ancestors = new Set(rel.slice(0, -1).flatMap((s) => tokens(s)))
      const counts = new Map<string, number>()
      const categories = new Map<string, number>()
      for (const file of f.files) {
        for (const t of tokens(file)) counts.set(t, (counts.get(t) ?? 0) + 1)
        const dot = file.lastIndexOf('.')
        const cat = categoryOf(dot > 0 ? file.slice(dot + 1).toLowerCase() : '')
        categories.set(cat, (categories.get(cat) ?? 0) + 1)
      }
      const siblings = new Set([...counts].filter(([, n]) => n >= 2).map(([t]) => t))
      const folder: IndexedFolder = {
        segs,
        name,
        depth: rel.length,
        own: new Set(own),
        ancestors,
        acronyms: acronyms(tokens(name, true)),
        siblings,
        categories,
        fileCount: f.fileCount,
        // Proyectos de código, carpetas de programas y "Por revisar" existen, pero no son
        // destino por coincidencia. Tampoco nada que cuelgue de ellas.
        blocked: f.project || isReviewName(name) || strip(name) === strip(reviewName) || rel.some(isAppFolder),
      }
      byPath.set(segs.join('/').toLowerCase(), folder)
      if (!folder.blocked) folders.push(folder)
    }
  }
  const df = new Map<string, number>()
  const sibDf = new Map<string, number>()
  for (const f of folders) {
    for (const t of new Set([...f.own, ...f.acronyms])) df.set(t, (df.get(t) ?? 0) + 1)
    for (const t of f.siblings) sibDf.set(t, (sibDf.get(t) ?? 0) + 1)
  }
  return { folders, df, sibDf, byPath }
}

const weight = (idx: StructureIndex, t: string) => 1 + Math.log(Math.max(1, idx.folders.length) / (idx.df.get(t) ?? 1))

/** Coincidencia aproximada: misma raíz larga ("objeto"/"objetos", "captura"/"capturas"). */
function near(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 5 || b.length < 5) return false
  const n = Math.min(a.length, b.length, 7)
  return a.slice(0, n - 1) === b.slice(0, n - 1) && Math.abs(a.length - b.length) <= 2
}

interface Scored {
  folder: IndexedFolder
  score: number
  matched: string[]
  nameHits: number
  /** Alguna coincidencia es una palabra larga o sigla que solo tiene esta carpeta. */
  distinctive: boolean
}

function scoreFolder(idx: StructureIndex, fileTokens: string[], category: string, f: IndexedFolder): Scored | null {
  let score = 0
  let nameHits = 0
  let distinctive = false
  const matched: string[] = []
  const used = new Set<string>()
  for (const t of fileTokens) {
    const ownHit = [...f.own].find((o) => near(t, o))
    if (ownHit) {
      score += weight(idx, ownHit) * (ownHit === t ? 1 : 0.8)
      nameHits++
      if ((idx.df.get(ownHit) ?? 1) === 1 && ownHit.length >= 6) distinctive = true
      matched.push(t)
      used.add(t)
      continue
    }
    const acr = f.acronyms.has(t) ? t : acronymBase(t)
    if (acr && f.acronyms.has(acr)) {
      score += weight(idx, acr) * 0.9
      nameHits++
      if ((idx.df.get(acr) ?? 1) === 1) distinctive = true
      matched.push(t.toUpperCase())
      used.add(t)
      continue
    }
    // La sigla también cuenta si aparece en los archivos que ya tiene ("T1_POO_…").
    const base = acronymBase(t)
    if (base && f.siblings.has(base) && (idx.sibDf.get(base) ?? 1) <= 2) {
      score += 1.5
      used.add(t)
      matched.push(t.toUpperCase())
      nameHits++
      continue
    }
    if ([...f.ancestors].some((a) => near(t, a))) {
      score += 1
      used.add(t)
    }
  }
  // Palabras que se repiten en los archivos de la carpeta. Si se repiten en muchas
  // carpetas (tu nombre, "t1"…) apenas cuentan.
  let rareSiblingHits = 0
  for (const t of fileTokens) {
    if (used.has(t) || !f.siblings.has(t)) continue
    const rare = (idx.sibDf.get(t) ?? 1) <= 2
    score += rare ? 0.8 : 0.15
    if (rare) {
      rareSiblingHits++
      matched.push(t)
    }
  }
  if (nameHits === 0 && rareSiblingHits < 3) return null
  // Rama de otro tipo (un .csv dentro de Videos/…): solo con una coincidencia muy clara.
  const kind = kindOf(f.segs)
  if (kind && kind !== category && nameHits < 2) return null
  // Una carpeta llena de otro tipo de archivo: solo si el nombre coincide con claridad.
  if (f.fileCount >= 3) {
    const total = [...f.categories.values()].reduce((a, b) => a + b, 0)
    if (total && !f.categories.get(category)) {
      if (nameHits < 2) return null
      score *= 0.6
    }
  }
  return { folder: f, score, matched, nameHits, distinctive }
}

/** Tipo de archivo que sugiere la rama de una carpeta (Videos/… → videos). */
function kindOf(segs: string[]): string | null {
  const KINDS: [string, string][] = [
    ['videos', 'videos'],
    ['imagenes', 'images'],
    ['audio', 'audio'],
    ['programas', 'programs'],
  ]
  for (const s of segs) for (const [syn, cat] of KINDS) if (sameKind(syn, s)) return cat
  return null
}

const related = (a: string[], b: string[]) => {
  const n = Math.min(a.length, b.length)
  return a.slice(0, n).every((s, i) => s === b[i])
}

/** Mejor carpeta existente para un archivo, o null si ninguna encaja con claridad. */
export function matchFolder(idx: StructureIndex, file: FileEntry): { folder: IndexedFolder; matched: string[]; strong: boolean; alt?: IndexedFolder } | null {
  const ft = tokens(file.name)
  if (!ft.length || !idx.folders.length) return null
  const category = categoryOf(file.ext)
  const scored = idx.folders
    .map((f) => scoreFolder(idx, ft, category, f))
    .filter((s): s is Scored => !!s)
    .sort((a, b) => b.score - a.score || b.folder.depth - a.folder.depth)
  const best = scored[0]
  if (!best) return null
  // Aceptación: dos palabras del nombre, o una sola muy distintiva.
  // Una sola coincidencia basta si es distintiva (solo esta carpeta la tiene), sea cual sea
  // el tamaño del árbol; si no, tiene que pesar lo suficiente.
  const single =
    best.nameHits === 1 && best.matched.some((m) => m.length >= 6 || /^[A-Z]{3,}$/.test(m)) && (best.distinctive || best.score >= 3.2)
  const accepted = best.nameHits >= 2 || single || (best.nameHits === 0 && best.score >= 2.4)
  if (!accepted) return null
  const alt = scored.find((s) => s !== best && !related(s.folder.segs, best.folder.segs) && s.score >= best.score * 0.85)
  return { folder: best.folder, matched: best.matched, strong: best.nameHits >= 2 && !alt, alt: alt?.folder }
}

// Equivalencias para encajar las categorías de DeskFlow en carpetas existentes.
const SYNONYMS: Record<string, string[]> = {
  documentos: ['documentos', 'documents', 'docs', 'mis documentos'],
  imagenes: ['imagenes', 'images', 'pictures', 'fotos', 'mis imagenes'],
  fotografias: ['fotografias', 'fotos', 'photos', 'camara', 'album de la camara', 'album'],
  capturas: ['capturas', 'screenshots', 'capturas de pantalla'],
  disenos: ['disenos', 'designs', 'diseno'],
  videos: ['videos', 'mis videos'],
  grabaciones: ['grabaciones', 'recordings', 'grabaciones de pantalla'],
  tutoriales: ['tutoriales', 'tutorials', 'cursos'],
  audio: ['audio', 'audios', 'musica', 'music'],
  programas: ['programas', 'programs', 'apps', 'software'],
  instaladores: ['instaladores', 'installers', 'setups'],
  comprimidos: ['comprimidos', 'zips'],
  proyectos: ['proyectos', 'projects'],
  estudios: ['estudios', 'universidad', 'clases', 'studies', 'cursos'],
  finanzas: ['finanzas', 'cuentas', 'pagos'],
  facturas: ['facturas', 'recibos', 'recibos y facturas', 'boletas'],
  contratos: ['contratos'],
  personal: ['personal'],
}

/** La carpeta existente se llama como el segmento o empieza por un sinónimo ("Grabaciones de pantalla"). */
function sameKind(segment: string, folderName: string): boolean {
  const s = strip(segment)
  const n = strip(folderName)
  if (s === n) return true
  const syn = SYNONYMS[s]
  if (!syn) return false
  return syn.some((x) => n === x || n.startsWith(x + ' '))
}

// Subcarpetas por tipo de archivo que mucha gente ya tiene (Documentos/PDF, Documentos/Word…).
const TYPE_FOLDERS: [RegExp, string[]][] = [
  [/^(docx?|odt|rtf)$/, ['word', 'documentos word']],
  [/^pdf$/, ['pdf', 'pdfs']],
  [/^(pptx?|odp|key)$/, ['powerpoint', 'presentaciones', 'diapositivas', 'ppt']],
  [/^(xlsx?|ods)$/, ['excel', 'hojas de calculo', 'hojas de calculo y datos']],
  [/^(txt|md|csv|json|log)$/, ['texto', 'texto y datos', 'textos', 'notas']],
  [/^html?$/, ['html', 'web']],
]

function typeChild(all: IndexedFolder[], base: IndexedFolder, ext: string): IndexedFolder | undefined {
  const names = TYPE_FOLDERS.find(([re]) => re.test(ext))?.[1]
  if (!names) return undefined
  return all.find((f) => f.segs.length === base.segs.length + 1 && related(f.segs, base.segs) && names.includes(strip(f.name)))
}

/** Encaja una ruta de categoría (["Documentos","Estudios","Programación"]) en carpetas existentes. */
export function anchorDest(idx: StructureIndex, dest: string[], ext = ''): { dest: string[]; folder: IndexedFolder } | null {
  const all = [...idx.byPath.values()].filter((f) => !f.blocked)
  // Del segmento más específico al más general: primera carpeta existente que encaje.
  for (let i = dest.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(dest[i])) continue
    const candidates = all.filter((f) => sameKind(dest[i], f.name)).sort((a, b) => a.depth - b.depth)
    if (!candidates.length) continue
    let base = candidates[0]
    let rest = dest.slice(i + 1)
    // Seguir bajando por subcarpetas existentes equivalentes.
    while (rest.length) {
      const child = all.find((f) => f.segs.length === base.segs.length + 1 && related(f.segs, base.segs) && sameKind(rest[0], f.name))
      if (!child) break
      base = child
      rest = rest.slice(1)
    }
    // Al final de la ruta, si la carpeta se divide por tipo (PDF, Word…), se usa esa subcarpeta.
    if (!rest.length && ext) {
      const byType = typeChild(all, base, ext)
      if (byType) base = byType
    }
    return { dest: [...base.segs, ...rest], folder: base }
  }
  return null
}

/* ───────────── Cursos nuevos ───────────── */

// Marcas de trabajo académico que suelen ir DESPUÉS del nombre del curso:
// T1, T2 · secciones tipo T5FO/T4BO · PC1, EF, EP, EC · Semana, Unidad, Tema, Sesión.
const AFTER_MARK = /^(t\d{1,2}|[a-z]\d[a-z]{2,3}|pc\d{0,2}|e[fpcv]\d{0,2}|lab\d{0,2}|semana|unidad|tema|sesion|modulo|ciclo)$/
// Palabras que pueden ir ANTES del curso y no son parte de su nombre.
const BEFORE_MARK = /^(tarea|trabajo|examen|parcial|practica|apuntes|clase|silabo|consigna|rubrica|informe|exposicion|guia|separata|lectura|entregable|avance|proyecto|final|caso)$/
const SMALL = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'a', 'en', 'para', 'con', 'por', 'al'])
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/

function titleWord(w: string, first: boolean): string {
  const l = w.toLowerCase()
  if (ROMAN.test(l)) return l.toUpperCase()
  if (!first && SMALL.has(strip(l))) return l
  // Respeta mayúsculas internas si la palabra no venía toda en mayúsculas ("JavaScript").
  if (w !== w.toUpperCase()) return w[0].toUpperCase() + w.slice(1)
  return l[0].toUpperCase() + l.slice(1)
}

/**
 * Nombre del curso en un trabajo académico, o null.
 * "DESARROLLO-DE-APLICACIONES-WEB-I-T1-T5FO-TAIPE-MAMANI" → "Desarrollo de Aplicaciones Web I".
 * Solo cuando al nombre del curso le sigue una marca (T1, sección, Semana…): así no
 * se inventan cursos a partir de nombres cualquiera.
 */
export function courseName(fileName: string): string | null {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, '')
  const words = base.split(/[\s_\-.,()]+/).filter(Boolean)
  let i = 0
  // Código numérico del curso (5506) y palabras de tipo de trabajo al inicio.
  while (i < words.length && (/^\d+$/.test(words[i]) || BEFORE_MARK.test(strip(words[i])))) i++
  const start = i
  while (i < words.length && !AFTER_MARK.test(strip(words[i])) && !/^\d+$/.test(words[i])) i++
  if (i >= words.length || !AFTER_MARK.test(strip(words[i]))) return null
  const course = words.slice(start, i)
  const meaningful = course.filter((w) => {
    const s = strip(w)
    return s.length >= 4 && !SMALL.has(s) && !GENERIC.has(s) && !STOP.has(s)
  })
  if (meaningful.length < 2 && !(meaningful.length === 1 && course.some((w) => ROMAN.test(strip(w))))) return null
  if (course.length > 7) return null
  return course.map((w, k) => titleWord(w, k === 0)).join(' ')
}

/** Formato de nombre de tus cursos: "Cibertec - " si la mayoría de carpetas lo usan. */
function coursePrefix(children: IndexedFolder[]): string {
  const counts = new Map<string, number>()
  for (const c of children) {
    const m = c.name.match(/^(.{2,30}?)\s+[-–]\s+/)
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  const [best] = [...counts].sort((a, b) => b[1] - a[1])
  return best && best[1] >= 2 && best[1] >= children.length / 2 ? `${best[0]} - ` : ''
}

export function newCourseFolder(
  idx: StructureIndex,
  file: FileEntry,
): { dest: string[]; name: string; container: string; pattern: boolean } | null {
  if (categoryOf(file.ext) !== 'documents' && categoryOf(file.ext) !== 'archives') return null
  const course = courseName(file.name)
  if (!course) return null
  const all = [...idx.byPath.values()].filter((f) => !f.blocked)
  const studies = all.filter((f) => sameKind('estudios', f.name)).sort((a, b) => a.depth - b.depth)[0]
  const containerSegs = studies?.segs ?? ['Estudios']
  const children = studies ? all.filter((f) => f.segs.length === studies.segs.length + 1 && related(f.segs, studies.segs)) : []
  const prefix = coursePrefix(children)
  const name = `${prefix}${course}`
  // Si ya hay una carpeta con el mismo nombre de curso (aunque cambie el prefijo), se usa esa.
  const same = children.find((c) => strip(c.name).replace(/^.*?\s[-–]\s/, '') === strip(course))
  return {
    dest: [...containerSegs, same?.name ?? name],
    name: same?.name ?? name,
    container: studies?.name ?? 'Estudios',
    pattern: !!prefix,
  }
}

/** Aplica la estructura del usuario a una clasificación base. Las reglas no se tocan. */
export function adapt(idx: StructureIndex, file: FileEntry, base: Classification, maxDepth: number, reviewName: string): Classification {
  // Una regla decide el destino, pero si ya tienes una carpeta equivalente se usa la tuya
  // (Documentos/Finanzas/Facturas → tu Finanzas/Recibos y facturas).
  if (base.ruleId) {
    if (base.dest[0] === reviewName) return base
    const a = anchorDest(idx, base.dest, file.ext)
    if (!a || a.dest.join('/') === base.dest.join('/')) return base
    return { ...base, dest: a.dest, reason: `${base.reason} · en tu carpeta «${a.folder.name}»`, via: 'anchored' }
  }
  const m = matchFolder(idx, file)
  if (m) {
    const words = m.matched.slice(0, 3).join(', ')
    return {
      ...base,
      dest: m.folder.segs,
      confidence: m.strong ? 'high' : 'medium',
      reason: `Coincide con tu carpeta «${m.folder.name}» (${words})${m.alt ? ` · o «${m.alt.name}»` : ''}`,
      via: 'structure',
    }
  }
  // Trabajo de un curso que aún no tiene carpeta: se crea en tus Estudios, con tu formato.
  const course = newCourseFolder(idx, file)
  if (course) {
    return {
      ...base,
      dest: course.dest,
      confidence: 'medium',
      reason: `Curso nuevo «${course.name}» en tu carpeta «${course.container}»${course.pattern ? ` (como tus otros cursos)` : ''}`,
      via: 'course',
    }
  }
  // Lo que no se pudo clasificar sigue yendo a "Por revisar" tal cual.
  if (base.confidence === 'low' || base.dest[0] === reviewName) return base
  const a = anchorDest(idx, base.dest, file.ext)
  if (!a || a.dest.join('/') === base.dest.join('/')) return base
  // Lo que se añade bajo una carpeta existente respeta la profundidad máxima configurada.
  const dest = a.dest.slice(0, Math.max(a.folder.segs.length, maxDepth))
  return { ...base, dest, reason: `${base.reason} · en tu carpeta «${a.folder.name}»`, via: 'anchored' }
}
