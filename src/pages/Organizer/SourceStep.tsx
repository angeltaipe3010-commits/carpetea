import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Check, CircleExclamationPoint, Download, FolderOpen, FolderSearch, Monitor, ScanSearch, ShieldCheck, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DestinationField, destinationReady } from '@/components/folders/DestinationField'
import { Panel, Skeleton, Switch } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { formatBytes, plural } from '@/lib/format'
import { list, listItem } from '@/lib/motion'
import { api } from '@/services/api'
import { useOrganizer } from '@/stores/organizer'
import { useRules } from '@/stores/rules'
import { useSettings } from '@/stores/settings'
import type { SourceFolder } from '@/types'

const ICONS: Record<string, typeof Download> = { downloads: Download, desktop: Monitor }

export default function SourceStep() {
  const navigate = useNavigate()
  const { source, selectSource, startScan, error } = useOrganizer()
  const settings = useSettings()
  const activeRules = useRules((s) => s.rules.filter((r) => r.enabled).length)
  const [folders, setFolders] = useState<SourceFolder[] | null>(null)

  useEffect(() => {
    api.listSuggestedFolders().then(setFolders)
  }, [])

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <section aria-labelledby="src-title">
        <Panel className="p-5">
          <h2 id="src-title" className="text-[14px] font-semibold text-text">
            ¿Qué carpeta quieres organizar?
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">DeskFlow solo accede a la carpeta que elijas.</p>

          <motion.div variants={list} initial="initial" animate="animate" role="radiogroup" aria-label="Carpeta de origen" className="mt-4 grid gap-2.5">
            {folders === null
              ? [0, 1].map((i) => <Skeleton key={i} className="h-[66px] rounded-xl" />)
              : folders.map((f) => {
                  const Icon = ICONS[f.id] ?? FolderOpen
                  const selected = source?.id === f.id
                  return (
                    <motion.button
                      variants={listItem}
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => selectSource(f)}
                      className={cn(
                        'flex items-center gap-3.5 rounded-xl border p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-200',
                        selected ? 'border-primary bg-primary-soft/60 ring-3 ring-[var(--df-ring)]' : 'border-border hover:border-border-strong hover:bg-surface-2/50',
                      )}
                    >
                      <span className={cn('grid size-10 place-items-center rounded-lg transition-colors', selected ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-muted')}>
                        <Icon className="size-[18px]" strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-text">{f.name}</span>
                        <span className="block truncate font-mono text-[11.5px] text-faint">{f.path}</span>
                      </span>
                      <span className="text-right text-[12px] text-muted max-[600px]:hidden">
                        <span className="block tabular-nums">{plural(f.fileCount, 'archivo', 'archivos')}</span>
                        <span className="block text-faint tabular-nums">{formatBytes(f.size)}</span>
                      </span>
                      <span className={cn('grid size-5 place-items-center rounded-full border transition-colors', selected ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong')}>
                        {selected && <Check className="size-3" strokeWidth={3} />}
                      </span>
                    </motion.button>
                  )
                })}
          </motion.div>

          <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-border-strong px-4 py-3.5">
            <FolderSearch className="size-[18px] shrink-0 text-faint" strokeWidth={1.8} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-text">Elegir otra carpeta o arrastrarla aquí</div>
              <div className="text-[12px] text-faint">Necesita el selector nativo de Windows: llega con la versión de escritorio (Fase 2).</div>
            </div>
            <Button size="sm" disabled>
              Examinar…
            </Button>
          </div>

          {error && (
            <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-lg bg-danger-soft px-3.5 py-3 text-[13px] text-danger">
              <CircleExclamationPoint className="mt-px size-4 shrink-0" />
              {error}
            </div>
          )}
        </Panel>
      </section>

      <aside className="space-y-4">
        <Panel className="p-5">
          <h2 className="text-[14px] font-semibold text-text">¿Dónde guardar lo organizado?</h2>
          <p className="mt-0.5 mb-3.5 text-[12.5px] text-muted">Local por defecto; la nube solo si la confirmas. Se recuerda tu elección.</p>
          <DestinationField value={settings.destination} onChange={(destination) => settings.set({ destination })} sourceName={source?.name} />
        </Panel>

        <Panel className="p-5">
          <h2 className="text-[14px] font-semibold text-text">Opciones del análisis</h2>
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="depth" className="text-[13px] text-text">
                  Profundidad máxima
                </label>
                <span className="text-[13px] font-medium text-text tabular-nums">{settings.maxDepth} niveles</span>
              </div>
              <input
                id="depth"
                type="range"
                min={2}
                max={6}
                value={settings.maxDepth}
                onChange={(e) => settings.set({ maxDepth: Number(e.target.value) })}
                className="mt-2 w-full"
              />
              <p className="text-[11.5px] text-faint">Evita árboles demasiado profundos. Recomendado: 4.</p>
            </div>
            <Option label="Incluir subcarpetas" hint="Analiza también las carpetas internas" checked={settings.recursive} onChange={(v) => settings.set({ recursive: v })} />
            <Option label="Subcarpetas por año" hint="Ej. Facturas/2026, Fotografías/2025" checked={settings.yearSubfolders} onChange={(v) => settings.set({ yearSubfolders: v })} />
            <button
              type="button"
              onClick={() => navigate('/reglas')}
              className="flex w-full items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5 text-left text-[12.5px] text-muted transition-colors hover:text-text"
            >
              <Workflow className="size-4 text-primary" strokeWidth={1.8} />
              <span className="flex-1">Se aplicarán {plural(activeRules, 'regla activa', 'reglas activas')}</span>
              <span className="text-primary">Editar</span>
            </button>
          </div>
        </Panel>

        <div className="flex items-start gap-2.5 px-1 text-[12.5px] leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={1.8} />
          El análisis no mueve ni modifica archivos. Primero verás una vista previa completa.
        </div>

        <Button variant="primary" size="lg" icon={ScanSearch} className="w-full" disabled={!source || !destinationReady(settings.destination)} onClick={startScan}>
          {!source ? 'Elige una carpeta' : !destinationReady(settings.destination) ? 'Elige dónde guardar' : `Analizar ${source.name}`}
        </Button>
      </aside>
    </div>
  )
}

function Option({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[13px] text-text">{label}</div>
        <div className="text-[11.5px] text-faint">{hint}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}
