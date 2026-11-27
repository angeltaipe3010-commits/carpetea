// SEO de la web: genera los datos estructurados de las preguntas frecuentes a
// partir del texto visible (deben coincidir letra por letra), escribe el
// sitemap con la fecha de hoy y avisa si el título o la descripción se salen
// de la longitud recomendada.
//
//   npm run seo        (también lo ejecuta "npm run site")
import { readFileSync, writeFileSync } from 'node:fs'

export const SITE = 'https://carpetea.vercel.app'
const file = 'website/index.html'

const text = (html) =>
  html
    .replace(/<i>[\s\S]*?<\/i>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

let html = readFileSync(file, 'utf8')

const faq = html.match(/<section[^>]*id="preguntas"[\s\S]*?<\/section>/)?.[0]
if (!faq) throw new Error('No encuentro la sección #preguntas')
const items = [...faq.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)].map(
  ([, q, a]) => ({ '@type': 'Question', name: text(q), acceptedAnswer: { '@type': 'Answer', text: text(a) } }),
)
if (!items.length) throw new Error('La sección #preguntas no tiene preguntas')

const json = JSON.stringify(items, null, 2).replace(/\n/g, '\n      ')
const before = html
html = html.replace(/("mainEntity": )("FAQ_GENERADO"|\[[\s\S]*?\n      \])/, (_, k) => k + json)
if (html === before && !before.includes(json)) throw new Error('No encuentro "mainEntity" en el JSON-LD')
writeFileSync(file, html)

// El JSON-LD tiene que seguir siendo JSON válido.
for (const [, block] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(block)

const today = new Date().toISOString().slice(0, 10)
writeFileSync(
  'website/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${today}</lastmod>
  </url>
</urlset>
`,
)

const title = text(html.match(/<title>([\s\S]*?)<\/title>/)[1])
const desc = html.match(/<meta name="description" content="([^"]*)"/)[1]
const warn = []
if (title.length < 40 || title.length > 60) warn.push(`título de ${title.length} caracteres (mejor 50-60)`)
if (desc.length < 120 || desc.length > 160) warn.push(`descripción de ${desc.length} caracteres (mejor 150-160)`)
console.log(`SEO: ${items.length} preguntas en el JSON-LD, sitemap ${today}, título ${title.length}, descripción ${desc.length}`)
if (warn.length) console.warn('Aviso: ' + warn.join('; '))
