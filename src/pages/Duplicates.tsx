import { useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Copy, FolderInput, ScanSearch, ShieldCheck, X } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Badge, EmptyState, Panel, Progress, Skeleton } from '@/components/ui/primitives'
import { AnimatedNumber } from '@/components/ui/feedback'
import { FileIcon } from '@/components/files/FileBits'
import { cn } from '@/lib/cn'
import { formatBytes, formatDateTime, plural } from '@/lib/format'
import { list, listItem } from '@/lib/motion'
import { api, isAbort, isNative } from '@/services/api'
import { categoryOf } from '@/services/classifier'
import { useHistory } from '@/stores/history'
import { toast } from '@/stores/toasts'
import type { DuplicateGroup, DuplicateProgress } from '@/types'

const PHASE_LABEL: Record<DuplicateProgress['phase'], string> = {
  sizes: 'Agrupando por tamaño',
  'partial-hash': 'Comparando el inicio de cada archivo',
  'full-hash': 'Verificando contenido completo (hash)',
  done: 'Listo',
}

type Keep = Record<string, string> // groupId → fileId que se conserva

export default function Duplicates() {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null)
  const [progress, setProgress] = useState<DuplicateProgress | null>(null)
  const [keep, setKeep] = useState<Keep>({})
  const [confirm, setConfirm] = useState(false)
  const [moving, setMoving] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const addOp = useHistory((s) => s.add)

  const scanning = progress !== null && progress.phase !== 'done'

  const scan = async () => {
    controller.current = new AbortController()
    setGroups(null)
    setProgress({ phase: 'sizes', processed: 0, total: 1 })
    try {
      const g = await api.findDuplicates(setProgress, controller.current.signal)
      // Sugerencia: conservar la copia más antigua (suele ser la original).
      const k: Keep = {}
      for (const grp of g) k[grp.id] = [...grp.files].sort((a, b) => a.modified.localeCompare(b.modified))[0].id
      setKeep(k)
      setGroups(g)
    } catch (e) {
      if (!isAbort(e)) toast({ tone: 'danger', title: 'No se pudo completar la búsqueda' })
    } finally {
      setProgress(null)
    }
  }

  const toMove = useMemo(() => (groups ?? []).flatMap((g) => g.files.filter((f) => f.id !== keep[g.id]).map((f) => f.id)), [groups, keep])
  const recoverable = useMemo(() => (groups ?? []).reduce((s, g) => s + g.size * (g.files.length - 1), 0), [groups])

  const quarantine = async () => {
    if (!groups) return
    setMoving(true)
    const op = await api.quarantineDuplicates(toMove, groups)
    addOp(op)
    setMoving(false)
    setConfirm(false)
    setGroups([])
    toast({ tone: 'success', title: `${plural(toMove.length, 'duplicado apartado', 'duplicados apartados')}`, description: 'Están en Por revisar/Duplicados. Puedes deshacerlo desde el Historial.' })
  }

  return (
    <Page>
      <PageHeader
        title="Duplicados"
        description="Encuentra archivos con contenido idéntico, aunque tengan nombres distintos. DeskFlow nunca los elimina: los aparta para que decidas."
        actions={
          groups && groups.length > 0 ? (
            <Button icon={ScanSearch} onClick={scan}>
              Buscar de nuevo
            </Button>
          ) : null
        }
      />

      {isNative ? (
        <Panel>
          <EmptyState
            icon={Copy}
            title="Llega en una próxima versión"
            description="La búsqueda real de duplicados (tamaño y hash del contenido) se implementa en la Fase 5. Por ahora DeskFlow no muestra datos de ejemplo aquí."
          />
        </Panel>
      ) : scanning ? (
        <Panel className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-text">{PHASE_LABEL[progress.phase]}</h2>
              <p className="mt-0.5 text-[12.5px] text-muted tabular-nums">
                {progress.processed} de {progress.total} archivos
              </p>
            </div>
            <Button variant="ghost" size="sm" icon={X} onClick={() => controller.current?.abort()}>
              Cancelar
            </Button>
          </div>
          <Progress value={progress.total ? progress.processed / progress.total : 0} label="Progreso de la búsqueda" className="mt-4" />
          <div className="mt-6 space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[92px] rounded-xl" />
            ))}
          </div>
        </Panel>
      ) : groups === null ? (
        <Panel>
          <EmptyState
            icon={Copy}
            title="Busca archivos repetidos"
            description="Se comparan primero los tamaños y después el contenido con un hash, solo cuando hace falta. Así es rápido incluso con miles de archivos."
            action={
              <Button variant="primary" icon={ScanSearch} onClick={scan}>
                Buscar duplicados
              </Button>
            }
          />
        </Panel>
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyState icon={ShieldCheck} title="No quedan duplicados" description="Las copias que apartaste están en Por revisar/Duplicados." action={<Button icon={ScanSearch} onClick={scan}>Buscar de nuevo</Button>} />
        </Panel>
      ) : (
        <>
          <Panel className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
            <div>
              <div className="text-[12px] text-muted">Grupos</div>
              <AnimatedNumber value={groups.length} className="text-[20px] font-semibold text-text" />
            </div>
            <div>
              <div className="text-[12px] text-muted">Copias a apartar</div>
              <AnimatedNumber value={toMove.length} className="text-[20px] font-semibold text-text" />
            </div>
            <div>
              <div className="text-[12px] text-muted">Espacio recuperable</div>
              <AnimatedNumber value={recoverable} format={(n) => formatBytes(n)} className="text-[20px] font-semibold text-text" />
            </div>
            <Button variant="primary" icon={FolderInput} className="ml-auto" disabled={!toMove.length} onClick={() => setConfirm(true)}>
              Apartar {plural(toMove.length, 'copia', 'copias')}
            </Button>
          </Panel>

          <motion.div variants={list} initial="initial" animate="animate" className="space-y-3">
            {groups.map((g) => (
              <motion.section key={g.id} variants={listItem}>
                <Panel className="overflow-hidden">
                  <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                    <span className="text-[13px] font-medium text-text">{plural(g.files.length, 'archivo idéntico', 'archivos idénticos')}</span>
                    <span className="text-[12px] text-faint">· {formatBytes(g.size)} cada uno</span>
                    <span className="ml-auto font-mono text-[11px] text-faint">hash {g.hash}</span>
                  </header>
                  <ul role="radiogroup" aria-label="Copia que se conserva">
                    {g.files.map((f) => {
                      const kept = keep[g.id] === f.id
                      const dot = f.name.lastIndexOf('.')
                      const ext = dot > 0 ? f.name.slice(dot + 1).toLowerCase() : ''
                      return (
                        <li key={f.id}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={kept}
                            onClick={() => setKeep((k) => ({ ...k, [g.id]: f.id }))}
                            className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors', kept ? 'bg-success-soft/50' : 'hover:bg-surface-2/60')}
                          >
                            <span className={cn('grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors', kept ? 'border-success' : 'border-border-strong')}>
                              {kept && <motion.span layoutId={`keep-${g.id}`} className="size-1.5 rounded-full bg-success" />}
                            </span>
                            <FileIcon category={categoryOf(ext)} ext={ext} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] text-text">{f.name}</span>
                              <span className="block truncate font-mono text-[11px] text-faint">{f.path}</span>
                            </span>
                            <span className="text-[12px] text-faint tabular-nums max-[700px]:hidden">{formatDateTime(f.modified)}</span>
                            {kept ? <Badge tone="success">Se conserva</Badge> : <Badge>Se aparta</Badge>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </Panel>
              </motion.section>
            ))}
          </motion.div>
        </>
      )}

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        locked={moving}
        title={`Apartar ${plural(toMove.length, 'copia', 'copias')}`}
        description="Se moverán a la carpeta Por revisar/Duplicados. No se elimina nada."
        width="sm"
        footer={
          <>
            <Button onClick={() => setConfirm(false)} disabled={moving}>
              Cancelar
            </Button>
            <Button variant="primary" icon={FolderInput} onClick={quarantine} disabled={moving}>
              {moving ? 'Moviendo…' : 'Apartar copias'}
            </Button>
          </>
        }
      >
        <ul className="space-y-1.5 text-[12.5px] text-muted">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
            Se conserva una copia de cada grupo en su ubicación actual.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
            Podrás recuperar {formatBytes(recoverable)} cuando revises y borres las copias tú mismo.
          </li>
        </ul>
      </Dialog>
    </Page>
  )
}
