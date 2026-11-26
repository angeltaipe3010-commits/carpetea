/**
 * Datos simulados del prototipo (Fase 1).
 * Nada de esto toca el disco: en la Fase 2 el escáner de Rust devuelve
 * estas mismas estructuras a partir de carpetas reales.
 */
import type { DuplicateGroup, FileEntry, Operation, Rule, SourceFolder } from '@/types'

// Generador determinista para que el prototipo sea estable entre recargas.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const pad = (n: number, l = 2) => String(n).padStart(l, '0')

type Seed = [name: string, sizeKb: number, modified: string, relDir?: string, locked?: boolean]

const DOWNLOADS_SEED: Seed[] = [
  ['Factura_Electricidad_Noviembre_2026.pdf', 182, '2026-11-21'],
  ['Factura_Electricidad_Octubre_2026.pdf', 176, '2026-10-19'],
  ['Factura_Internet_Octubre_2026.pdf', 140, '2026-10-12'],
  ['Factura_Agua_Septiembre_2026.pdf', 121, '2026-09-15'],
  ['Boleta_Compra_Laptop_2026.pdf', 96, '2026-08-02'],
  ['Boleta_Supermercado_2026-11.pdf', 64, '2026-11-09'],
  ['Recibo_Pension_Universidad_2026.pdf', 88, '2026-11-03'],
  ['Contrato_Alquiler_Departamento.pdf', 1240, '2026-03-01'],
  ['Contrato_Practicas_Profesionales.docx', 312, '2026-06-18'],
  ['CV_Desarrollador_2026.pdf', 220, '2026-10-30'],
  ['Presupuesto_Mensual_2026.xlsx', 48, '2026-11-01'],
  ['Apuntes_Programacion_Semana_12.pdf', 2380, '2026-11-14'],
  ['Apuntes_Programacion_Semana_13.pdf', 2104, '2026-11-20'],
  ['Tarea_POO_Herencia_Polimorfismo.docx', 410, '2026-10-27'],
  ['Practica_Java_Colecciones.pdf', 870, '2026-10-05'],
  ['Examen_Parcial_Calculo_II.pdf', 1530, '2026-09-29'],
  ['Clase_Administracion_Finanzas.pptx', 6420, '2026-10-08'],
  ['Silabo_Contabilidad_General_2026.pdf', 512, '2026-03-10'],
  ['Trabajo_Final_Marketing_Digital.docx', 1820, '2026-07-04'],
  ['Notas.txt', 2, '2026-11-22'],
  ['documento.pdf', 340, '2026-05-17'],
  ['scan0001.pdf', 3120, '2026-04-02'],
  ['scan0002.pdf', 2980, '2026-04-02'],
  ['logo_deskflow_v3.svg', 18, '2026-11-18'],
  ['mockup_dashboard_saas.fig', 9300, '2026-11-11'],
  ['banner_redes_sociales.psd', 48200, '2026-09-21'],
  ['icono_app_1024.png', 410, '2026-11-18'],
  ['Grabacion_reunion_equipo.mp4', 412000, '2026-11-12'],
  ['OBS_2026-11-02 21-10-44.mkv', 1250000, '2026-11-02'],
  ['Tutorial_Tauri_Rust_Parte1.mp4', 286000, '2026-10-24'],
  ['Curso_React_Avanzado_Clase3.mp4', 534000, '2026-09-30'],
  ['VSCodeUserSetup-x64-1.106.0.exe', 98400, '2026-11-06'],
  ['node-v26.13.1-x64.msi', 31200, '2026-11-20'],
  ['DiscordSetup.exe', 112000, '2026-07-12', '', true],
  ['GitHubDesktopSetup-x64.exe', 141000, '2026-08-19'],
  ['Rufus_portable_4.6.exe', 1500, '2026-05-02'],
  ['React_Proyecto_Final.zip', 18400, '2026-11-19'],
  ['proyecto-tienda-react-main.zip', 9200, '2026-10-02'],
  ['backend_api_express.zip', 4300, '2026-09-11'],
  ['plantilla_landing_tailwind.zip', 2100, '2026-08-27'],
  ['fondos_pantalla_pack.rar', 86000, '2026-06-14'],
  ['podcast_episodio_14.mp3', 48200, '2026-10-15'],
  ['nota_de_voz_clase.m4a', 6100, '2026-11-13'],
  ['config.json', 3, '2026-11-01'],
  ['script_backup.py', 6, '2026-10-21'],
  ['archivo (3).bin', 2048, '2026-02-11'],
  ['nuevo.dat', 120, '2026-01-30'],
  ['descarga', 840, '2026-07-07'],
  ['temp_8823.tmp', 4, '2026-11-24'],
  ['documento.pdf', 290, '2026-02-08', 'Nueva carpeta'],
  ['Captura de pantalla 2026-11-18 223010.png', 640, '2026-11-18'],
]

