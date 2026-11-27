/**
 * QA de la app de escritorio sobre disco real (carpeta de pruebas aislada).
 *
 * Riesgos cubiertos, de mayor a menor impacto:
 * 1. Perder o sobrescribir archivos al organizar.
 * 2. Mover archivos bloqueados o modificados después del análisis.
 * 3. Deshacer incompleto o que borre algo.
 * 4. Destinos sin permiso o en la nube usados sin confirmación.
 * 5. "Usar mi estructura" y cursos nuevos colocando mal los archivos.
 *
 * Van en serie: comparten una sola ventana y el estado del disco avanza de una a otra.
 */
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { lockFile } from './sandbox'

test.describe.configure({ mode: 'serial' })

const POO = 'Cibertec - Programacion Orientada a Objetos'
const DAW = 'Cibertec - Desarrollo de Aplicaciones Web I'

async function goTo(page: Page, section: RegExp) {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: section }).click()
}

async function analyzeE2E(page: Page) {
  await goTo(page, /^Organizar/)
  await page.getByRole('radio', { name: /Pruebas E2E/ }).click()
  await page.getByRole('button', { name: 'Analizar Pruebas E2E' }).click()
  await expect(page.getByRole('heading', { name: 'Estructura propuesta' })).toBeVisible()
}

/** Fila de la lista de archivos de la vista previa, buscándola por nombre. */
async function fileRow(page: Page, name: string) {
  await page.getByLabel('Buscar archivo').fill(name)
  return page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })
}

test('arranca como app de escritorio, sin datos simulados', async ({ app }) => {
  const { page } = app
  await goTo(page, /^Inicio/)
  await expect(page.getByText('Modo prototipo')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Pruebas E2E/ })).toBeVisible()
  await goTo(page, /^Historial/)
  await expect(page.getByText('El historial está vacío')).toBeVisible()
})

test('la vista previa usa mi estructura y propone cursos nuevos', async ({ app }) => {
  const { page, sandbox, setDestination } = app
  await setDestination({ mode: 'custom', customPath: sandbox.destino })
  await analyzeE2E(page)

  await test.step('aprende la estructura del destino', async () => {
    const stat = page.getByText('En tus carpetas', { exact: true }).locator('..')
    await expect(stat).toHaveText(/En tus carpetas\s*\d+/)
  })

  await test.step('trabajo de un curso existente → su carpeta', async () => {
    const row = await fileRow(page, 'POOII_T1_PerezQuispe.docx')
    await expect(row).toContainText(`Estudios/${POO}`)
    await expect(row).toContainText('Tu carpeta')
  })

  await test.step('curso sin carpeta → se crea en Estudios con el mismo formato', async () => {
    await page.getByLabel('Buscar archivo').fill('DESARROLLO-DE-APLICACIONES')
    const rows = page.getByRole('listitem').filter({ hasText: 'DESARROLLO-DE-APLICACIONES' })
    await expect(rows).toHaveCount(2)
    for (const row of await rows.all()) {
      await expect(row).toContainText(`Estudios/${DAW}`)
      await expect(row).toContainText('Curso nuevo')
    }
  })

  await test.step('categorías encajadas en carpetas existentes', async () => {
    await expect(await fileRow(page, 'Factura_Luz_Noviembre_2026.pdf')).toContainText('Finanzas/Recibos y facturas')
    await expect(await fileRow(page, 'raro.xyz')).toContainText('Por revisar')
  })

  await test.step('detecta que la captura ya existe en el destino', async () => {
    const row = await fileRow(page, 'Captura de pantalla 2026-11-20 101010.png')
    await expect(row).toContainText('Imágenes/Capturas de pantalla')
    await expect(row).toContainText('Ya existe en el destino')
  })
  await page.getByLabel('Buscar archivo').fill('')
})

