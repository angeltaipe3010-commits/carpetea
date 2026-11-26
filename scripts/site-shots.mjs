// Capturas de la app (prototipo del navegador, datos de ejemplo) para la web.
// No usan rutas ni datos reales del usuario. Requiere `npm run dev` y Edge.
//   node scripts/site-shots.mjs   → website/img/*.png (convertir a .webp después)
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const out = 'website/img'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })

async function shoot(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1320, height: 820 }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto('http://localhost:1420/')
  // La etiqueta "Modo prototipo" es solo para desarrollo.
  await page.addStyleTag({ content: '.border-dashed.max-\\[900px\\]\\:hidden{display:none!important}' })
  const nav = page.getByRole('navigation', { name: 'Principal' })
  await nav.waitFor()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/inicio-${theme}.png` })

  await nav.getByRole('link', { name: /^Organizar/ }).click()
  await page.getByRole('radio', { name: /^Descargas/ }).click()
  await page.getByRole('button', { name: /^Analizar/ }).click()
  await page.getByRole('heading', { name: 'Estructura propuesta' }).waitFor({ timeout: 20000 })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/vista-previa-${theme}.png` })

  await nav.getByRole('link', { name: /^Duplicados/ }).click()
  await page.getByRole('button', { name: /^Buscar duplicados/ }).click()
  await page.getByText(/archivos idénticos/).first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/duplicados-${theme}.png` })

  await nav.getByRole('link', { name: /^Historial/ }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/historial-${theme}.png` })
  await ctx.close()
}

await shoot('light')
await shoot('dark')
await browser.close()
console.log('ok')
