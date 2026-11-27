/**
 * Destino de la organización: resolución de rutas y reglas de seguridad.
 * Todo es local. Una carpeta sincronizada con la nube nunca es un destino válido.
 */
import type { Destination } from '@/types'

const CLOUD: [RegExp, string][] = [
  [/^onedrive( - .*)?$/i, 'OneDrive'],
  [/^(google drive|my drive|mi unidad|googledrive)$/i, 'Google Drive'],
  [/^dropbox( \(.*\))?$/i, 'Dropbox'],
  [/^icloud ?drive$/i, 'iCloud'],
  [/^box$/i, 'Box'],
  [/^mega$/i, 'MEGA'],
]

/**
 * Proveedor de nube si algún segmento de la ruta es una carpeta sincronizada.
 * En la Fase 2 se complementa en Rust con los atributos de Windows
 * (FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS / Cloud Files API), que detectan
 * también sincronizaciones con nombres no estándar.
 */
export function cloudProvider(path: string): string | null {
  for (const seg of path.split(/[\\/]/)) {
    for (const [re, name] of CLOUD) if (re.test(seg.trim())) return name
  }
  return null
}

const SYSTEM = [/^[a-z]:\\windows(\\|$)/i, /^[a-z]:\\program files( \(x86\))?(\\|$)/i, /^[a-z]:\\programdata(\\|$)/i, /\\appdata(\\|$)/i]
export const isSystemPath = (path: string) => SYSTEM.some((re) => re.test(path))

/**
 * Motivo por el que una ruta nunca puede ser destino, o null.
 * La nube no está aquí: no se bloquea, pero exige confirmación explícita.
 */
export function destinationProblem(path: string): string | null {
  if (isSystemPath(path)) return 'Carpeta del sistema protegida.'
  if (/^[a-z]:\\?$/i.test(path)) return 'Elige una carpeta, no la raíz de la unidad.'
  return null
}

export const winJoin = (...parts: string[]) =>
  parts
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, '') : p.replace(/^[\\/]+|[\\/]+$/g, '').replace(/\//g, '\\')))
    .join('\\')

export const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

export interface Libraries {
  documents: string
  pictures: string
  videos: string
  music: string
}

/** Carpeta de primer nivel → biblioteca de Windows. Lo demás se queda en el origen (suele ser temporal). */
const LIBRARY_OF: Record<string, keyof Libraries> = {
  Documentos: 'documents',
  Proyectos: 'documents',
  Imágenes: 'pictures',
  Videos: 'videos',
  Audio: 'music',
}

/** Carpetas de primer nivel que en modo bibliotecas se fusionan con la biblioteca. */
const MERGES_INTO_LIBRARY = new Set(['Documentos', 'Imágenes', 'Videos', 'Audio'])

/**
 * Raíces cuya estructura se aprende para "Usar mi estructura", con el prefijo
 * lógico que tienen en el árbol de Carpetea.
 */
export function structureRoots(dest: Destination, sourcePath: string, libs: Libraries): { root: string; prefix: string[] }[] {
  if (dest.mode === 'custom' && dest.customPath) return [{ root: dest.customPath, prefix: [] }]
  if (dest.mode === 'libraries') {
    return [
      { root: libs.documents, prefix: ['Documentos'] },
      { root: libs.pictures, prefix: ['Imágenes'] },
      { root: libs.videos, prefix: ['Videos'] },
      { root: libs.music, prefix: ['Audio'] },
    ].filter((r) => r.root)
  }
  return sourcePath ? [{ root: sourcePath, prefix: [] }] : []
}

export interface Resolver {
  /** Ruta absoluta de una carpeta lógica del árbol (segmentos relativos). */
  dir: (segs: string[]) => string
  /** Para modo bibliotecas: dónde termina cada carpeta de primer nivel. */
  hint: (top: string) => string | undefined
  label: string
}

export function makeResolver(
  dest: Destination,
  sourcePath: string,
  libs: Libraries,
  libLabels: Record<keyof Libraries, string>,
  sourceLabel = baseName(sourcePath),
): Resolver {
  if (dest.mode === 'custom' && dest.customPath) {
    return { dir: (segs) => winJoin(dest.customPath, ...segs), hint: () => undefined, label: dest.customPath }
  }
  if (dest.mode === 'libraries') {
    const where = (top: string) => LIBRARY_OF[top]
    return {
      dir: (segs) => {
        const lib = where(segs[0])
        if (!lib) return winJoin(sourcePath, ...segs)
        return MERGES_INTO_LIBRARY.has(segs[0]) ? winJoin(libs[lib], ...segs.slice(1)) : winJoin(libs[lib], ...segs)
      },
      hint: (top) => {
        const lib = where(top)
        return `en ${lib ? libLabels[lib] : sourceLabel}`
      },
      label: 'Bibliotecas de Windows',
    }
  }
  return { dir: (segs) => winJoin(sourcePath, ...segs), hint: () => undefined, label: sourcePath }
}
