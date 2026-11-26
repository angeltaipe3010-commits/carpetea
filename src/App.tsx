import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig } from 'motion/react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Toaster } from '@/components/ui/feedback'
import { useApplyPreferences } from '@/hooks/useTheme'
import { useSettings } from '@/stores/settings'
import Dashboard from '@/pages/Dashboard'
import Organizer from '@/pages/Organizer'
import Duplicates from '@/pages/Duplicates'
import Rules from '@/pages/Rules'
import History from '@/pages/History'
import Settings from '@/pages/Settings'

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <main id="contenido" className="min-w-0 flex-1 overflow-y-auto" tabIndex={-1}>
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/organizar" element={<Organizer />} />
          <Route path="/duplicados" element={<Duplicates />} />
          <Route path="/reglas" element={<Rules />} />
          <Route path="/historial" element={<History />} />
          <Route path="/configuracion" element={<Settings />} />
        </Routes>
      </AnimatePresence>
    </main>
  )
}

export default function App() {
  useApplyPreferences()
  const motionPref = useSettings((s) => s.motion)
  return (
    // HashRouter: funciona igual en el navegador y dentro del WebView de Tauri.
    <HashRouter>
      <MotionConfig reducedMotion={motionPref === 'reduced' ? 'always' : motionPref === 'full' ? 'never' : 'user'}>
        {/* Botón y no enlace: con HashRouter un href="#…" cambiaría de ruta. */}
        <button
          type="button"
          onClick={() => document.getElementById('contenido')?.focus()}
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop"
        >
          Saltar al contenido
        </button>
        <div className="flex h-full">
          <Sidebar />
          <AnimatedRoutes />
        </div>
        <Toaster />
      </MotionConfig>
    </HashRouter>
  )
}
