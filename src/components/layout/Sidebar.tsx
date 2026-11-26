import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { Copy, FolderSync, House, Moon, RotateCcwClock, Settings, Sun, Workflow } from 'lucide-react'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'
import { useSettings } from '@/stores/settings'
import { useResolvedTheme } from '@/hooks/useTheme'

const NAV: { to: string; label: string; hint: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Inicio', hint: 'Resumen y actividad', icon: House },
  { to: '/organizar', label: 'Organizar', hint: 'Escanear y clasificar', icon: FolderSync },
  { to: '/duplicados', label: 'Duplicados', hint: 'Archivos repetidos', icon: Copy },
  { to: '/reglas', label: 'Reglas', hint: 'Automatizaciones', icon: Workflow },
  { to: '/historial', label: 'Historial', hint: 'Operaciones y deshacer', icon: RotateCcwClock },
]

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--df-primary)" />
      <path d="M9 11h14M9 16h10M9 21h6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

export function Sidebar() {
  const { pathname } = useLocation()
  const setSettings = useSettings((s) => s.set)
  const resolved = useResolvedTheme()

  return (
    <aside className="flex h-full w-[232px] shrink-0 flex-col border-r border-border bg-surface max-[900px]:w-[64px]">
      <div className="flex h-16 items-center gap-2.5 px-4 max-[900px]:justify-center max-[900px]:px-0">
        <Logo className="size-8 shrink-0" />
        <div className="min-w-0 leading-tight max-[900px]:hidden">
          <div className="text-[14.5px] font-semibold tracking-[-0.01em] text-text">DeskFlow</div>
          <div className="text-[11.5px] text-faint">Workspace · v1.0</div>
        </div>
      </div>

      <nav aria-label="Principal" className="flex flex-1 flex-col gap-0.5 px-2.5 pt-2">
        {NAV.map((item) => (
          <NavItem key={item.to} {...item} active={item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)} />
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 px-2.5 pb-3">
        <div className="mx-1.5 mb-2 rounded-lg border border-dashed border-border-strong px-2.5 py-2 max-[900px]:hidden">
          <p className="text-[11.5px] font-medium text-text">Modo prototipo</p>
          <p className="mt-0.5 text-[11px] leading-snug text-faint">Datos simulados. Ningún archivo real se mueve.</p>
        </div>
        <NavItem
          to="/configuracion"
          label="Configuración"
          hint="Preferencias"
          icon={Settings}
          active={pathname.startsWith('/configuracion')}
        />
        <button
          type="button"
          onClick={() => setSettings({ theme: resolved === 'dark' ? 'light' : 'dark' })}
          className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-text max-[900px]:justify-center max-[900px]:px-0"
          aria-label={resolved === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        >
          {resolved === 'dark' ? <Sun className="size-[17px]" strokeWidth={1.8} /> : <Moon className="size-[17px]" strokeWidth={1.8} />}
          <span className="max-[900px]:hidden">{resolved === 'dark' ? 'Tema claro' : 'Tema oscuro'}</span>
        </button>
      </div>
    </aside>
  )
}

function NavItem({ to, label, hint, icon: Icon, active }: { to: string; label: string; hint: string; icon: LucideIcon; active: boolean }) {
  return (
    <NavLink
      to={to}
      title={`${label} · ${hint}`}
      className={cn(
        'relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors duration-150 max-[900px]:justify-center max-[900px]:px-0',
        active ? 'font-medium text-text' : 'text-muted hover:bg-surface-2 hover:text-text',
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          transition={spring}
          className="absolute inset-0 rounded-lg bg-surface-2 ring-1 ring-border"
        />
      )}
      <Icon className={cn('relative size-[17px] shrink-0', active ? 'text-primary' : '')} strokeWidth={1.8} aria-hidden />
      <span className="relative max-[900px]:sr-only">{label}</span>
    </NavLink>
  )
}