test('organiza sin sobrescribir y respeta archivos en uso o modificados', async ({ app }) => {
  const { page, sandbox } = app
  const lock = await lockFile(sandbox.path('Origen', 'bloqueado.docx'))
  try {
    // Cambio hecho por "otro programa" entre el análisis y la confirmación.
    appendFileSync(sandbox.path('Origen', 'cambiado.pdf'), ' + version 2')

    await page.getByRole('button', { name: 'Revisar y confirmar' }).click()
    const dialog = page.getByRole('dialog', { name: 'Confirmar organización' })
    await expect(dialog).toContainText('nada se sube a la nube')
    await dialog.getByRole('button', { name: /^Organizar \d+ archivos?$/ }).click()
    await expect(page.getByRole('heading', { name: /está organizada/ })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('status')).toContainText('bloqueado.docx')
    await expect(page.getByRole('status')).toContainText('cambiado.pdf')
  } finally {
    lock.release()
  }

  await test.step('los archivos están donde dijo la vista previa', async () => {
    expect(sandbox.exists('Destino', 'Estudios', POO, 'POOII_T1_PerezQuispe.docx')).toBe(true)
    expect(sandbox.list('Destino', 'Estudios', DAW).sort()).toEqual([
      'DESARROLLO-DE-APLICACIONES-WEB-I-T1-T5FO-PEREZ-QUISPE.docx',
      'DESARROLLO-DE-APLICACIONES-WEB-I-T2-T5FO-PEREZ-QUISPE.pdf',
    ])
    expect(sandbox.exists('Origen', 'POOII_T1_PerezQuispe.docx')).toBe(false)
  })

  await test.step('nunca sobrescribe: la captura previa sigue intacta y la nueva se renombra', async () => {
    const dir = ['Destino', 'Imágenes', 'Capturas de pantalla'] as const
    expect(sandbox.read(...dir, 'Captura de pantalla 2026-11-20 101010.png')).toBe('ORIGINAL')
    expect(sandbox.read(...dir, 'Captura de pantalla 2026-11-20 101010 (1).png')).toBe('NUEVA')
  })

  await test.step('el archivo en uso y el modificado se quedan en el origen, sin tocar', async () => {
    expect(sandbox.read('Origen', 'bloqueado.docx')).toBe('en uso')
    expect(sandbox.read('Origen', 'cambiado.pdf')).toBe('version 1 + version 2')
  })
})

test('deshacer devuelve todo y retira las carpetas que creó', async ({ app }) => {
  const { page, sandbox } = app
  await goTo(page, /^Historial/)
  await page.getByRole('button', { name: 'Deshacer', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Deshacer operación' })
  await dialog.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await expect(page.getByText('Deshecha', { exact: true }).first()).toBeVisible({ timeout: 30_000 })

  expect(sandbox.read('Origen', 'POOII_T1_PerezQuispe.docx')).toBe('trabajo poo')
  expect(sandbox.read('Origen', 'Captura de pantalla 2026-11-20 101010.png')).toBe('NUEVA')
  expect(sandbox.exists('Destino', 'Estudios', DAW)).toBe(false)
  // Lo que ya era del usuario sigue ahí.
  expect(sandbox.read('Destino', 'Estudios', POO, 'T1_POO_Clases.docx')).toBe('previo')
  expect(sandbox.read('Destino', 'Imágenes', 'Capturas de pantalla', 'Captura de pantalla 2026-11-20 101010.png')).toBe('ORIGINAL')
})

test('no deja organizar hacia una carpeta sin permiso', async ({ app }) => {
  const { page, setDestination } = app
  await setDestination({ mode: 'custom', customPath: 'C:\\Carpetea-sin-permiso' })
  await analyzeE2E(page)
  await expect(page.getByRole('alert').filter({ hasText: 'no tiene permiso' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Revisar y confirmar' })).toBeDisabled()
})

test('pide confirmación antes de usar una carpeta de la nube', async ({ app }) => {
  const { page, sandbox, setDestination } = app
  mkdirSync(sandbox.path('OneDrive', 'Docs'), { recursive: true })
  writeFileSync(sandbox.path('OneDrive', 'Docs', '.keep'), '')
  await setDestination({ mode: 'custom', customPath: sandbox.path('OneDrive', 'Docs') })
  await goTo(page, /^Organizar/)
  await page.getByRole('radio', { name: /Pruebas E2E/ }).click()
  await expect(page.getByText(/conectado a OneDrive/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Elige dónde guardar' })).toBeDisabled()
})
