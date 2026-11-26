import { motion } from 'motion/react'
import { Check, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Panel, Progress, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'
import { useOrganizer } from '@/stores/organizer'
import type { ScanPhase } from '@/types'

const PHASES: { key: ScanPhase; label: string; detail: string; from: number; to: number }[] = [
  { key: 'walking', label: 'Recorriendo directorios', detail: 'Listando archivos y subcarpetas', from: 0, to: 0.35 },
  { key: 'metadata', label: 'Leyendo metadatos', detail: 'Nombre, tamaño y fechas', from: 0.35, to: 0.6 },
  { key: 'rules', label: 'Aplicando reglas', detail: 'Tus automatizaciones primero', from: 0.6, to: 0.7 },
  { key: 'classifying', label: 'Clasificando', detail: 'Proponiendo carpetas y subcarpetas', from: 0.7, to: 1 },
]

export default function ScanStep() {
  const { scan, source, cancel } = useOrganizer()
  const idx = scan ? (scan.phase === 'done' ? PHASES.length : PHASES.findIndex((p) => p.key === scan.phase)) : 0
  const phase = PHASES[Math.min(idx, PHASES.length - 1)]
  const frac = scan && scan.total ? scan.processed / scan.total : 0
  const overall = scan?.phase === 'done' ? 1 : phase.from + (phase.to - phase.from) * frac

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-text">Analizando {source?.name}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted tabular-nums">
              {scan ? `${formatNumber(scan.processed)} de ${formatNumber(scan.total)} archivos` : 'Preparando…'}
            </p>
          </div>
          <span className="text-[20px] font-semibold tracking-[-0.02em] text-text tabular-nums">{Math.round(overall * 100)}%</span>
        </div>
        <Progress value={overall} label="Progreso del análisis" className="mt-4" />
        <p className="mt-2.5 h-4 truncate font-mono text-[11px] text-faint" title={scan?.current}>
          {scan?.current}
        </p>

        <ol className="mt-5 space-y-3.5">
          {PHASES.map((p, i) => {
            const done = i < idx
            const active = i === idx
            return (
              <li key={p.key} className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-px grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-300',
                    done ? 'bg-success-soft text-success' : active ? 'bg-primary-soft text-primary' : 'bg-surface-2 text-faint',
                  )}
                >
                  {done ? (
                    <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }}>
                      <Check className="size-3" strokeWidth={3} />
                    </motion.span>
                  ) : active ? (
                    <LoaderCircle className="size-3 animate-spin" strokeWidth={2.6} />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                </span>
                <div>
                  <div className={cn('text-[13px]', active ? 'font-medium text-text' : done ? 'text-text' : 'text-faint')}>{p.label}</div>
                  <div className="text-[11.5px] text-faint">{p.detail}</div>
                </div>
              </li>
            )
          })}
        </ol>

        <Button variant="secondary" icon={X} className="mt-6 w-full" onClick={cancel}>
          Cancelar análisis
        </Button>
      </Panel>

      {/* Esqueleto de la vista previa que viene a continuación */}
      <Panel aria-hidden className="grid grid-cols-[240px_1fr] overflow-hidden max-[900px]:grid-cols-1">
        <div className="space-y-2.5 border-r border-border p-4 max-[900px]:hidden">
          <Skeleton className="h-4 w-32" />
          {[90, 70, 76, 60, 84, 66, 72, 58].map((w, i) => (
            <Skeleton key={i} className="h-3.5" width={`${w}%`} />
          ))}
        </div>
        <div className="space-y-3 p-4">
          <Skeleton className="h-8 w-full rounded-lg" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
