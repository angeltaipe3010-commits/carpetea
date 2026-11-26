/**
 * Clasificador de referencia (TypeScript).
 *
 * Implementa los niveles 1–3 del blueprint (extensión, metadatos/nombre y
 * reglas) y el sistema de confianza. Es la especificación ejecutable del
 * motor que se portará a Rust en la Fase 4: mismas entradas, mismas salidas.
 * El nivel 4–5 (contenido y agrupación semántica) queda pendiente.
 */
import type { Category, Classification, Confidence, FileEntry, Rule, ScanOptions } from '@/types'
import { ruleMatches } from '@/utils/rules'

const EXT: Record<string, Category> = {}
const reg = (cat: Category, exts: string) => exts.split(' ').forEach((e) => (EXT[e] = cat))
reg('documents', 'pdf doc docx odt rtf txt md xls xlsx csv ods ppt pptx odp epub')
reg('images', 'jpg jpeg png gif webp heic bmp tiff svg psd fig ai raw')
reg('videos', 'mp4 mov mkv avi webm wmv m4v')
reg('audio', 'mp3 wav flac m4a ogg aac')
reg('archives', 'zip rar 7z tar gz')
reg('programs', 'exe msi appx msix')
reg('code', 'js ts tsx jsx py json html css java cs rs go sql')

export const CATEGORY_ROOT: Record<Category, string> = {
  documents: 'Documentos',
  images: 'Imágenes',
  videos: 'Videos',
  audio: 'Audio',
  archives: 'Comprimidos',
  programs: 'Programas',
  code: 'Código',
  other: 'Otros',
}

export const CATEGORY_LABEL: Record<Category, string> = {
  documents: 'Documento',
  images: 'Imagen',
  videos: 'Video',
  audio: 'Audio',
  archives: 'Comprimido',
  programs: 'Programa',
  code: 'Código',
  other: 'Otro',
}

export const categoryOf = (ext: string): Category => EXT[ext] ?? 'other'

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_\-.()]+/g, ' ')

const has = (name: string, ...words: string[]) => words.some((w) => name.includes(w))

const SUBJECTS: [string[], string][] = [
  [['programacion', 'java', 'python', 'poo', 'react', 'javascript', 'algoritmo'], 'Programación'],
  [['administracion', 'contabilidad', 'finanzas', 'marketing', 'economia'], 'Administración'],
  [['calculo', 'matematica', 'algebra', 'estadistica', 'fisica'], 'Ciencias'],
]

const TECH: [string[], string][] = [
  [['react', 'next', 'vite'], 'React'],
  [['express', 'node', 'api', 'backend'], 'Node.js'],
  [['python', 'django', 'flask'], 'Python'],
  [['tailwind', 'landing', 'html'], 'Web'],
]

/** Año del nombre (más fiable) o, si no aparece, de la fecha de modificación. */
function yearOf(f: FileEntry, n: string): string {
  return n.match(/\b(20[12]\d)/)?.[1] ?? f.modified.slice(0, 4)
}

interface Guess {
  dest: string[]
  confidence: Confidence
  reason: string
}

