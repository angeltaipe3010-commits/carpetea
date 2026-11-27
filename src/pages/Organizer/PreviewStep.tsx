import { folderNameProblem } from '@/utils/names'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  CircleExclamationPoint,
  Cloud,
  CornerDownRight,
  EyeOff,
  FolderCheck,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Info,
  LoaderCircle,
  FolderSync,
  Hand,
  RotateCcw,
  Search,
  ShieldCheck,
  Undo2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Badge, EmptyState, Input, Label, Panel, Segmented, Select } from '@/components/ui/primitives'
import { FolderTree, DRAG_MIME } from '@/components/folders/FolderTree'
import { DestinationField, destinationCloud, destinationReady } from '@/components/folders/DestinationField'
import { useDraft } from '@/hooks/useDraft'
import { ConfidenceBadge, FileIcon } from '@/components/files/FileBits'
import { cn } from '@/lib/cn'
import { formatBytes, formatDuration, formatNumber, plural } from '@/lib/format'
import { ease } from '@/lib/motion'
import { useOrganizer } from '@/stores/organizer'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/toasts'
import type { Classification, Confidence, Conflict, FileEntry } from '@/types'
import { baseName, structureRoots } from '@/utils/destination'
import { api } from '@/services/api'
import { librariesOf, useEnv } from '@/stores/env'
import { buildPlan, buildTree, findConflicts, flattenFolders, joinPath } from '@/utils/plan'

type Filter = 'all' | Confidence | 'conflicts' | 'excluded'
const PAGE = 300

