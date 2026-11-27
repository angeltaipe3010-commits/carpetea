import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Check, FolderInput, FolderOpen, FolderSearch, ScanSearch, ShieldCheck, X } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Badge, EmptyState, Panel, Progress, Skeleton } from '@/components/ui/primitives'
import { AnimatedNumber } from '@/components/ui/feedback'
import { FileIcon } from '@/components/files/FileBits'
import { cn } from '@/lib/cn'
import { formatBytes, formatDateTime, plural } from '@/lib/format'
import { list, listItem } from '@/lib/motion'
import { api, isAbort } from '@/services/api'
import { categoryOf } from '@/services/classifier'
import { useHistory } from '@/stores/history'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/toasts'
import type { DuplicateGroup, DuplicateProgress, DuplicateSearch, SourceFolder } from '@/types'
import { winJoin } from '@/utils/destination'

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
  const addManaged = useHistory((s) => s.addManaged)
  const reviewFolder = useSettings((s) => s.reviewFolderName)
  const exclusions = useSettings((s) => s.exclusions)
  const [info, setInfo] = useState<Omit<DuplicateSearch, 'groups'> | null>(null)
  const [folders, setFolders] = useState<SourceFolder[] | null>(null)
  const [root, setRoot] = useState<SourceFolder | null>(null)
  const quarantinePath = root ? winJoin(root.path, reviewFolder, 'Duplicados') : ''

  useEffect(() => {
    api
      .listSuggestedFolders()
      .then((list) => {
        setFolders(list)
        setRoot((r) => r ?? list[0] ?? null)
      })
      .catch(() => setFolders([]))
    // Al salir de la pantalla se detiene la búsqueda en curso.
    return () => controller.current?.abort()
  }, [])

  const browse = async () => {
    try {
      const picked = await api.pickFolder('Elegir carpeta donde buscar duplicados', root?.path)
      if (!picked) return
      if (picked.problem) return toast({ tone: 'danger', title: 'No se puede usar esa carpeta', description: picked.problem })
      const folder: SourceFolder = { id: picked.path, name: picked.name, path: picked.path, fileCount: -1, size: 0 }
      setFolders((fs) => (fs && !fs.some((f) => f.id === folder.id) ? [...fs, folder] : fs))
      setRoot(folder)
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo abrir el selector', description: e instanceof Error ? e.message : String(e) })
    }
  }

  const scanning = progress !== null && progress.phase !== 'done'

  const scan = async () => {
    if (!root) return
    controller.current = new AbortController()
    setGroups(null)
    setProgress({ phase: 'sizes', processed: 0, total: 1 })
    try {
      const { groups: g, ...rest } = await api.findDuplicates(root.path, [quarantinePath], exclusions, setProgress, controller.current.signal)
      setInfo(rest)
      // Sugerencia: conservar la copia más antigua (suele ser la original).
      const k: Keep = {}
      for (const grp of g) k[grp.id] = [...grp.files].sort((a, b) => a.modified.localeCompare(b.modified))[0].id
      setKeep(k)
      setGroups(g)
    } catch (e) {
      if (!isAbort(e))
        toast({ tone: 'danger', title: 'No se pudo completar la búsqueda', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setProgress(null)
    }
  }

  const toMove = useMemo(() => (groups ?? []).flatMap((g) => g.files.filter((f) => f.id !== keep[g.id]).map((f) => f.id)), [groups, keep])
  const recoverable = useMemo(() => (groups ?? []).reduce((s, g) => s + g.size * (g.files.length - 1), 0), [groups])

  const quarantine = async () => {
    if (!groups || !root) return
    setMoving(true)
    try {
      const op = await api.quarantineDuplicates(toMove, groups, root.path, reviewFolder)
      addOp(op)
      addManaged(op.foldersCreated)
      const moved = new Set(op.moves.filter((m) => m.status === 'moved').map((m) => m.fileId))
      const failed = op.moves.length - moved.size
      // Quedan a la vista solo los grupos que siguen teniendo copias.
      setGroups(groups.map((g) => ({ ...g, files: g.files.filter((f) => !moved.has(f.id)) })).filter((g) => g.files.length > 1))
      toast({
        tone: failed ? 'warning' : 'success',
        title: plural(moved.size, 'duplicado apartado', 'duplicados apartados'),
        description: failed
          ? `${plural(failed, 'copia no se movió', 'copias no se movieron')} (en uso o cambiaron). Míralo en el Historial.`
          : `Están en ${reviewFolder}/Duplicados. Puedes deshacerlo desde el Historial.`,
      })
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudieron apartar las copias', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setMoving(false)
      setConfirm(false)
    }
  }

  return (
    <Page>
      <PageHeader
        title="Duplicados"
        description="Encuentra archivos con contenido idéntico, aunque tengan nombres distintos. Carpetea nunca los elimina: los aparta para que decidas."
        actions={
          groups && groups.length > 0 ? (
            <Button icon={ScanSearch} onClick={() => setGroups(null)}>
              Buscar de nuevo
            </Button>
          ) : null
        }
      />

      {scanning ? (
        <Panel className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-text">{PHASE_LABEL[progress.phase]}</h2>
              <p className="mt-0.5 text-[12.5px] text-muted tabular-nums">
                {progress.phase === 'sizes' ? `${progress.processed} archivos revisados` : `${progress.processed} de ${progress.total} archivos`}
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
        <Panel className="p-5">
          <h2 className="text-[14px] font-semibold text-text">¿Dónde buscar duplicados?</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Se comparan primero los tamaños y después el contenido con un hash, solo cuando hace falta. Nada se mueve sin tu confirmación.
          </p>
          <div role="radiogroup" aria-label="Carpeta donde buscar" className="mt-4 grid gap-2.5">
            {folders === null
              ? [0, 1].map((i) => <Skeleton key={i} className="h-[58px] rounded-xl" />)
              : folders.map((f) => {
                  const selected = root?.id === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setRoot(f)}
                      className={cn(
                        'flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color] duration-200',
                        selected ? 'border-primary bg-primary-soft/60' : 'border-border hover:border-border-strong hover:bg-surface-2/50',
                      )}
                    >
                      <FolderOpen className={cn('size-[18px] shrink-0', selected ? 'text-primary' : 'text-muted')} strokeWidth={1.8} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-text">{f.name}</span>
                        <span className="block truncate font-mono text-[11.5px] text-faint" title={f.path}>
                          {f.path}
                        </span>
                      </span>
                      {selected && <Check className="size-4 shrink-0 text-primary" strokeWidth={2.5} />}
                    </button>
                  )
                })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button icon={FolderSearch} onClick={browse}>
              Examinar…
            </Button>
            <Button variant="primary" icon={ScanSearch} className="ml-auto" onClick={scan} disabled={!root}>
              {root ? `Buscar duplicados en ${root.name}` : 'Elige una carpeta'}
            </Button>
          </div>
        </Panel>
      ) : groups.length === 0 ? (
        <Panel>
          <SearchNotice info={info} reviewFolder={reviewFolder} className="m-4 mb-0" />
          <EmptyState
            icon={ShieldCheck}
            title="No hay duplicados"
            description={`No quedan copias idénticas en ${root?.name ?? 'esta carpeta'}. Lo que apartes queda en ${reviewFolder}/Duplicados.`}
            action={
              <Button icon={ScanSearch} onClick={() => setGroups(null)}>
                Buscar en otra carpeta
              </Button>
            }
          />
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

          <SearchNotice info={info} reviewFolder={reviewFolder} />
          <motion.div variants={list} initial="initial" animate="animate" className="space-y-3">
            {groups.map((g) => (
              <motion.section key={g.id} variants={listItem}>
                <Panel className="overflow-hidden">
                  <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                    <span className="text-[13px] font-medium text-text">{plural(g.files.length, 'archivo idéntico', 'archivos idénticos')}</span>
                    <span className="text-[12px] text-faint">· {formatBytes(g.size)} cada uno</span>
                    <span className="ml-auto font-mono text-[11px] text-faint" title={g.hash}>
                      hash {g.hash.slice(0, 12)}
                    </span>
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
        description={`Se moverán a ${quarantinePath}. No se elimina nada.`}
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
        {info?.cloud && (
          <p role="alert" className="mb-3 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-[12.5px] text-text">
            {root?.name} se sincroniza con {info.cloud}: la carpeta {reviewFolder}/Duplicados y los cambios también se sincronizarán.
          </p>
        )}
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

/** Lo que no se pudo comparar: nunca se oculta (un «no hay duplicados» podría no ser cierto). */
function SearchNotice({
  info,
  reviewFolder,
  className,
}: {
  info: Omit<DuplicateSearch, 'groups'> | null
  reviewFolder: string
  className?: string
}) {
  if (!info) return null
  const parts = [
    info.skippedCloud && `${plural(info.skippedCloud, 'archivo está', 'archivos están')} solo en la nube y no se abrieron para no descargarlos`,
    info.skippedUnreadable && `${plural(info.skippedUnreadable, 'archivo no se pudo', 'archivos no se pudieron')} leer (en uso o sin permiso)`,
    info.skippedDenied && `${plural(info.skippedDenied, 'elemento', 'elementos')} sin acceso`,
  ].filter(Boolean)
  return (
    <div className={cn('mb-4 rounded-xl border border-border bg-surface-2/60 px-4 py-3 text-[12.5px] text-muted', className)}>
      Se revisaron {plural(info.scanned, 'archivo', 'archivos')}. No se tocan carpetas de programas o proyectos de código, tus exclusiones ni {reviewFolder}/Duplicados.
      {parts.length > 0 && <span className="mt-1 block text-text">Sin comparar: {parts.join('; ')}.</span>}
    </div>
  )
}
