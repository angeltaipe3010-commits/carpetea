// Prepara la web para publicarla: copia el instalador, la licencia y las
// huellas a website/downloads y actualiza la versión y el SHA-256 en la página.
//
//   npm run tauri build
//   npm run site
//
// Los botones de descarga apuntan a la Release de GitHub de esa versión
// (gh release create v<versión> <instalador> website/downloads/SHA256SUMS.txt).
// Al subir website/ a main, Vercel la publica (configuración en vercel.json).
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version
const file = `DeskFlow_${version}_x64-setup.exe`
const built = join('src-tauri', 'target', 'release', 'bundle', 'nsis', file)
if (!existsSync(built)) {
  console.error(`No existe ${built}. Genera antes el instalador con "npm run tauri build".`)
  process.exit(1)
}

const out = join('website', 'downloads')
mkdirSync(out, { recursive: true })
copyFileSync(built, join(out, file))
copyFileSync('LICENSE', join(out, 'LICENSE.txt'))
const sha = createHash('sha256').update(readFileSync(built)).digest('hex')
writeFileSync(join(out, 'SHA256SUMS.txt'), `${sha}  ${file}\n`)

const mb = (statSync(built).size / 1024 / 1024).toFixed(1).replace('.', ',')
let html = readFileSync('website/index.html', 'utf8')
html = html
  .replace(/DeskFlow_[\d.]+_x64-setup\.exe/g, file)
  .replace(/releases\/download\/v[\d.]+\//g, `releases/download/v${version}/`)
  .replace(/(<code id="sha"[^>]*>)[0-9a-f]{64}(<\/code>)/, `$1${sha}$2`)
  .replace(/\d+,\d MB/g, `${mb} MB`)
  .replace(/Versión <b>[\d.]+<\/b>/, `Versión <b>${version}</b>`)
  .replace(/Descargar DeskFlow [\d.]+/, `Descargar DeskFlow ${version}`)
  .replace(/DeskFlow [\d.]+<\/span>/, `DeskFlow ${version}</span>`)
writeFileSync('website/index.html', html)
console.log(`website/ lista: ${file} (${mb} MB)\nSHA-256 ${sha}`)
