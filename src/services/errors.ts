/** Función aún no disponible en este modo. La interfaz debe decirlo, no simularla. */
export class NotAvailableError extends Error {
  constructor(feature: string) {
    super(`${feature} todavía no está disponible en la versión de escritorio.`)
    this.name = 'NotAvailableError'
  }
}