/** Niveles 1 y 2: extensión + nombre y metadatos. */
function guess(f: FileEntry, cat: Category, opts: ScanOptions): Guess {
  const n = norm(f.name)
  const year = yearOf(f, n)
  const withYear = (dest: string[]) => (opts.yearSubfolders && year ? [...dest, year] : dest)

  switch (cat) {
    case 'documents': {
      if (has(n, 'factura', 'boleta', 'recibo')) {
        const servicio = has(n, 'electricidad', 'luz', 'agua', 'internet', 'gas', 'telefono')
        return {
          dest: withYear(['Documentos', 'Finanzas', servicio ? 'Servicios' : 'Compras']),
          confidence: 'high',
          reason: servicio ? 'Nombre indica factura de servicio' : 'Nombre indica comprobante de compra',
        }
      }
      if (has(n, 'presupuesto', 'gastos', 'ingresos'))
        return { dest: ['Documentos', 'Finanzas', 'Presupuestos'], confidence: 'high', reason: 'Nombre indica documento financiero' }
      if (has(n, 'contrato', 'acuerdo', 'convenio'))
        return { dest: ['Documentos', 'Contratos'], confidence: 'high', reason: 'Nombre indica contrato' }
      if (has(n, 'cv ', 'curriculum') || n.startsWith('cv'))
        return { dest: ['Documentos', 'Personal'], confidence: 'high', reason: 'Nombre indica currículum' }
      if (has(n, 'apuntes', 'tarea', 'examen', 'practica', 'clase', 'silabo', 'trabajo final', 'semana', 'curso')) {
        const subject = SUBJECTS.find(([kw]) => has(n, ...kw))?.[1]
        return {
          dest: withYear(['Documentos', 'Estudios', ...(subject ? [subject] : [])]),
          confidence: subject ? 'high' : 'medium',
          reason: subject ? `Material de estudio · ${subject}` : 'Material de estudio sin asignatura clara',
        }
      }
      if (has(n, 'scan'))
        return { dest: ['Documentos', 'Escaneos'], confidence: 'medium', reason: 'Nombre genérico de escáner' }
      return { dest: ['Documentos'], confidence: 'medium', reason: 'Solo se reconoce el tipo de archivo' }
    }
    case 'images': {
      if (has(n, 'screenshot', 'captura'))
        return { dest: ['Imágenes', 'Capturas'], confidence: 'high', reason: 'Patrón de captura de pantalla' }
      if (/^(img|pxl|dsc|dcim)\s?\d{8}/.test(n))
        return { dest: withYear(['Imágenes', 'Fotografías']), confidence: 'high', reason: 'Patrón de nombre de cámara' }
      if (['psd', 'fig', 'ai', 'svg'].includes(f.ext) || has(n, 'logo', 'mockup', 'banner', 'icono'))
        return { dest: ['Imágenes', 'Diseños'], confidence: 'high', reason: 'Archivo o nombre de diseño' }
      return { dest: ['Imágenes'], confidence: 'medium', reason: 'Solo se reconoce el tipo de archivo' }
    }
    case 'videos': {
      if (has(n, 'tutorial', 'curso', 'clase'))
        return { dest: ['Videos', 'Tutoriales'], confidence: 'high', reason: 'Nombre indica contenido formativo' }
      if (has(n, 'grabacion', 'obs', 'recording', 'reunion', 'zoom'))
        return { dest: ['Videos', 'Grabaciones'], confidence: 'high', reason: 'Patrón de grabación de pantalla o reunión' }
      return { dest: ['Videos'], confidence: 'medium', reason: 'Solo se reconoce el tipo de archivo' }
    }
    case 'audio': {
      if (has(n, 'podcast', 'episodio'))
        return { dest: ['Audio', 'Podcasts'], confidence: 'high', reason: 'Nombre indica podcast' }
      if (has(n, 'nota de voz', 'voz', 'audio'))
        return { dest: ['Audio', 'Notas de voz'], confidence: 'medium', reason: 'Nombre indica nota de voz' }
      return { dest: ['Audio'], confidence: 'medium', reason: 'Solo se reconoce el tipo de archivo' }
    }
    case 'programs': {
      if (has(n, 'portable'))
        return { dest: ['Programas', 'Portables'], confidence: 'high', reason: 'Nombre indica versión portable' }
      return {
        dest: ['Programas', 'Instaladores'],
        confidence: has(n, 'setup', 'install') || f.ext === 'msi' ? 'high' : 'medium',
        reason: 'Ejecutable de instalación',
      }
    }
    case 'archives': {
      const tech = TECH.find(([kw]) => has(n, ...kw))?.[1]
      if (tech || has(n, 'proyecto', 'project', 'main', 'src'))
        return {
          dest: ['Proyectos', 'Desarrollo', ...(tech ? [tech] : [])],
          confidence: tech ? 'high' : 'medium',
          reason: tech ? `Proyecto de código · ${tech}` : 'Parece un proyecto de código',
        }
      if (has(n, 'curso', 'clase'))
        return { dest: ['Documentos', 'Estudios'], confidence: 'medium', reason: 'Comprimido de material de estudio' }
      return { dest: ['Comprimidos'], confidence: 'medium', reason: 'Contenido del comprimido sin analizar' }
    }
    case 'code':
      return { dest: ['Proyectos', 'Fragmentos'], confidence: 'medium', reason: 'Archivo de código suelto' }
    default:
      return { dest: [opts.reviewFolderName], confidence: 'low', reason: f.ext ? `Extensión .${f.ext} desconocida` : 'Archivo sin extensión' }
  }
}

/** Recorta la ruta a la profundidad máxima configurada. */
const clampDepth = (dest: string[], max: number) => dest.slice(0, Math.max(1, max))

export function classify(f: FileEntry, rules: Rule[], opts: ScanOptions): Classification {
  const category = categoryOf(f.ext)

  // Nivel 3: reglas personalizadas, en orden de prioridad.
  if (opts.applyRules) {
    for (const rule of rules) {
      if (!rule.enabled || !ruleMatches(rule, f, category)) continue
      const dest = rule.action === 'review' ? [opts.reviewFolderName] : rule.destination.split('/').filter(Boolean)
      return {
        fileId: f.id,
        category,
        dest: clampDepth(dest, opts.maxDepth),
        confidence: rule.action === 'review' ? 'low' : 'high',
        reason: `Regla: ${rule.name}`,
        ruleId: rule.id,
      }
    }
  }

  const g = guess(f, category, opts)
  // Baja confianza nunca inventa categorías: va a "Por revisar".
  const dest = g.confidence === 'low' ? [opts.reviewFolderName] : g.dest
  return { fileId: f.id, category, dest: clampDepth(dest, opts.maxDepth), confidence: g.confidence, reason: g.reason }
}
