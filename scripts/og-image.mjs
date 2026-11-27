// Imagen para compartir en redes (1200×630) y el icono de iPhone (180×180),
// dibujados con la fuente y la captura de la web.
//
//   node scripts/og-image.mjs      (requiere Microsoft Edge)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const types = { woff2: 'font/woff2', webp: 'image/webp' }
const url = (p) => `data:${types[p.split('.').pop()]};base64,${readFileSync(resolve('website', p)).toString('base64')}`
const icon = readFileSync('website/img/icon.svg', 'utf8')

const og = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Inter; src: url(${url('fonts/inter-latin-wght-normal.woff2')}) format("woff2"); font-weight: 100 900; }
@font-face { font-family: Inter; src: url(${url('fonts/inter-latin-ext-wght-normal.woff2')}) format("woff2"); font-weight: 100 900; unicode-range: U+0100-024F; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; background: #e6e7ec; color: #12131a; font-family: Inter, sans-serif; position: relative; }
.copy { position: absolute; left: 64px; top: 64px; width: 500px; }
.brand { display: flex; align-items: center; gap: 12px; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
.brand svg { width: 40px; height: 40px; }
.kicker { margin-top: 64px; font-size: 17px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #4d5060; }
h1 { margin-top: 14px; font-size: 76px; font-weight: 800; line-height: 0.92; letter-spacing: -0.06em; text-transform: uppercase; }
h1 span { color: #5865d9; }
p { margin-top: 28px; font-size: 24px; line-height: 1.35; letter-spacing: -0.01em; color: #2b2d38; }
.shot { position: absolute; left: 590px; top: 70px; width: 760px; border-radius: 14px; overflow: hidden; background: #fff;
  box-shadow: 0 30px 60px rgba(18,19,26,0.18), 0 0 0 1px rgba(18,19,26,0.08); }
.bar { height: 34px; display: flex; align-items: center; gap: 7px; padding: 0 14px; background: #f4f5f8; border-bottom: 1px solid #dcdee6; }
.bar i { width: 11px; height: 11px; border-radius: 50%; background: #c9ccd6; }
.shot img { display: block; width: 100%; }
</style></head><body>
<div class="copy">
  <div class="brand">${icon}Carpetea</div>
  <div class="kicker">Organizador de archivos para Windows</div>
  <h1>Tus archivos,<br>en su <span>sitio</span>.</h1>
  <p>Vista previa antes de mover, nunca borra nada y todo se deshace. Gratis y sin nube.</p>
</div>
<div class="shot"><div class="bar"><i></i><i></i><i></i></div><img src="${url('img/ventana-vista-previa.webp')}"></div>
</body></html>`

const touch = `<!doctype html><html><head><style>
* { margin: 0; } body { width: 180px; height: 180px; display: grid; place-items: center; background: #e6e7ec; }
svg { width: 132px; height: 132px; }
</style></head><body>${icon}</body></html>`

const browser = await chromium.launch({ channel: 'msedge' })
for (const [html, w, h, out] of [[og, 1200, 630, 'website/img/og.png'], [touch, 180, 180, 'website/img/apple-touch-icon.png']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: out })
  await page.close()
  console.log(out)
}
await browser.close()