function buildDownloads(): FileEntry[] {
  const r = rng(42)
  const files: FileEntry[] = DOWNLOADS_SEED.map(([name, kb, modified, relDir = '', locked], i) => {
    const dot = name.lastIndexOf('.')
    return {
      id: `dl_${i}`,
      name,
      ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : '',
      size: kb * 1024,
      modified: `${modified}T10:00:00`,
      relDir,
      locked,
    }
  })
  // Fotos de cámara y móvil repartidas en 2025 y 2026.
  for (let i = 0; i < 46; i++) {
    const year = i < 18 ? 2025 : 2026
    const month = 1 + Math.floor(r() * 11)
    const day = 1 + Math.floor(r() * 27)
    const stamp = `${year}${pad(month)}${pad(day)}_${pad(Math.floor(r() * 24))}${pad(Math.floor(r() * 60))}${pad(Math.floor(r() * 60))}`
    const name = i % 3 === 0 ? `PXL_${stamp}.jpg` : `IMG_${stamp}.jpg`
    files.push({
      id: `dl_img_${i}`,
      name,
      ext: 'jpg',
      size: Math.round(2400 + r() * 4200) * 1024,
      modified: `${year}-${pad(month)}-${pad(day)}T12:00:00`,
      relDir: '',
    })
  }
  // Capturas de pantalla.
  for (let i = 0; i < 17; i++) {
    const day = 1 + Math.floor(r() * 24)
    const name = i % 2 === 0
      ? `Screenshot 2026-11-${pad(day)} ${pad(8 + Math.floor(r() * 14))}${pad(Math.floor(r() * 60))}${pad(Math.floor(r() * 60))}.png`
      : `Captura de pantalla 2026-10-${pad(day)} ${pad(8 + Math.floor(r() * 14))}${pad(Math.floor(r() * 60))}${pad(Math.floor(r() * 60))}.png`
    files.push({
      id: `dl_cap_${i}`,
      name,
      ext: 'png',
      size: Math.round(180 + r() * 900) * 1024,
      modified: `2026-${name.includes('-11-') ? '11' : '10'}-${pad(day)}T15:00:00`,
      relDir: '',
    })
  }
  return files
}

const DESKTOP_SEED: Seed[] = [
  ['Proyecto_DeskFlow_ideas.docx', 64, '2026-11-24'],
  ['Factura_Hosting_2026.pdf', 72, '2026-11-01'],
  ['Captura de pantalla 2026-11-23 101522.png', 520, '2026-11-23'],
  ['Screenshot 2026-11-22 190144.png', 610, '2026-11-22'],
  ['IMG_20261120_174410.jpg', 3900, '2026-11-20'],
  ['lista_compras.txt', 1, '2026-11-24'],
  ['Tutorial_Git_Ramas.mp4', 184000, '2026-11-10'],
  ['ChromeSetup.exe', 1400, '2026-11-02'],
  ['curso_python_basico.zip', 12000, '2026-10-12'],
  ['sin título.txt', 1, '2026-11-15'],
]

function fromSeed(prefix: string, seed: Seed[]): FileEntry[] {
  return seed.map(([name, kb, modified, relDir = '', locked], i) => {
    const dot = name.lastIndexOf('.')
    return {
      id: `${prefix}_${i}`,
      name,
      ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : '',
      size: kb * 1024,
      modified: `${modified}T10:00:00`,
      relDir,
      locked,
    }
  })
}

export const MOCK_FILES: Record<string, FileEntry[]> = {
  downloads: buildDownloads(),
  desktop: fromSeed('dk', DESKTOP_SEED),
}

