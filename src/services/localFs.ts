/**
 * Sistema de archivos local simulado para el prototipo.
 *
 * Escenario simulado (muy común en Windows 11): la copia de seguridad de
 * OneDrive redirigió Documentos e Imágenes a C:\Users\Usuario\OneDrive\…,
 * y no queda ninguna carpeta Documentos local. Vídeos y Música son locales.
 *
 * En la Fase 2:
 * - el selector usará el diálogo nativo de Windows (`@tauri-apps/plugin-dialog`, `open({ directory: true })`);
 * - las bibliotecas saldrán de `SHGetKnownFolderPath`, que revela si están redirigidas a la nube;
 * - Rust confirmará la sincronización con los atributos de archivos en la nube de Windows;
 * - `exists` será parte del resultado del escaneo, no una llamada síncrona.
 */
import type { FsFolder, IndexedFolderRaw } from '@/types'
import { cloudProvider, isSystemPath, type Libraries } from '@/utils/destination'

const HOME = 'C:\\Users\\Usuario'

// Árbol de carpetas: ruta → nombres de subcarpetas.
const TREE: Record<string, string[]> = {
  'C:': ['Program Files', 'Users', 'Windows'],
  'C:\\Users': ['Usuario'],
  [HOME]: ['Desktop', 'Downloads', 'Dropbox', 'Music', 'OneDrive', 'Videos'],
  [`${HOME}\\Downloads`]: ['Imágenes', 'Nueva carpeta'],
  [`${HOME}\\Downloads\\Imágenes`]: ['Capturas'],
  [`${HOME}\\OneDrive`]: ['Documentos', 'Escritorio', 'Imágenes'],
  [`${HOME}\\OneDrive\\Documentos`]: ['Proyectos', 'Universidad'],
  [`${HOME}\\OneDrive\\Imágenes`]: ['Capturas de pantalla', 'Álbum de la cámara'],
  [`${HOME}\\Dropbox`]: ['Trabajo'],
  'D:': ['Archivo', 'Fotos', 'Juegos', 'Respaldo'],
  // Carpeta ya organizada por el usuario: sirve para probar "Usar mi estructura".
  'D:\\Archivo': ['Estudios', 'Finanzas', 'Imágenes', 'Programas', 'Videos'],
  'D:\\Archivo\\Estudios': [
    'Cibertec - Programacion Orientada a Objetos',
    'Cibertec - Contabilidad General',
    'Cibertec - Calculo II',
    'Cibertec - Marketing Digital',
  ],
  'D:\\Archivo\\Finanzas': ['Recibos y facturas', 'Presupuestos'],
  'D:\\Archivo\\Imágenes': ['Capturas de pantalla', 'Fotos del celular', 'Diseños'],
  'D:\\Archivo\\Programas': ['Instaladores'],
  'D:\\Archivo\\Videos': ['Grabaciones de pantalla', 'Cursos'],
}

/** Muestra de archivos que ya hay en algunas carpetas (para las coincidencias por contenido). */
const FILES: Record<string, string[]> = {
  'D:\\Archivo\\Estudios\\Cibertec - Programacion Orientada a Objetos': ['T1_POO_Clases_y_Objetos.docx', 'T2_POO_Encapsulamiento.docx', 'Silabo_POO.pdf'],
  'D:\\Archivo\\Estudios\\Cibertec - Contabilidad General': ['Balance_General_Semana3.xlsx', 'Apuntes_Contabilidad_U1.pdf'],
  'D:\\Archivo\\Finanzas\\Recibos y facturas': ['Factura_Luz_Agosto_2026.pdf', 'Recibo_Agua_Julio_2026.pdf', 'Factura_Internet_Julio_2026.pdf'],
  'D:\\Archivo\\Imágenes\\Capturas de pantalla': ['Captura de pantalla 2026-09-01 101010.png', 'Captura de pantalla 2026-09-02 111111.png'],
  'D:\\Archivo\\Videos\\Grabaciones de pantalla': ['Grabacion 2026-08-10.mp4', 'Grabacion 2026-08-15.mp4', 'Grabacion clase.mkv'],
}

const created = new Set<string>()

const DRIVE_LABEL: Record<string, string> = { 'C:': 'Disco local (C:)', 'D:': 'Datos (D:)' }

