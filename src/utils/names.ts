/**
 * Nombres de carpeta seguros en Windows. Un nombre como ".." sacaría los
 * archivos de la carpeta elegida; "CON" o "Docs." Windows los rechaza o los
 * cambia al crearlos. El motor también los rechaza (safety.rs).
 */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Qué tiene de malo el nombre, o `null` si se puede usar. */
export function folderNameProblem(raw: string): string | null {
  const name = raw.trim()
  if (!name) return 'Escribe un nombre.'
  if (/[\\/:*?"<>|]/.test(name)) return 'No puede contener \\ / : * ? " < > |'
  if (/^\.+$/.test(name)) return 'Ese nombre no es válido.'
  if (name.endsWith('.')) return 'No puede terminar en punto.'
  if (RESERVED.test(name.split('.')[0].trim())) return 'Windows reserva ese nombre.'
  return null
}

/** Nombre limpio y seguro, o `null` si no se puede usar. */
export function cleanFolderName(raw: string): string | null {
  const name = raw.trim()
  return folderNameProblem(name) ? null : name
}

/** Ruta relativa tipo "Finanzas/Notas": problema del primer tramo no válido. */
export function folderPathProblem(raw: string): string | null {
  const parts = raw.split(/[\\/]/).map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return 'Escribe una carpeta.'
  for (const p of parts) {
    const problem = folderNameProblem(p)
    if (problem) return `«${p}»: ${problem}`
  }
  return null
}

/** Normaliza "Finanzas\\Notas/" → "Finanzas/Notas". */
export function normalizeFolderPath(raw: string): string {
  return raw
    .split(/[\\/]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join('/')
}