const total = (id: string) => MOCK_FILES[id].reduce((s, f) => s + f.size, 0)

export const SOURCE_FOLDERS: SourceFolder[] = [
  {
    id: 'downloads',
    name: 'Descargas',
    path: 'C:\\Users\\Usuario\\Downloads',
    fileCount: MOCK_FILES.downloads.length,
    size: total('downloads'),
  },
  {
    id: 'desktop',
    name: 'Escritorio',
    path: 'C:\\Users\\Usuario\\Desktop',
    fileCount: MOCK_FILES.desktop.length,
    size: total('desktop'),
  },
]

/** Rutas destino que "ya existen" en disco y provocan conflictos de nombre. */
export const EXISTING_AT_DEST: Record<string, string[]> = {
  downloads: ['Imágenes/Capturas/Captura de pantalla 2026-11-18 223010.png'],
  desktop: [],
}

export const DEFAULT_RULES: Rule[] = [
  {
    id: 'rule_facturas',
    name: 'Facturas en PDF',
    enabled: true,
    conditions: [
      { id: 'c1', field: 'extension', operator: 'is', value: 'pdf' },
      { id: 'c2', field: 'name', operator: 'contains', value: 'factura' },
    ],
    action: 'move',
    destination: 'Documentos/Finanzas/Facturas',
  },
  {
    id: 'rule_instaladores',
    name: 'Instaladores a Programas',
    enabled: true,
    conditions: [{ id: 'c3', field: 'extension', operator: 'is', value: 'exe, msi' }],
    action: 'move',
    destination: 'Programas/Instaladores',
  },
  {
    id: 'rule_grandes',
    name: 'Archivos de más de 500 MB',
    enabled: true,
    conditions: [{ id: 'c4', field: 'size', operator: 'gt', value: '500' }],
    action: 'review',
    destination: 'Por revisar',
  },
  {
    id: 'rule_capturas',
    name: 'Capturas de pantalla',
    enabled: false,
    conditions: [{ id: 'c5', field: 'name', operator: 'contains', value: 'captura, screenshot' }],
    action: 'move',
    destination: 'Imágenes/Capturas',
  },
]

const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86400000 - h * 3600000).toISOString()

export const SAMPLE_HISTORY: Operation[] = [
  {
    id: 'op_sample_1',
    kind: 'organize',
    createdAt: daysAgo(2, 3),
    source: 'C:\\Users\\Usuario\\Documents',
    status: 'partial',
    sample: true,
    foldersCreated: ['Estudios', 'Estudios/Programación', 'Finanzas', 'Finanzas/Facturas'],
    errors: ['Informe_final.docx: archivo en uso por otro proceso'],
    moves: [
      { fileId: 's1', name: 'Apuntes_Java_Semana_4.pdf', from: 'Apuntes_Java_Semana_4.pdf', to: 'Estudios/Programación/Apuntes_Java_Semana_4.pdf', status: 'moved' },
      { fileId: 's2', name: 'Factura_Luz_Agosto.pdf', from: 'Factura_Luz_Agosto.pdf', to: 'Finanzas/Facturas/Factura_Luz_Agosto.pdf', status: 'moved' },
      { fileId: 's3', name: 'Informe_final.docx', from: 'Informe_final.docx', to: 'Estudios/Informe_final.docx', status: 'failed', note: 'Archivo en uso por otro proceso' },
    ],
  },
  {
    id: 'op_sample_2',
    kind: 'organize',
    createdAt: daysAgo(6, 5),
    source: 'C:\\Users\\Usuario\\Desktop',
    status: 'completed',
    sample: true,
    foldersCreated: ['Imágenes', 'Imágenes/Capturas'],
    errors: [],
    moves: [
      { fileId: 's4', name: 'Screenshot 2026-11-12 101010.png', from: 'Screenshot 2026-11-12 101010.png', to: 'Imágenes/Capturas/Screenshot 2026-11-12 101010.png', status: 'moved' },
      { fileId: 's5', name: 'Captura de pantalla 2026-11-13 090011.png', from: 'Captura de pantalla 2026-11-13 090011.png', to: 'Imágenes/Capturas/Captura de pantalla 2026-11-13 090011.png', status: 'moved' },
    ],
  },
  {
    id: 'op_sample_3',
    kind: 'organize',
    createdAt: daysAgo(12, 1),
    source: 'C:\\Users\\Usuario\\Downloads',
    status: 'rolled_back',
    sample: true,
    undoneAt: daysAgo(12),
    foldersCreated: ['Videos'],
    errors: [],
    moves: [
      { fileId: 's6', name: 'clip_final.mp4', from: 'clip_final.mp4', to: 'Videos/clip_final.mp4', status: 'restored' },
    ],
  },
]