export default function PreviewStep() {
  const o = useOrganizer()
  const reviewName = useSettings((s) => s.reviewFolderName)
  const destination = useSettings((s) => s.destination)
  const setSettings = useSettings((s) => s.set)
  const [changingDest, setChangingDest] = useState(false)
  const useStructure = useSettings((s) => s.useStructure)
  const env = useEnv((s) => s.env)

  // Permiso del motor sobre el destino. Sin él, organizar fallaría archivo por archivo.
  const destRoots = useMemo(
    () => (o.source ? structureRoots(destination, o.source.path, librariesOf(env)).map((r) => r.root) : []),
    [destination, o.source, env],
  )
  const [missing, setMissing] = useState<string[] | null>(null)
  const checkAccess = async () => {
    const ok = await api.checkAccess(destRoots)
    setMissing(destRoots.filter((_, i) => !ok[i]))
  }
  useEffect(() => {
    void checkAccess()
  }, [destRoots.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const regrant = async (path: string) => {
    try {
      const picked = await api.pickFolder(`Vuelve a elegir ${baseName(path)} para dar permiso a Carpetea`, path)
      if (!picked) return
      if (picked.problem) return toast({ tone: 'danger', title: 'No se puede usar esa carpeta', description: picked.problem })
      if (picked.path.toLowerCase() !== path.toLowerCase()) {
        // Eligió otra carpeta: pasa a ser el destino (y si está en la nube, se pedirá confirmación).
        setSettings({ destination: { mode: 'custom', customPath: picked.path, cloudProvider: picked.cloud, allowCloud: false } })
      }
      await checkAccess()
      void o.applyStructure()
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo abrir el selector', description: e instanceof Error ? e.message : String(e) })
    }
  }
  const accessOk = missing !== null && missing.length === 0

  // Al cambiar el destino o la opción, se vuelve a aprender la estructura (el análisis ya lo hizo la primera vez).
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    void o.applyStructure()
  }, [destination, useStructure]) // eslint-disable-line react-hooks/exhaustive-deps
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [checked, setChecked] = useState<Record<string, true>>({})
  const [dragging, setDragging] = useState(false)
  const [newFolderIn, setNewFolderIn] = useState<string | null>(null)
  // Volver a analizar o cambiar de carpeta descarta lo que el usuario cambió a mano.
  const [discard, setDiscard] = useState<null | 'rescan' | 'source'>(null)
  const edited = Object.keys(o.manual).length + Object.keys(o.excluded).length + o.extraFolders.length > 0
  const runDiscard = (what: 'rescan' | 'source') => {
    setDiscard(null)
    if (what === 'rescan') void o.startScan()
    else o.reset()
  }
  const askDiscard = (what: 'rescan' | 'source') => (edited ? setDiscard(what) : runDiscard(what))
  const [confirming, setConfirming] = useState(false)

  const draft = useDraft()
  const tree = useMemo(() => buildTree(draft), [draft])
  const conflicts = useMemo(() => findConflicts(draft), [draft])
  const cloud = destinationCloud(destination)
  const destLabel =
    destination.mode === 'libraries' ? 'Bibliotecas de Windows' : destination.mode === 'custom' ? baseName(destination.customPath) : `${o.source?.name} (misma carpeta)`
  const folders = useMemo(() => flattenFolders(tree), [tree])
  const byId = useMemo(() => new Map(o.files.map((f) => [f.id, f])), [o.files])

  const counts = useMemo(() => {
    const c = { all: 0, high: 0, medium: 0, low: 0, conflicts: Object.keys(conflicts).length, excluded: Object.keys(o.excluded).length }
    for (const f of o.files) {
      if (o.excluded[f.id]) continue
      c.all++
      c[o.plan[f.id].confidence]++
    }
    return c
  }, [o.files, o.plan, o.excluded, conflicts])

  const newFolders = folders.filter((f) => f.isNew).length
  const inYours = o.files.filter((f) => !o.excluded[f.id] && o.plan[f.id]?.via && o.plan[f.id].via !== 'course').length

  // Archivos visibles: subárbol seleccionado + filtro + búsqueda.
  const visible = useMemo(() => {
    const prefix = o.selectedPath
    const q = query.trim().toLowerCase()
    return o.files.filter((f) => {
      const excluded = !!o.excluded[f.id]
      if (filter === 'excluded') return excluded && (!q || f.name.toLowerCase().includes(q))
      if (excluded) return false
      const dest = joinPath(o.plan[f.id].dest)
      if (prefix && dest !== prefix && !dest.startsWith(prefix + '/')) return false
      if (filter === 'conflicts' && !conflicts[f.id]) return false
      if ((filter === 'high' || filter === 'medium' || filter === 'low') && o.plan[f.id].confidence !== filter) return false
      return !q || f.name.toLowerCase().includes(q)
    })
  }, [o.files, o.excluded, o.plan, o.selectedPath, filter, query, conflicts])

  const checkedIds = useMemo(() => visible.filter((f) => checked[f.id]).map((f) => f.id), [visible, checked])
  // La lista se pinta por tandas: miles de filas a la vez bloquean la interfaz.
  // La tanda vuelve a empezar al cambiar de vista (filtro, búsqueda o carpeta).
  const viewKey = `${filter}|${query}|${o.selectedPath}`
  const [page, setPage] = useState({ key: viewKey, n: PAGE })
  const limit = page.key === viewKey ? page.n : PAGE
  const showMore = () => setPage({ key: viewKey, n: limit + PAGE })
  const shown = visible.length > limit ? visible.slice(0, limit) : visible
  const checkedRef = useRef(checkedIds)
  useEffect(() => {
    checkedRef.current = checkedIds
  }, [checkedIds])
  const onCheck = useCallback(
    (id: string) =>
      setChecked((s) => {
        const n = { ...s }
        if (n[id]) delete n[id]
        else n[id] = true
        return n
      }),
    [],
  )
  const dragIdsFor = useCallback((id: string) => (checkedRef.current.includes(id) ? checkedRef.current : [id]), [])
  const goTo = o.select
  const allChecked = visible.length > 0 && checkedIds.length === visible.length

  const moveTo = (ids: string[], path: string) => {
    if (!ids.length) return
    o.moveFiles(ids, path.split('/'))
    setChecked({})
    toast({ tone: 'success', title: `${plural(ids.length, 'archivo', 'archivos')} → ${path.split('/').pop()}`, description: 'Se marcaron como asignados manualmente.' })
  }

  const selectedLabel = o.selectedPath ? o.selectedPath.split('/') : []

  return (
    <>
      {/* Resumen y filtros */}
      <Panel className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
        <Stat label="Archivos" value={formatNumber(counts.all)} />
        <Stat label="Carpetas nuevas" value={formatNumber(newFolders)} />
        {o.structure.status !== 'off' && (
          <div title={o.structure.error}>
            <div className="text-[11.5px] text-faint">En tus carpetas</div>
            <div className="flex items-center gap-1.5 text-[15px] font-semibold text-text tabular-nums">
              {o.structure.status === 'loading' ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin text-primary" />
                  <span className="text-[12.5px] font-normal text-muted">Aprendiendo…</span>
                </>
              ) : o.structure.status === 'error' ? (
                <span className="text-[12.5px] font-normal text-danger">No disponible</span>
              ) : (
                formatNumber(inYours)
              )}
            </div>
          </div>
        )}
        <Stat label="Analizado en" value={formatDuration(o.scanMs)} />
        <button
          type="button"
          onClick={() => setChangingDest(true)}
          className="group -my-1 flex min-w-0 items-center gap-2.5 rounded-lg border border-border px-3 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
        >
          {cloud.length ? (
            <Cloud className="size-4 shrink-0 text-warning" strokeWidth={1.8} />
          ) : (
            <FolderOpen className="size-4 shrink-0 text-primary" strokeWidth={1.8} />
          )}
          <span className="min-w-0">
            <span className="block text-[11.5px] text-faint">{cloud.length ? `Destino · en ${cloud.join(' y ')}` : 'Destino'}</span>
            <span className="block max-w-[220px] truncate text-[13px] font-medium text-text" title={draft.resolve.label}>
              {destLabel}
            </span>
          </span>
          <span className="text-[12px] text-primary opacity-0 transition-opacity group-hover:opacity-100">Cambiar</span>
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => askDiscard('source')}>
            Cambiar carpeta
          </Button>
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => askDiscard('rescan')}>
            Volver a analizar
          </Button>
          <Button variant="primary" iconRight={ArrowRight} onClick={() => setConfirming(true)} disabled={counts.all === 0 || !destinationReady(destination) || !accessOk}>
            Revisar y confirmar
          </Button>
        </div>
      </Panel>

      {missing && missing.length > 0 && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3">
          <CircleExclamationPoint className="size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 text-[13px] text-text">
            <span className="font-medium">Carpetea no tiene permiso para usar {missing.map((m) => baseName(m)).join(', ')}.</span>{' '}
            <span className="text-muted">Por seguridad solo usa carpetas que eliges en el selector de Windows. Vuelve a elegirla para continuar.</span>
          </div>
          {missing.map((m) => (
            <Button key={m} size="sm" variant="primary" icon={FolderOpen} onClick={() => regrant(m)}>
              Elegir {baseName(m)}
            </Button>
          ))}
        </div>
      )}

      {accessOk && o.structure.status === 'error' && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
          <CircleExclamationPoint className="size-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1 text-[13px] text-text">
            <span className="font-medium">No se pudo leer la estructura de tu destino.</span> <span className="text-muted">{o.structure.error}</span>
          </div>
          <Button size="sm" icon={RotateCcw} onClick={() => void o.applyStructure()}>
            Reintentar
          </Button>
        </div>
      )}

      {o.skippedManaged > 0 && (
        <p className="mb-4 flex items-center gap-2 px-1 text-[12.5px] text-muted">
          <Info className="size-3.5 shrink-0 text-primary" />
          Se omitieron {plural(o.skippedManaged, 'archivo que ya está', 'archivos que ya están')} en carpetas organizadas por Carpetea.
        </p>
      )}

      <div className="grid min-h-[560px] gap-4 lg:grid-cols-[300px_1fr]">
        {/* Árbol */}
        <Panel className="flex flex-col overflow-hidden">
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <h2 className="text-[13px] font-semibold text-text">Estructura propuesta</h2>
            <Button variant="ghost" size="sm" icon={FolderPlus} aria-label="Nueva carpeta" title="Nueva carpeta" onClick={() => setNewFolderIn(o.selectedPath)} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <FolderTree
              root={tree}
              rootLabel={destination.mode === 'source' ? o.source?.name ?? 'Origen' : destLabel}
              selected={o.selectedPath}
              onSelect={(p) => {
                o.select(p)
                if (filter === 'excluded') setFilter('all')
              }}
              onDropFiles={(ids, path) => {
                setDragging(false)
                moveTo(ids, path)
              }}
              onRename={o.renameFolder}
              onCreate={(p) => setNewFolderIn(p)}
              reviewName={reviewName}
              hint={draft.resolve.hint}
            />
          </div>
          <AnimatePresence>
            {dragging && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-border bg-primary-soft"
              >
                <p className="flex items-center gap-2 px-4 py-2.5 text-[12px] font-medium text-primary">
                  <Hand className="size-3.5" /> Suelta sobre una carpeta para moverlos allí
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <p className="border-t border-border px-4 py-2.5 text-[11.5px] leading-snug text-faint">
            Doble clic o F2 para renombrar. Arrastra archivos sobre una carpeta.
          </p>
        </Panel>

        {/* Archivos */}
        <Panel className="flex min-w-0 flex-col overflow-hidden">
          <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
            <nav aria-label="Ruta" className="flex min-w-0 flex-1 items-center gap-1 text-[13px]">
              <button type="button" className={cn('truncate', selectedLabel.length ? 'text-muted hover:text-text' : 'font-semibold text-text')} onClick={() => o.select('')}>
                {destination.mode === 'source' ? o.source?.name : destLabel}
              </button>
              {selectedLabel.map((seg, i) => (
                <span key={i} className="flex min-w-0 items-center gap-1">
                  <ChevronRight className="size-3.5 shrink-0 text-faint" />
                  <button
                    type="button"
                    onClick={() => o.select(selectedLabel.slice(0, i + 1).join('/'))}
                    className={cn('truncate', i === selectedLabel.length - 1 ? 'font-semibold text-text' : 'text-muted hover:text-text')}
                  >
                    {seg}
                  </button>
                </span>
              ))}
            </nav>
            <div className="relative w-56 max-[1100px]:w-40">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar archivo" aria-label="Buscar archivo" className="h-8 pl-8 text-[13px]" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
            {(
              [
                ['all', 'Todos', counts.all],
                ['high', 'Alta confianza', counts.high],
                ['medium', 'Requiere revisión', counts.medium],
                ['low', 'Sin clasificar', counts.low],
                ['conflicts', 'Conflictos', counts.conflicts],
                ['excluded', 'Excluidos', counts.excluded],
              ] as [Filter, string, number][]
            )
              .filter(([key, , n]) => !((key === 'conflicts' || key === 'excluded') && n === 0 && filter !== key))
              .map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors duration-150',
                  filter === key ? 'border-primary/30 bg-primary-soft text-primary' : 'border-border text-muted hover:border-border-strong hover:text-text',
                )}
              >
                {label}
                <span className="tabular-nums opacity-70">{n}</span>
              </button>
            ))}
          </div>

          {/* Barra de selección múltiple */}
          <AnimatePresence initial={false}>
            {checkedIds.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1, transition: { duration: 0.2, ease: ease.out } }}
                exit={{ height: 0, opacity: 0, transition: { duration: 0.14 } }}
                className="overflow-hidden border-b border-border bg-surface-2/60"
              >
                <div className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <span className="text-[12.5px] font-medium text-text">{plural(checkedIds.length, 'seleccionado', 'seleccionados')}</span>
                  <Select
                    aria-label="Mover seleccionados a"
                    value=""
                    onChange={(e) => e.target.value && moveTo(checkedIds, e.target.value)}
                    className="h-8 w-56 text-[12.5px]"
                  >
                    <option value="">Mover a…</option>
                    {folders.map((f) => (
                      <option key={f.path} value={f.path}>
                        {'  '.repeat(f.depth - 1)}
                        {f.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={filter === 'excluded' ? Undo2 : EyeOff}
                    onClick={() => {
                      o.setExcluded(checkedIds, filter !== 'excluded')
                      setChecked({})
                    }}
                  >
                    {filter === 'excluded' ? 'Incluir' : 'Excluir'}
                  </Button>
                  <Button size="sm" variant="ghost" icon={X} className="ml-auto" onClick={() => setChecked({})}>
                    Limpiar
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3 border-b border-border px-4 py-1.5 text-[11.5px] font-medium text-faint">
            <input
              type="checkbox"
              aria-label="Seleccionar todos"
              checked={allChecked}
              onChange={() => setChecked(allChecked ? {} : Object.fromEntries(visible.map((f) => [f.id, true as const])))}
              className="size-3.5 accent-[var(--df-primary)]"
            />
            <span className="flex-1">{plural(visible.length, 'archivo', 'archivos')}</span>
            <span className="w-[150px] text-right max-[1100px]:hidden">Confianza</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" style={{ maxHeight: 620 }}>
            {visible.length === 0 ? (
              <EmptyState
                icon={filter === 'excluded' ? EyeOff : FolderSync}
                title={query ? 'Sin resultados' : filter === 'excluded' ? 'No hay archivos excluidos' : 'Carpeta vacía'}
                description={
                  query
                    ? `Ningún archivo coincide con “${query}” en esta vista.`
                    : filter === 'excluded'
                      ? 'Los archivos que excluyas se quedarán donde están.'
                      : 'Arrastra archivos aquí desde otra carpeta del árbol o elige otra vista.'
                }
              />
            ) : (
              <>
                <ul>
                  {shown.map((f) => (
                    <FileRow
                      key={f.id}
                      file={f}
                      c={o.plan[f.id]}
                      isExcluded={!!o.excluded[f.id]}
                      checked={!!checked[f.id]}
                      onCheck={onCheck}
                      onDragState={setDragging}
                      dragIdsFor={dragIdsFor}
                      onGoTo={goTo}
                      cf={conflicts[f.id]}
                    />
                  ))}
                </ul>
                {visible.length > shown.length && (
                  <div className="flex items-center justify-center gap-3 border-t border-border px-4 py-3 text-[12.5px] text-muted">
                    Mostrando {formatNumber(shown.length)} de {formatNumber(visible.length)}
                    <Button size="sm" onClick={showMore}>
                      Mostrar {formatNumber(Math.min(PAGE, visible.length - shown.length))} más
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </Panel>
      </div>

      <Dialog
        open={changingDest}
        onClose={() => setChangingDest(false)}
        title="¿Dónde guardar lo organizado?"
        description="La vista previa se actualiza al momento. Local por defecto; la nube solo si la confirmas."
        footer={
          <Button variant="primary" onClick={() => setChangingDest(false)} disabled={!destinationReady(destination)}>
            Listo
          </Button>
        }
      >
        <DestinationField value={destination} onChange={(d) => setSettings({ destination: d })} sourceName={o.source?.name} />
      </Dialog>

      <Dialog
        open={discard !== null}
        onClose={() => setDiscard(null)}
        title="¿Descartar tus cambios?"
        description="Se perderán las carpetas que moviste, renombraste o creaste y los archivos que excluiste en esta vista previa. No se toca ningún archivo."
        width="sm"
        footer={
          <>
            <Button onClick={() => setDiscard(null)} data-autofocus>
              Seguir editando
            </Button>
            <Button variant="danger" onClick={() => discard && runDiscard(discard)}>
              {discard === 'source' ? 'Descartar y cambiar carpeta' : 'Descartar y volver a analizar'}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">
          {plural(Object.keys(o.manual).length, 'archivo reasignado', 'archivos reasignados')} ·{' '}
          {plural(Object.keys(o.excluded).length, 'excluido', 'excluidos')} · {plural(o.extraFolders.length, 'carpeta nueva', 'carpetas nuevas')}
        </p>
      </Dialog>

      <NewFolderDialog
        parent={newFolderIn}
        rootName={o.source?.name ?? ''}
        onClose={() => setNewFolderIn(null)}
        onCreate={(name) => {
          o.createFolder(newFolderIn ?? '', name)
          setNewFolderIn(null)
        }}
      />

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        counts={counts}
        newFolders={newFolders}
        onConfirm={() => {
          const plan = buildPlan(draft, conflicts, o.policy, o.source!.id, o.source!.path)
          setConfirming(false)
          o.execute(plan)
        }}
        planSize={(policy) => buildPlan(draft, conflicts, policy, o.source!.id, o.source!.path).moves.length}
        sampleFolders={folders.filter((f) => f.isNew).slice(0, 6).map((f) => f.path)}
        destinationLabel={draft.resolve.label}
        cloud={destination.allowCloud ? cloud : []}
        byId={byId}
        conflictIds={Object.keys(conflicts)}
      />
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11.5px] text-faint">{label}</div>
      <div className="text-[15px] font-semibold text-text tabular-nums">{value}</div>
    </div>
  )
}

const FileRow = memo(function FileRow({
  file,
  c,
  isExcluded,
  checked,
  onCheck,
  onDragState,
  dragIdsFor,
  onGoTo,
  cf,
}: {
  file: FileEntry
  c: Classification
  isExcluded: boolean
  cf?: Conflict
  checked: boolean
  onCheck: (id: string) => void
  onDragState: (v: boolean) => void
  dragIdsFor: (id: string) => string[]
  onGoTo: (path: string) => void
}) {
  const toggleExclude = useOrganizer((s) => s.toggleExclude)
  const [isDragging, setIsDragging] = useState(false)
  const dest = joinPath(c.dest)

  return (
    <li
      draggable={!isExcluded}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragIdsFor(file.id)))
        e.dataTransfer.effectAllowed = 'move'
        setIsDragging(true)
        onDragState(true)
      }}
      onDragEnd={() => {
        setIsDragging(false)
        onDragState(false)
      }}
      className={cn(
        'group flex items-center gap-3 border-b border-border/70 px-4 py-2.5 transition-[background-color,opacity] duration-150 last:border-0',
        checked ? 'bg-primary-soft/50' : 'hover:bg-surface-2/60',
        isDragging && 'opacity-40',
        !isExcluded && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <input type="checkbox" checked={checked} onChange={() => onCheck(file.id)} aria-label={`Seleccionar ${file.name}`} className="size-3.5 accent-[var(--df-primary)]" />
      <FileIcon category={c.category} ext={file.ext} className={cn(isExcluded && 'opacity-50')} />
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-[13px] text-text', isExcluded && 'text-faint line-through')} title={file.name}>
          {file.name}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-faint">
          {isExcluded ? (
            <span>Se quedará en {file.relDir || 'la carpeta de origen'}</span>
          ) : (
            <>
              <CornerDownRight className="size-3 shrink-0" />
              <button type="button" onClick={() => onGoTo(dest)} className="truncate hover:text-primary hover:underline" title={dest}>
                {dest}
              </button>
              <span aria-hidden>·</span>
              <span className="truncate">{c.reason}</span>
              <span aria-hidden className="max-[1100px]:hidden">·</span>
              <span className="shrink-0 tabular-nums max-[1100px]:hidden">{formatBytes(file.size)}</span>
            </>
          )}
        </div>
        {cf && !isExcluded && (
          <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-warning">
            <CircleExclamationPoint className="size-3" />
            {cf.kind === 'exists' ? 'Ya existe en el destino' : 'Otro archivo con el mismo nombre'} · se guardará como “{cf.renameTo}”
          </div>
        )}
      </div>
      <div className="flex min-w-[150px] shrink-0 items-center justify-end gap-1 max-[1100px]:min-w-0">
        {file.relDir && !isExcluded && (
          <span className="mr-1 truncate text-[11px] text-faint max-[1300px]:hidden" title={`Origen: ${file.relDir}`}>
            desde {file.relDir}
          </span>
        )}
        {!isExcluded && c.via === 'structure' && (
          <Badge tone="primary" icon={FolderCheck} className="max-[1200px]:hidden">
            Tu carpeta
          </Badge>
        )}
        {!isExcluded && c.via === 'course' && (
          <Badge tone="primary" icon={FolderPlus} className="max-[1200px]:hidden">
            Curso nuevo
          </Badge>
        )}
        {!isExcluded && <ConfidenceBadge value={c.confidence} compact />}
        <Button
          size="sm"
          variant="ghost"
          icon={isExcluded ? Undo2 : EyeOff}
          aria-label={isExcluded ? `Incluir ${file.name}` : `Excluir ${file.name}`}
          title={isExcluded ? 'Incluir de nuevo' : 'Excluir: no se moverá'}
          onClick={() => toggleExclude(file.id)}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-[900px]:opacity-100"
        />
      </div>
    </li>
  )
})

function NewFolderDialog({
  parent,
  rootName,
  onClose,
  onCreate,
}: {
  parent: string | null
  rootName: string
  onClose: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')
  const invalid = name.trim() !== '' && folderNameProblem(name) !== null
  const close = () => {
    setName('')
    onClose()
  }
  return (
    <Dialog
      open={parent !== null}
      onClose={close}
      title="Nueva carpeta"
      description={`Se creará dentro de ${parent ? parent : rootName}.`}
      width="sm"
      footer={
        <>
          <Button onClick={close}>Cancelar</Button>
          <Button
            variant="primary"
            icon={FolderPlus}
            disabled={!name.trim() || invalid}
            onClick={() => {
              onCreate(name)
              setName('')
            }}
          >
            Crear carpeta
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && !invalid) {
            onCreate(name)
            setName('')
          }
        }}
      >
        <Label htmlFor="folder-name">Nombre</Label>
        <Input id="folder-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Universidad" aria-invalid={invalid} />
        {invalid && <p className="mt-1.5 text-[12px] text-danger">{folderNameProblem(name)}</p>}
      </form>
    </Dialog>
  )
}

function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  counts,
  newFolders,
  planSize,
  sampleFolders,
  conflictIds,
  byId,
  destinationLabel,
  cloud,
}: {
  destinationLabel: string
  /** Proveedores de nube aceptados por el usuario para este destino. */
  cloud: string[]
  open: boolean
  onClose: () => void
  onConfirm: () => void
  counts: { all: number; low: number; medium: number; conflicts: number; excluded: number }
  newFolders: number
  planSize: (policy: 'rename' | 'skip') => number
  sampleFolders: string[]
  conflictIds: string[]
  byId: Map<string, FileEntry>
}) {
  const { policy, setPolicy } = useOrganizer()
  const reviewName = useSettings((s) => s.reviewFolderName)
  const moves = open ? planSize(policy) : 0
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Confirmar organización"
      description="Revisa el resumen. Puedes deshacer la operación desde el Historial."
      footer={
        <>
          <Button onClick={onClose}>Volver a la vista previa</Button>
          <Button variant="primary" icon={FolderInput} onClick={onConfirm} data-autofocus disabled={moves === 0}>
            Organizar {plural(moves, 'archivo', 'archivos')}
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-2.5">
        <SummaryItem label="Archivos que se moverán" value={moves} />
        <SummaryItem label="Carpetas nuevas" value={newFolders} />
        <SummaryItem label={`Irán a “${reviewName}”`} value={counts.low} tone={counts.low ? 'warning' : undefined} />
        <SummaryItem label="Se quedan donde están" value={counts.excluded + (policy === 'skip' ? counts.conflicts : 0)} />
      </dl>

      <div className={cn('mt-4 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5', cloud.length ? 'bg-warning-soft' : 'bg-surface-2')}>
        {cloud.length ? (
          <Cloud className="size-4 shrink-0 text-warning" strokeWidth={1.8} />
        ) : (
          <FolderOpen className="size-4 shrink-0 text-primary" strokeWidth={1.8} />
        )}
        <div className="min-w-0">
          <div className="text-[12px] text-muted">Se guardará en</div>
          <div className="truncate font-mono text-[12px] text-text" title={destinationLabel}>
            {destinationLabel}
          </div>
        </div>
      </div>

      {sampleFolders.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[12px] font-medium text-muted">Se crearán, entre otras:</div>
          <div className="flex flex-wrap gap-1.5">
            {sampleFolders.map((p) => (
              <span key={p} className="rounded-md bg-surface-2 px-2 py-1 font-mono text-[11px] text-muted">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {counts.conflicts > 0 && (
        <div className="mt-4 rounded-xl border border-warning/30 bg-warning-soft p-3.5">
          <div className="flex items-start gap-2.5">
            <CircleExclamationPoint className="mt-px size-4 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-text">{plural(counts.conflicts, 'conflicto de nombre', 'conflictos de nombre')}</div>
              <div className="mt-0.5 truncate text-[12px] text-muted">
                {conflictIds.slice(0, 2).map((id) => byId.get(id)?.name).join(', ')}
                {conflictIds.length > 2 && '…'}
              </div>
              <div className="mt-2.5">
                <Segmented
                  name="policy"
                  size="sm"
                  value={policy}
                  onChange={setPolicy}
                  options={[
                    { value: 'rename', label: 'Renombrar con (1)' },
                    { value: 'skip', label: 'No mover' },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-1.5 text-[12.5px] text-muted">
        {cloud.length > 0 && (
          <li className="flex items-start gap-2 text-text">
            <Cloud className="mt-0.5 size-3.5 shrink-0 text-warning" />
            Aceptaste guardar en {cloud.join(' y ')}: lo organizado se subirá a la nube.
          </li>
        )}
        {[
          'Nunca se elimina ni se sobrescribe ningún archivo.',
          ...(cloud.length ? [] : ['Todo se queda en este equipo: nada se sube a la nube.']),
          'Los archivos en uso se omiten y se informan.',
          'Cada movimiento queda registrado para poder deshacerlo.',
        ].map((t) => (
          <li key={t} className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
            {t}
          </li>
        ))}
      </ul>
      {counts.medium > 0 && (
        <p className="mt-3 text-[12px] text-faint">
          {counts.medium === 1 ? '1 archivo tiene' : `${counts.medium} archivos tienen`} confianza media: comprueba su destino si aún no lo has hecho.
        </p>
      )}
    </Dialog>
  )
}

function SummaryItem({ label, value, tone }: { label: string; value: number; tone?: 'warning' }) {
  return (
    <div className="rounded-xl border border-border px-3.5 py-3">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={cn('mt-0.5 text-[20px] font-semibold tracking-[-0.02em] tabular-nums', tone === 'warning' ? 'text-warning' : 'text-text')}>
        {formatNumber(value)}
      </dd>
    </div>
  )
}