const toFolder = (path: string): FsFolder => {
  const isDrive = /^[a-z]:$/i.test(path)
  return {
    name: isDrive ? DRIVE_LABEL[path] ?? path : path.split('\\').pop()!,
    path,
    kind: isDrive ? 'drive' : 'folder',
    cloud: cloudProvider(path) ?? undefined,
    system: isSystemPath(path) || undefined,
  }
}

const LIBS: Libraries = {
  documents: `${HOME}\\OneDrive\\Documentos`,
  pictures: `${HOME}\\OneDrive\\Imágenes`,
  videos: `${HOME}\\Videos`,
  music: `${HOME}\\Music`,
}

export const localFs = {
  drives: (): FsFolder[] => ['C:', 'D:'].map(toFolder),

  quickAccess: (): { label: string; folder: FsFolder }[] => [
    { label: 'Escritorio', folder: toFolder(`${HOME}\\Desktop`) },
    { label: 'Documentos', folder: toFolder(LIBS.documents) },
    { label: 'Descargas', folder: toFolder(`${HOME}\\Downloads`) },
    { label: 'Imágenes', folder: toFolder(LIBS.pictures) },
    { label: 'Vídeos', folder: toFolder(LIBS.videos) },
    { label: 'Música', folder: toFolder(LIBS.music) },
  ],

  list: (path: string): FsFolder[] => {
    const base = TREE[path] ?? []
    const extra = [...created].filter((p) => p.slice(0, p.lastIndexOf('\\')) === path).map((p) => p.split('\\').pop()!)
    return [...new Set([...base, ...extra])].sort((a, b) => a.localeCompare(b, 'es')).map((n) => toFolder(`${path}\\${n}`))
  },

  exists: (path: string): boolean => {
    const p = path.replace(/\\+$/, '')
    if (created.has(p) || p in TREE) return true
    const parent = p.slice(0, p.lastIndexOf('\\'))
    return (TREE[parent] ?? []).includes(p.split('\\').pop()!) || [...created].some((c) => c.toLowerCase() === p.toLowerCase())
  },

  /** Crea una carpeta vacía (en el prototipo, solo en memoria). */
  mkdir: (parent: string, name: string): FsFolder => {
    const path = `${parent}\\${name}`
    created.add(path)
    return toFolder(path)
  },

  /** Bibliotecas de Windows tal como las reporta el sistema (pueden estar en la nube). */
  libraries: (): Libraries => ({ ...LIBS }),

  /** Estructura de carpetas bajo `root`, como la devuelve el motor nativo. */
  index: (root: string, maxDepth: number, skip: string[]): IndexedFolderRaw[] => {
    const out: IndexedFolderRaw[] = []
    const skipSet = new Set(skip.map((s) => s.toLowerCase()))
    const walk = (dir: string, depth: number) => {
      if (depth > maxDepth) return
      for (const child of localFs.list(dir)) {
        if (child.system || skipSet.has(child.path.toLowerCase())) continue
        const files = FILES[child.path] ?? []
        out.push({ rel: child.path.slice(root.length + 1).replace(/\\/g, '/'), files, fileCount: files.length, project: false })
        walk(child.path, depth + 1)
      }
    }
    walk(root.replace(/\\+$/, ''), 1)
    return out
  },

  /**
   * Busca una carpeta Documentos que NO esté sincronizada con la nube.
   * Orden: la biblioteca Documentos (si es local), las carpetas Documents/Documentos
   * del perfil y de otras unidades. Si no hay ninguna, crea C:\Users\…\Documentos.
   */
  findOrCreateLocalDocuments: (): { path: string; created: boolean } => {
    const candidates = [LIBS.documents, `${HOME}\\Documents`, `${HOME}\\Documentos`, 'D:\\Documentos', 'D:\\Documents']
    const found = candidates.find((p) => !cloudProvider(p) && localFs.exists(p))
    if (found) return { path: found, created: false }
    return { path: localFs.mkdir(HOME, 'Documentos').path, created: true }
  },
}

export const LIBRARY_LABEL: Record<keyof Libraries, string> = {
  documents: 'Documentos',
  pictures: 'Imágenes',
  videos: 'Vídeos',
  music: 'Música',
}

/** Bibliotecas sincronizadas con la nube (vacío = todas locales). */
export function cloudLibraries(): { label: string; provider: string }[] {
  const libs = localFs.libraries()
  return (Object.keys(libs) as (keyof Libraries)[])
    .map((k) => ({ label: LIBRARY_LABEL[k], provider: cloudProvider(libs[k]) }))
    .filter((x): x is { label: string; provider: string } => !!x.provider)
}
