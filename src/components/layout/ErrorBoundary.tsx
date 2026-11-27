import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/services/log'

/**
 * Si una pantalla falla al pintarse, se muestra un aviso en lugar de dejar la
 * ventana en blanco. Los archivos no se ven afectados: el motor es aparte.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError('render', `${error.message}\n${info.componentStack ?? ''}`)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="grid min-h-screen place-items-center bg-bg p-6 text-center">
        <div className="max-w-[420px]">
          <h1 className="text-[17px] font-semibold text-text">Algo salió mal en esta pantalla</h1>
          <p className="mt-2 text-[13.5px] text-muted">
            Tus archivos no se han visto afectados: cada movimiento se registra y se puede deshacer desde el Historial. El error se guardó en el
            registro de Carpetea.
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            className="mt-5 h-9 rounded-lg bg-primary px-4 text-[13.5px] font-medium text-primary-fg hover:bg-primary-hover"
          >
            Volver a cargar
          </button>
        </div>
      </div>
    )
  }
}
