// Genera THIRD_PARTY_NOTICES.txt con las licencias de todo lo que se distribuye
// dentro de DeskFlow: dependencias de producción de npm (y Tailwind, cuyo CSS
// generado va en la app) y crates de Rust que se compilan en el ejecutable.
//
//   node scripts/third-party-notices.mjs
//
// Se ejecuta antes de cada versión publicada.
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i
// Texto de licencia → paquetes que lo usan (muchos comparten el mismo MIT o Apache).
const groups = new Map()
const missing = []
let count = 0

function licenseTexts(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8').trim())
}

function add(kind, name, version, license, dir) {
  count++
  const texts = licenseTexts(dir)
  if (!texts.length) missing.push(`${kind} ${name}@${version}`)
  const text = texts.length
    ? texts.join('\n\n')
    : `Licencia declarada: ${license}. El paquete no incluye el texto completo; consulta su repositorio.`
  // Se agrupa ignorando espacios y las líneas de copyright, que cambian entre textos idénticos.
  const key = text
    .replace(/^.*copyright.*$/gim, '')
    .replace(/\s+/g, ' ')
    .trim()
  const g = groups.get(key) ?? { texts: new Set(), packages: [] }
  g.texts.add(text)
  g.packages.push(`${name} ${version} (${kind}${license ? `, ${license}` : ''})`)
  groups.set(key, g)
}

// --- npm: dependencias de producción, recursivas ---
const npmTree = JSON.parse(execSync('npm ls --omit=dev --all --json', { encoding: 'utf8' }))
const seen = new Set()
function walk(deps) {
  for (const [name, info] of Object.entries(deps ?? {})) {
    const key = `${name}@${info.version}`
    if (!seen.has(key) && info.version) {
      seen.add(key)
      const dir = join('node_modules', name)
      const pkg = existsSync(join(dir, 'package.json')) ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) : {}
      add('npm', name, info.version, pkg.license ?? '', dir)
    }
    walk(info.dependencies)
  }
}
walk(npmTree.dependencies)
for (const extra of ['tailwindcss']) {
  const dir = join('node_modules', extra)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  add('npm', extra, pkg.version, pkg.license, dir)
}

// --- Rust: crates que se compilan en el ejecutable de Windows ---
const meta = JSON.parse(
  execFileSync('cargo', ['metadata', '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc', '--manifest-path', 'src-tauri/Cargo.toml'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  }),
)
const byId = new Map(meta.packages.map((p) => [p.id, p]))
const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]))
const keep = new Set()
const stack = [meta.resolve.root]
while (stack.length) {
  const id = stack.pop()
  if (keep.has(id)) continue
  keep.add(id)
  for (const d of nodes.get(id)?.deps ?? []) {
    // Solo dependencias normales: las de compilación y de pruebas no se distribuyen.
    if (d.dep_kinds.some((k) => k.kind === null)) stack.push(d.pkg)
  }
}
const crates = [...keep]
  .map((id) => byId.get(id))
  .filter((p) => p && p.name !== 'deskflow')
  .sort((a, b) => a.name.localeCompare(b.name))
for (const p of crates) add('crate', p.name, p.version, p.license ?? '', dirname(p.manifest_path))

const header = `DeskFlow — avisos de terceros

DeskFlow incluye software de terceros (${count} paquetes). A continuación están
sus licencias; los paquetes con el mismo texto de licencia aparecen juntos, con
cada aviso de copyright distinto.
Generado con scripts/third-party-notices.mjs.
`
const body = [...groups.values()]
  .sort((a, b) => b.packages.length - a.packages.length)
  .map((g) => {
    // El cuerpo de la licencia una vez; los avisos de copyright de cada paquete, todos.
    const [first, ...rest] = [...g.texts]
    const notices = rest.flatMap((t) => t.split('\n').filter((l) => /copyright/i.test(l)))
    return ['='.repeat(78), ...g.packages.sort(), '='.repeat(78), '', first, ...(notices.length ? ['', ...new Set(notices)] : [])].join('\n')
  })
writeFileSync('THIRD_PARTY_NOTICES.txt', header + '\n' + body.join('\n\n') + '\n')
console.log(`THIRD_PARTY_NOTICES.txt: ${count} paquetes en ${groups.size} textos de licencia.`)
if (missing.length) console.log(`Sin texto de licencia en el paquete (${missing.length}): ${missing.join(', ')}`)
