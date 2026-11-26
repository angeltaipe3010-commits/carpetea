import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { restorePrefs } from './services/prefs'
import { installErrorHandlers } from './services/log'
import { ErrorBoundary } from './components/layout/ErrorBoundary'

installErrorHandlers()

// Primero se recuperan las preferencias guardadas en SQLite (si faltan en el
// WebView) y después se carga la app, para que los stores ya nazcan con ellas.
void restorePrefs().finally(async () => {
  const { default: App } = await import('./App.tsx')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
})
