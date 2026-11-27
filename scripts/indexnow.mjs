// Avisa a Bing (y a los demás buscadores de IndexNow) de que la web cambió.
// Ejecútalo después de que Vercel publique los cambios:
//
//   npm run indexnow
//
// La clave es el nombre del archivo website/<clave>.txt, que contiene la misma
// clave y demuestra que la web es nuestra. Google no usa IndexNow: para Google
// cuenta el sitemap con su lastmod.
import { readdirSync, readFileSync } from 'node:fs'

// La dirección pública es la del canonical de la página.
const SITE = readFileSync('website/index.html', 'utf8').match(/rel="canonical" href="(https:\/\/[^"/]+)\/"/)[1]

const key = readdirSync('website').find((f) => /^[0-9a-f]{32}\.txt$/.test(f))?.slice(0, -4)
if (!key) throw new Error('Falta el archivo de clave website/<clave>.txt')

const check = await fetch(`${SITE}/${key}.txt`)
if (!check.ok || (await check.text()).trim() !== key) {
  throw new Error(`${SITE}/${key}.txt aún no está publicado: espera a que Vercel termine.`)
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: new URL(SITE).host,
    key,
    keyLocation: `${SITE}/${key}.txt`,
    urlList: [`${SITE}/`, `${SITE}/llms.txt`],
  }),
})
console.log(`IndexNow: ${res.status} ${res.statusText}`)
if (!res.ok && res.status !== 202) process.exit(1)