export const DUPLICATE_GROUPS: DuplicateGroup[] = [
  {
    id: 'dup_1',
    hash: 'b3f9…a41c',
    size: 182 * 1024,
    files: [
      { id: 'd1a', name: 'Factura_Electricidad_Noviembre_2026.pdf', path: 'C:\\Users\\Usuario\\Downloads', size: 182 * 1024, modified: '2026-11-21T10:00:00' },
      { id: 'd1b', name: 'Factura_Electricidad_Noviembre_2026 (1).pdf', path: 'C:\\Users\\Usuario\\Downloads', size: 182 * 1024, modified: '2026-11-21T10:04:00' },
      { id: 'd1c', name: 'factura_luz_nov.pdf', path: 'C:\\Users\\Usuario\\Documents\\Finanzas', size: 182 * 1024, modified: '2026-11-22T09:12:00' },
    ],
  },
  {
    id: 'dup_2',
    hash: '09cd…77e2',
    size: 1250000 * 1024,
    files: [
      { id: 'd2a', name: 'OBS_2026-11-02 21-10-44.mkv', path: 'C:\\Users\\Usuario\\Downloads', size: 1250000 * 1024, modified: '2026-11-02T21:40:00' },
      { id: 'd2b', name: 'grabacion_clase_02-11.mkv', path: 'C:\\Users\\Usuario\\Videos', size: 1250000 * 1024, modified: '2026-11-03T08:10:00' },
    ],
  },
  {
    id: 'dup_3',
    hash: '5e21…f0b8',
    size: 220 * 1024,
    files: [
      { id: 'd3a', name: 'CV_Desarrollador_2026.pdf', path: 'C:\\Users\\Usuario\\Downloads', size: 220 * 1024, modified: '2026-10-30T10:00:00' },
      { id: 'd3b', name: 'CV_Desarrollador_2026.pdf', path: 'C:\\Users\\Usuario\\Desktop', size: 220 * 1024, modified: '2026-10-30T10:02:00' },
      { id: 'd3c', name: 'CV final final.pdf', path: 'C:\\Users\\Usuario\\Documents\\Personal', size: 220 * 1024, modified: '2026-10-31T18:20:00' },
      { id: 'd3d', name: 'CV_Desarrollador_2026 - copia.pdf', path: 'C:\\Users\\Usuario\\Documents', size: 220 * 1024, modified: '2026-11-01T11:00:00' },
    ],
  },
  {
    id: 'dup_4',
    hash: 'a7a0…1d93',
    size: 98400 * 1024,
    files: [
      { id: 'd4a', name: 'VSCodeUserSetup-x64-1.106.0.exe', path: 'C:\\Users\\Usuario\\Downloads', size: 98400 * 1024, modified: '2026-11-06T16:00:00' },
      { id: 'd4b', name: 'VSCodeUserSetup-x64-1.106.0 (1).exe', path: 'C:\\Users\\Usuario\\Downloads', size: 98400 * 1024, modified: '2026-11-06T16:02:00' },
    ],
  },
  {
    id: 'dup_5',
    hash: 'e410…c6aa',
    size: 3900 * 1024,
    files: [
      { id: 'd5a', name: 'IMG_20261120_174410.jpg', path: 'C:\\Users\\Usuario\\Desktop', size: 3900 * 1024, modified: '2026-11-20T17:44:10' },
      { id: 'd5b', name: 'IMG_20261120_174410.jpg', path: 'C:\\Users\\Usuario\\Pictures\\Móvil', size: 3900 * 1024, modified: '2026-11-20T17:50:00' },
    ],
  },
]
