import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Download, FolderSync, Monitor, Radar, Sparkles } from 'lucide-react'
import { Page, PageHeader, SectionTitle } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Badge, EmptyState, Panel, Skeleton, Switch } from '@/components/ui/primitives'
import { AnimatedNumber } from '@/components/ui/feedback'
import { OperationBadge, folderName } from '@/components/history/OperationBadge'
import { api } from '@/services/api'
import { formatBytes, formatRelative, greeting, plural } from '@/lib/format'
import { list, listItem } from '@/lib/motion'
import { useHistory } from '@/stores/history'
import { useOrganizer } from '@/stores/organizer'
import { useRules } from '@/stores/rules'
import { describeCondition } from '@/utils/rules'
import type { SourceFolder } from '@/types'

const FOLDER_ICON: Record<string, typeof Download> = { downloads: Download, desktop: Monitor }

export default function Dashboard() {
  const navigate = useNavigate()
  const operations = useHistory((s) => s.operations)
  const { rules, toggle } = useRules()
  const selectSource = useOrganizer((s) => s.selectSource)
  const [folders, setFolders] = useState<SourceFolder[] | null>(null)

  useEffect(() => {
    api.listSuggestedFolders().then(setFolders)
  }, [])

  const stats = useMemo(() => {
    const organize = operations.filter((o) => o.kind === 'organize')
    const moved = operations.flatMap((o) => o.moves).filter((m) => m.status === 'moved').length
    const analyzed = organize.reduce((s, o) => s + o.moves.length, 0)
    const folders = organize.reduce((s, o) => s + o.foldersCreated.length, 0)
    const review = operations.flatMap((o) => o.moves).filter((m) => m.status === 'moved' && m.to.startsWith('Por revisar')).length
    return { moved, analyzed, folders, review, last: organize[0] }
  }, [operations])

  const start = (f: SourceFolder) => {
    selectSource(f)
    navigate('/organizar')
  }

  const todayRaw = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1)
  const activeRules = rules.filter((r) => r.enabled)

  return (
    <Page>
      <PageHeader
        eyebrow={today}
        title={greeting()}
        description={
          stats.last
            ? `Tu último análisis fue ${formatRelative(stats.last.createdAt).toLowerCase()} en ${folderName(stats.last.source)}.`
            : 'Todavía no has organizado ninguna carpeta. Empieza por la que más uses.'
        }
      />

      {/* Acción principal */}
      <Panel className="relative overflow-hidden p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--df-primary-soft), transparent 70%)' }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-md">
            <Badge tone="primary" icon={Sparkles}>
              Organización inteligente
            </Badge>
            <h2 className="mt-3 text-[19px] font-semibold tracking-[-0.015em] text-text">Organiza menos. Encuentra más.</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
              DeskFlow analiza una carpeta, propone una estructura a la medida de lo que contiene y no mueve nada hasta que lo confirmes.
            </p>
          </div>
          <Button variant="primary" size="lg" icon={FolderSync} onClick={() => navigate('/organizar')}>
            Organizar una carpeta
          </Button>
        </div>

        <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
          {folders === null
            ? [0, 1].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3.5">
                  <Skeleton className="size-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              ))
            : folders.map((f) => {
                const Icon = FOLDER_ICON[f.id] ?? FolderSync
                return (
                  <motion.button
                    key={f.id}
                    type="button"
                    onClick={() => start(f)}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-card"
                  >
                    <span className="grid size-10 place-items-center rounded-lg bg-surface-2 text-muted transition-colors group-hover:bg-primary-soft group-hover:text-primary">
                      <Icon className="size-[18px]" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium text-text">{f.name}</span>
                      <span className="block truncate text-[12px] text-faint">
                        {plural(f.fileCount, 'archivo', 'archivos')} · {formatBytes(f.size)}
                      </span>
                    </span>
                    <ArrowRight className="size-4 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </motion.button>
                )
              })}
        </div>
      </Panel>

      {/* Resumen */}
      <motion.div variants={list} initial="initial" animate="animate" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Archivos analizados', value: stats.analyzed },
          { label: 'Archivos organizados', value: stats.moved },
          { label: 'Carpetas creadas', value: stats.folders },
          { label: 'Enviados a revisión', value: stats.review },
        ].map((s) => (
          <motion.div key={s.label} variants={listItem}>
            <Panel className="px-4 py-3.5 shadow-none">
              <div className="text-[12px] text-muted">{s.label}</div>
              <AnimatedNumber value={s.value} className="mt-1 block text-[22px] font-semibold tracking-[-0.02em] text-text" />
            </Panel>
          </motion.div>
        ))}
      </motion.div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Actividad reciente */}
        <section>
          <SectionTitle
            action={
              <Button variant="ghost" size="sm" iconRight={ArrowRight} onClick={() => navigate('/historial')}>
                Ver historial
              </Button>
            }
          >
            Actividad reciente
          </SectionTitle>
          <Panel className="divide-y divide-border">
            {operations.length === 0 ? (
              <EmptyState icon={FolderSync} title="Sin actividad todavía" description="Cuando organices una carpeta, verás aquí cada operación y podrás deshacerla." />
            ) : (
              operations.slice(0, 5).map((op) => {
                const moved = op.moves.filter((m) => m.status === 'moved' || m.status === 'restored').length
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => navigate('/historial')}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-surface-2/60"
                  >
                    <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-muted">
                      <FolderSync className="size-4" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-text">
                        {op.kind === 'duplicates' ? 'Duplicados apartados' : `${folderName(op.source)} organizada`}
                      </span>
                      <span className="block text-[12px] text-faint">
                        {plural(moved, 'archivo', 'archivos')} · {formatRelative(op.createdAt)}
                      </span>
                    </span>
                    <OperationBadge status={op.status} />
                  </button>
                )
              })
            )}
          </Panel>
        </section>

        {/* Automatizaciones */}
        <section>
          <SectionTitle
            action={
              <Button variant="ghost" size="sm" iconRight={ArrowRight} onClick={() => navigate('/reglas')}>
                Reglas
              </Button>
            }
          >
            Automatizaciones
          </SectionTitle>
          <Panel className="p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-muted">Reglas activas</span>
              <span className="text-[13px] font-medium text-text tabular-nums">
                {activeRules.length} de {rules.length}
              </span>
            </div>
            <ul className="mt-3 space-y-1">
              {rules.slice(0, 4).map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-lg py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-text">{r.name}</div>
                    <div className="truncate text-[11.5px] text-faint">{r.conditions.map(describeCondition).join(' · ')}</div>
                  </div>
                  <Switch checked={r.enabled} onChange={() => toggle(r.id)} label={`Activar regla ${r.name}`} />
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-border-strong px-3 py-2.5">
              <Radar className="size-4 shrink-0 text-faint" strokeWidth={1.8} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium text-text">Monitoreo de carpetas</div>
                <div className="text-[11.5px] text-faint">Organizar Descargas al detectar archivos nuevos</div>
              </div>
              <Badge>Próximamente</Badge>
            </div>
          </Panel>
        </section>
      </div>
    </Page>
  )
}
