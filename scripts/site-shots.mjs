// Capturas de la app para la web, hechas con el prototipo del navegador y sus
// datos de ejemplo (no aparecen rutas ni datos reales del usuario).
//
// Cada imagen es una ventana completa o un componente entero, recortado por
// sus propios bordes y con la proporción del hueco donde va en la página, para
// que ninguna palabra quede cortada por un recorte manual.
//
//   npm run dev            (en otra terminal)
//   node scripts/site-shots.mjs
//
// Requiere Microsoft Edge (Playwright usa el instalado) y Pillow para WebP.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { chromium } from '@playwright/test'

const out = 'website/img'
const tmp = 'website/img/.png'
mkdirSync(tmp, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })

async function open(theme, width = 1320, height = 820) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto('http://localhost:1420/')
  // La etiqueta "Modo prototipo" es solo para desarrollo.
  await page.addStyleTag({ content: '.border-dashed.max-\\[900px\\]\\:hidden{display:none!important}' })
  await page.getByRole('navigation', { name: 'Principal' }).waitFor()
  return { ctx, page, nav: page.getByRole('navigation', { name: 'Principal' }) }
}

/** Textos y marcas propias del prototipo, cambiados por lo que muestra la app de escritorio. */
async function asDesktop(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('div, span')) {
      if (el.childElementCount) continue
      if (el.textContent === 'Disponible en la app de escritorio.') el.textContent = 'Abre el selector de Windows. DeskFlow solo tendrá acceso a esa carpeta.'
      if (el.textContent === 'Ejemplo') el.style.display = 'none'
    }
    for (const b of document.querySelectorAll('button[disabled]')) if (b.textContent.includes('Examinar')) b.disabled = false
  })
}

/** Captura un componente desde su borde superior, con la proporción pedida (ancho / alto). */
async function part(page, locator, name, aspect) {
  await locator.scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  const b = await locator.boundingBox()
  const height = aspect ? Math.min(b.height, b.width / aspect) : b.height
  await page.screenshot({ path: `${tmp}/${name}.png`, clip: { x: b.x, y: b.y, width: b.width, height } })
}

async function toPreview(page, nav) {
  await nav.getByRole('link', { name: /^Organizar/ }).click()
  await page.getByRole('radio', { name: /^Descargas/ }).click()
  await page.getByRole('button', { name: /^Analizar/ }).click()
  await page.getByRole('heading', { name: 'Estructura propuesta' }).waitFor({ timeout: 20000 })
  await page.waitForTimeout(900)
}

// 1. Ventana completa (portada): vista previa en claro.
{
  const { ctx, page, nav } = await open('light')
  await toPreview(page, nav)
  await page.screenshot({ path: `${tmp}/ventana-vista-previa.png` })
  await ctx.close()
}

// 2. Componentes en oscuro (pasos, seguridad y novedad).
{
  const { ctx, page, nav } = await open('dark', 1180, 900)
  await nav.getByRole('link', { name: /^Organizar/ }).click()
  await page.getByRole('radio', { name: /^Descargas/ }).waitFor()
  await asDesktop(page)
  await part(page, page.locator('section[aria-labelledby="src-title"]'), 'paso-elegir', 1.72)

  await page.getByRole('radio', { name: /^Descargas/ }).click()
  await page.getByRole('button', { name: /^Analizar/ }).click()
  await page.getByRole('heading', { name: 'Estructura propuesta' }).waitFor({ timeout: 20000 })
  await page.waitForTimeout(900)
  const list = page.getByLabel('Buscar archivo').locator('xpath=ancestor::div[contains(@class,"flex-col")][1]')
  await part(page, list, 'paso-revisar', 1.72)
  const tree = page.getByRole('heading', { name: 'Estructura propuesta' }).locator('xpath=ancestor::div[contains(@class,"flex-col")][1]')
  await part(page, tree, 'arbol', 0.78)

  await ctx.close()
}

// Historial: ventana más estrecha para que la operación tenga la proporción de su tarjeta.
{
  const { ctx, page, nav } = await open('dark', 800, 900)
  await nav.getByRole('link', { name: /^Historial/ }).click()
  await page.waitForTimeout(500)
  await asDesktop(page)
  await part(page, page.locator('main li').first(), 'paso-deshacer', 1.72)
  await ctx.close()
}

// 3. Grupo de duplicados en claro (tarjeta "Novedad"), con la ventana más estrecha
//    para que la fila quepa entera en una tarjeta pequeña.
{
  const { ctx, page, nav } = await open('light', 600, 900)
  await nav.getByRole('link', { name: /^Duplicados/ }).click()
  await page.getByRole('button', { name: /^Buscar duplicados/ }).click()
  await page.getByText(/archivos idénticos/).first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(500)
  // Los grupos desde el primero, con la proporción de la tarjeta (el corte inferior se funde en la página).
  await part(page, page.locator('main section').first().locator('xpath=..'), 'duplicados-grupo', 1.28)
  await ctx.close()
}

await browser.close()

// PNG → WebP (calidad 84) con Pillow.
execFileSync('python', [
  '-c',
  `
import os
from PIL import Image
src, dst = ${JSON.stringify(tmp)}, ${JSON.stringify(out)}
for f in os.listdir(src):
    im = Image.open(os.path.join(src, f)).convert('RGB')
    w = 1600 if f.startswith('ventana') else 1000
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(os.path.join(dst, f[:-4] + '.webp'), 'WEBP', quality=84, method=6)
    print(f[:-4] + '.webp', im.size)
`,
], { stdio: 'inherit' })
rmSync(tmp, { recursive: true, force: true })
