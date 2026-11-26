/**
 * Regresiones de fallos que encontró el QA exploratorio (agente tester).
 * Comparte la ventana con organize.spec.ts (fixture por worker), así que cada
 * prueba deja el disco como lo encontró.
 */
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

test.describe.configure({ mode: 'serial' })

async function analyzeE2E(page: Page) {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: /^Organizar/ }).click()
  // Puede quedar en la vista previa o en el resultado de una prueba anterior.
  const radio = page.getByRole('radio', { name: /Pruebas E2E/ })
  const back = page.getByRole('button', { name: /^(Cambiar carpeta|Organizar otra carpeta)$/ })
  await expect(radio.or(back)).toBeVisible()
  if (await back.isVisible()) await back.click()
  await page.getByRole('radio', { name: /Pruebas E2E/ }).click()
  await page.getByRole('button', { name: 'Analizar Pruebas E2E' }).click()
  await expect(page.getByRole('heading', { name: 'Estructura propuesta' })).toBeVisible()
}

test('doble clic en confirmar organiza una sola vez', async ({ app }) => {
  const { page, sandbox, setDestination } = app
  await setDestination({ mode: 'custom', customPath: sandbox.destino })
  await analyzeE2E(page)
  await page.getByRole('button', { name: 'Revisar y confirmar' }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirmar organización' })
  await dialog.getByRole('button', { name: /^Organizar \d+ archivos?$/ }).dblclick()
  await expect(page.getByRole('heading', { name: /está organizada/ })).toBeVisible({ timeout: 30_000 })
  expect(sandbox.exists('Destino', 'Finanzas', 'Recibos y facturas', 'Factura_Luz_Noviembre_2026.pdf')).toBe(true)

  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: /^Historial/ }).click()
  await expect(page.getByText('Fallida', { exact: true })).toHaveCount(0)

  // Deja el disco como estaba.
  await page.getByRole('button', { name: 'Deshacer', exact: true }).first().click()
  await page.getByRole('dialog', { name: 'Deshacer operación' }).getByRole('button', { name: 'Deshacer', exact: true }).click()
  await expect(page.getByText('Deshecha', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  expect(sandbox.exists('Origen', 'Factura_Luz_Noviembre_2026.pdf')).toBe(true)
})

test('rechaza ".." y nombres reservados como carpeta', async ({ app }) => {
  const { page } = app
  await analyzeE2E(page)
  await page.getByRole('button', { name: 'Nueva carpeta' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva carpeta' })
  const input = dialog.getByLabel('Nombre')
  const create = dialog.getByRole('button', { name: 'Crear carpeta' })
  for (const bad of ['..', 'CON', 'Docs.']) {
    await input.fill(bad)
    await expect(create).toBeDisabled()
  }
  await input.fill('Apuntes')
  await expect(create).toBeEnabled()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
})

test('escribir rápido en un diálogo no pierde letras', async ({ app }) => {
  const { page } = app
  await page.getByRole('button', { name: 'Nueva carpeta' }).click()
  const input = page.getByRole('dialog', { name: 'Nueva carpeta' }).getByLabel('Nombre')
  await expect(input).toBeFocused()
  await input.pressSequentially('Carpeta de prueba', { delay: 0 })
  await expect(input).toHaveValue('Carpeta de prueba')
  await page.keyboard.press('Escape')
})

test('volver a analizar avisa antes de descartar cambios a mano', async ({ app }) => {
  const { page } = app
  await page.getByLabel('Buscar archivo').fill('notas.txt')
  await page.getByRole('button', { name: 'Excluir notas.txt' }).click()
  await page.getByLabel('Buscar archivo').fill('')
  await page.getByRole('button', { name: 'Volver a analizar' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Descartar tus cambios?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(page.getByRole('button', { name: /Excluidos/ })).toContainText('1')
})
