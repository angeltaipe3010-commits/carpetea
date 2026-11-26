import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, ChevronDown, Copy, FolderPlus, FolderSync, RotateCcw, RotateCcwClock, ShieldCheck, TriangleExclamationPoint } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Badge, EmptyState, Panel, Progress } from '@/components/ui/primitives'
import { OperationBadge, folderName } from '@/components/history/OperationBadge'
import { cn } from '@/lib/cn'
import { formatDateTime, formatRelative, plural } from '@/lib/format'
import { collapse, list, listItem } from '@/lib/motion'
import { api } from '@/services/api'
import { useHistory } from '@/stores/history'
import { toast } from '@/stores/toasts'
import type { ExecProgress, MoveRecord, Operation } from '@/types'

const canUndo = (op: Operation) => (op.status === 'completed' || op.status === 'partial') && !op.undoneAt && op.moves.some((m) => m.status === 'moved')

export default function History() {
  const navigate = useNavigate()
  const { operations, replace, clearSamples } = useHistory()
  const [open, setOpen] = useState<string | null>(operations[0]?.id ?? null)
  const [undoing, setUndoing] = useState<Operation | null>(null)
  const [progress, setProgress] = useState<ExecProgress | null>(null)
  const hasSamples = operations.some((o) => o.sample)

  const runUndo = async () => {
    if (!undoing) return
    setProgress({ done: 0, total: 1, current: '' })
    const result = await api.undo(undoing, setProgress)
    replace(result)
    setProgress(null)
    setUndoing(null)
    const restored = result.moves.filter((m) => m.status === 'restored').length
    const pending = result.moves.filter((m) => m.status === 'not_restored').length
    toast({
      tone: pending ? 'warning' : 'success',
      title: `${plural(restored, 'archivo restaurado', 'archivos restaurados')}`,
      description: pending ? `${plural(pending, 'archivo se dejó', 'archivos se dejaron')} donde está porque cambió después de organizarlo.` : 'Todo volvió a su ubicación original.',
    })
  }

  return (
    <Page>
      <PageHeader
        title="Historial"
        description="Cada operación queda registrada con sus movimientos. Deshacer comprueba cada archivo antes de devolverlo a su sitio."
        actions={
          hasSamples ? (
            <Button variant="ghost" size="sm" onClick={clearSamples}>
              Quitar operaciones de ejemplo
            </Button>
          ) : null
        }
      />

      {operations.length === 0 ? (
        <Panel>
          <EmptyState
            icon={RotateCcwClock}
            title="El historial está vacío"
            description="Cuando organices una carpeta o apartes duplicados, la operación aparecerá aquí y podrás deshacerla."
            action={
              <Button variant="primary" icon={FolderSync} onClick={() => navigate('/organizar')}>
                Organizar una carpeta
              </Button>
            }
          />
        </Panel>
      ) : (
        <motion.ul variants={list} initial="initial" animate="animate" className="space-y-2.5">
          {operations.map((op) => {
            const isOpen = open === op.id
            const moved = op.moves.filter((m) => m.status === 'moved' || m.status === 'restored' || m.status === 'not_restored')
            const Icon = op.kind === 'duplicates' ? Copy : FolderSync
            return (
              <motion.li key={op.id} variants={listItem}>
                <Panel className="overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : op.id)}
                    className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/50"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                      <Icon className="size-4" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium text-text">
                          {op.kind === 'duplicates' ? 'Duplicados apartados' : `Organización de ${folderName(op.source)}`}
                        </span>
                        {op.sample && <Badge>Ejemplo</Badge>}
                      </span>
                      <span className="block text-[12px] text-faint">
                        {formatDateTime(op.createdAt)} · {plural(moved.length, 'archivo', 'archivos')} · {plural(op.foldersCreated.length, 'carpeta nueva', 'carpetas nuevas')}
                      </span>
                    </span>
                    <OperationBadge status={op.status} />
                    <ChevronDown className={cn('size-4 text-faint transition-transform duration-200', isOpen && 'rotate-180')} />
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div variants={collapse} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                        <div className="border-t border-border px-4 py-4">
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-muted">
                            <span>
                              Origen: <span className="font-mono text-[11.5px] text-text">{op.source}</span>
                            </span>
                            {op.undoneAt && <span>Deshecha {formatRelative(op.undoneAt).toLowerCase()}</span>}
                            <span className="ml-auto">
                              {canUndo(op) ? (
                                <Button size="sm" icon={RotateCcw} onClick={() => setUndoing(op)} disabled={op.sample}>
                                  Deshacer
                                </Button>
                              ) : null}
                            </span>
                          </div>

                          {op.errors.length > 0 && (
                            <div className="mt-3 space-y-1 rounded-lg bg-warning-soft px-3.5 py-2.5">
                              {op.errors.map((e) => (
                                <p key={e} className="flex items-start gap-2 text-[12.5px] text-text">
                                  <TriangleExclamationPoint className="mt-0.5 size-3.5 shrink-0 text-warning" />
                                  {e}
                                </p>
                              ))}
                            </div>
                          )}

                          {op.foldersCreated.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              <FolderPlus className="size-3.5 text-faint" />
                              {op.foldersCreated.slice(0, 8).map((f) => (
                                <span key={f} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                                  {f}
                                </span>
                              ))}
                              {op.foldersCreated.length > 8 && <span className="text-[11.5px] text-faint">y {op.foldersCreated.length - 8} más</span>}
                            </div>
                          )}

                          <ul className="mt-3 max-h-[280px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                            {op.moves.slice(0, 60).map((m) => (
                              <MoveRow key={m.fileId} m={m} />
                            ))}
                          </ul>
                          {op.moves.length > 60 && <p className="mt-2 text-[12px] text-faint">Mostrando 60 de {op.moves.length} movimientos.</p>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Panel>
              </motion.li>
            )
          })}
        </motion.ul>
      )}

      <Dialog
        open={!!undoing}
        onClose={() => setUndoing(null)}
        locked={!!progress}
        title="Deshacer operación"
        description={undoing ? `Se devolverán ${plural(undoing.moves.filter((m) => m.status === 'moved').length, 'archivo', 'archivos')} a ${folderName(undoing.source)}.` : ''}
        width="sm"
        footer={
          progress ? null : (
            <>
              <Button onClick={() => setUndoing(null)}>Cancelar</Button>
              <Button variant="primary" icon={RotateCcw} onClick={runUndo}>
                Deshacer
              </Button>
            </>
          )
        }
      >
        {progress ? (
          <div>
            <p className="text-[13px] text-text tabular-nums">
              Verificando y restaurando · {progress.done} de {progress.total}
            </p>
            <Progress value={progress.total ? progress.done / progress.total : 0} label="Progreso de deshacer" className="mt-3" />
            <p className="mt-2 h-4 truncate font-mono text-[11px] text-faint">{progress.current}</p>
          </div>
        ) : (
          <ul className="space-y-1.5 text-[12.5px] text-muted">
            {[
              'Antes de mover cada archivo se comprueba que sigue en su destino y no ha cambiado.',
              'Si un archivo se modificó o movió después, se deja donde está y se informa.',
              'Si la ubicación original está ocupada, no se sobrescribe.',
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                {t}
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </Page>
  )
}

const MOVE_STATUS: Record<MoveRecord['status'], { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' | 'primary' }> = {
  moved: { label: 'Movido', tone: 'success' },
  restored: { label: 'Restaurado', tone: 'primary' },
  skipped: { label: 'Omitido', tone: 'neutral' },
  failed: { label: 'Error', tone: 'danger' },
  not_restored: { label: 'No restaurado', tone: 'warning' },
}

function MoveRow({ m }: { m: MoveRecord }) {
  const s = MOVE_STATUS[m.status]
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-[12px]">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-text">{m.name}</span>
        {m.to ? (
          <span className="flex min-w-0 items-center gap-1 text-faint">
            <span className="truncate">{m.from}</span>
            <ArrowRight className="size-3 shrink-0" />
            <span className="truncate">{m.to}</span>
          </span>
        ) : null}
        {m.note && <span className="block truncate text-faint">{m.note}</span>}
      </span>
      <Badge tone={s.tone}>{s.label}</Badge>
    </li>
  )
}
