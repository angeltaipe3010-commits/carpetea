/**
 * Carpeta de pruebas aislada: un "Origen" con descargas falsas y un "Destino"
 * con una estructura ya organizada, como la de un usuario real. Nunca se toca
 * ninguna carpeta del usuario.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface Sandbox {
  root: string
  origen: string
  destino: string
  data: string
  webview: string
  path: (...parts: string[]) => string
  read: (...parts: string[]) => string
  exists: (...parts: string[]) => boolean
  list: (...parts: string[]) => string[]
  cleanup: () => void
}

const ORIGEN: Record<string, string> = {
  'POOII_T1_PerezQuispe.docx': 'trabajo poo',
  'DESARROLLO-DE-APLICACIONES-WEB-I-T1-T5FO-PEREZ-QUISPE.docx': 'daw t1',
  'DESARROLLO-DE-APLICACIONES-WEB-I-T2-T5FO-PEREZ-QUISPE.pdf': 'daw t2',
  'Factura_Luz_Noviembre_2026.pdf': 'factura luz',
  'Captura de pantalla 2026-11-20 101010.png': 'NUEVA',
  'IMG_20260101_101010.jpg': 'foto',
  'instalador_setup.exe': 'instalador',
  'notas.txt': 'notas',
  'bloqueado.docx': 'en uso',
  'cambiado.pdf': 'version 1',
  'raro.xyz': 'desconocido',
}

const DESTINO: Record<string, string | null> = {
  'Estudios/Cibertec - Programacion Orientada a Objetos/T1_POO_Clases.docx': 'previo',
  'Estudios/Cibertec - Programacion Orientada a Objetos/T2_POO_Encapsulamiento.docx': 'previo',
  'Estudios/Cibertec - Calculo II': null,
  'Finanzas/Recibos y facturas/Factura_Agua_Octubre_2026.pdf': 'previo',
  'Imágenes/Capturas de pantalla/Captura de pantalla 2026-11-20 101010.png': 'ORIGINAL',
  'Documentos/Word': null,
  'Documentos/PDF': null,
}

function write(base: string, entries: Record<string, string | null>) {
  for (const [rel, content] of Object.entries(entries)) {
    const full = join(base, ...rel.split('/'))
    if (content === null) {
      mkdirSync(full, { recursive: true })
    } else {
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, content)
    }
  }
}

export function createSandbox(): Sandbox {
  // Dentro del proyecto (no en AppData, que el motor protege) y fuera de git.
  const root = resolve('e2e', '.sandbox', `run-${Date.now()}`)
  const s: Sandbox = {
    root,
    origen: join(root, 'Origen'),
    destino: join(root, 'Destino'),
    data: join(root, 'data'),
    webview: join(root, 'webview'),
    path: (...p) => join(root, ...p),
    read: (...p) => readFileSync(join(root, ...p), 'utf8'),
    exists: (...p) => existsSync(join(root, ...p)),
    list: (...p) => readdirSync(join(root, ...p)),
    cleanup: () => {
      if (!process.env.CARPETEA_E2E_KEEP) rmSync(root, { recursive: true, force: true, maxRetries: 5 })
    },
  }
  write(s.origen, ORIGEN)
  write(s.destino, DESTINO)
  mkdirSync(s.data, { recursive: true })
  mkdirSync(s.webview, { recursive: true })
  return s
}

/**
 * Bloquea un archivo como lo haría otro programa (FileShare.None) hasta `release()`.
 * Resuelve cuando el bloqueo está activo.
 */
export function lockFile(path: string): Promise<{ release: () => void }> {
  const script = `$f = [System.IO.File]::Open('${path.replace(/'/g, "''")}', 'Open', 'ReadWrite', 'None'); Write-Output LOCKED; [Console]::Out.Flush(); Start-Sleep -Seconds 120; $f.Close()`
  const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['ignore', 'pipe', 'inherit'] })
  return new Promise((ok, fail) => {
    ps.stdout.on('data', (d: Buffer) => {
      if (d.toString().includes('LOCKED')) ok({ release: () => ps.kill() })
    })
    ps.on('exit', (code) => fail(new Error(`No se pudo bloquear ${path} (código ${code})`)))
  })
}
