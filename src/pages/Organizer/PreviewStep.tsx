import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  ChevronRight,
  CircleExclamationPoint,
  Cloud,
  CornerDownRight,
  EyeOff,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Info,
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
import { EmptyState, Input, Label, Panel, Segmented, Select } from '@/components/ui/primitives'
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
import type { Confidence, Conflict, FileEntry } from '@/types'
import { baseName } from '@/utils/destination'
import { buildPlan, buildTree, findConflicts, flattenFolders, joinPath } from '@/utils/plan'

type Filter = 'all' | Confidence | 'conflicts' | 'excluded'

export default function PreviewStep() {
  const o = useOrganizer()
  const reviewName = useSettings((s) => s.reviewFolderName)
  const destination = useSettings((s) => s.destination)
  const setSettings = useSettings((s) => s.set)
  const [changingDest, setChangingDest] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [checked, setChecked] = useState<Record<string, true>>({})
  const [dragging, setDragging] = useState(false)
  const [newFolderIn, setNewFolderIn] = useState<string | null>(null)
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

  const checkedIds = Object.keys(checked).filter((id) => visible.some((f) => f.id === id))
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
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={o.startScan}>
            Volver a analizar
          </Button>
          <Button variant="primary" iconRight={ArrowRight} onClick={() => setConfirming(true)} disabled={counts.all === 0 || !destinationReady(destination)}>
            Revisar y confirmar
          </Button>
        </div>
      </Panel>

      {o.skippedManaged > 0 && (
        <p className="mb-4 flex items-center gap-2 px-1 text-[12.5px] text-muted">
          <Info className="size-3.5 shrink-0 text-primary" />
          Se omitieron {plural(o.skippedManaged, 'archivo que ya está', 'archivos que ya están')} en carpetas organizadas por DeskFlow.
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
            ).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors duration-150',
                  filter === key ? 'border-primary/30 bg-primary-soft text-primary' : 'border-border text-muted hover:border-border-strong hover:text-text',
                  (key === 'conflicts' || key === 'excluded') && n === 0 && filter !== key && 'hidden',
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
                  {filter !== 'excluded' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={EyeOff}
                      onClick={() => {
                        checkedIds.forEach(o.toggleExclude)
                        setChecked({})
                      }}
                    >
                      Excluir
                    </Button>
                  )}
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
              <ul>
                {visible.map((f) => (
                  <FileRow
                    key={f.id}
                    file={f}
                    checked={!!checked[f.id]}
                    onCheck={() =>
                      setChecked((s) => {
                        const n = { ...s }
                        if (n[f.id]) delete n[f.id]
                        else n[f.id] = true
                        return n
                      })
                    }
                    onDragState={setDragging}
                    dragIds={checked[f.id] ? checkedIds : [f.id]}
                    onGoTo={(p) => o.select(p)}
                    cf={conflicts[f.id]}
                  />
                ))}
              </ul>
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

function FileRow({
  file,
  checked,
  onCheck,
  onDragState,
  dragIds,
  onGoTo,
  cf,
}: {
  file: FileEntry
  cf?: Conflict
  checked: boolean
  onCheck: () => void
  onDragState: (v: boolean) => void
  dragIds: string[]
  onGoTo: (path: string) => void
}) {
  const { plan, excluded, toggleExclude } = useOrganizer()
  const c = plan[file.id]
  const isExcluded = !!excluded[file.id]
  const [isDragging, setIsDragging] = useState(false)
  const dest = joinPath(c.dest)

  return (
    <li
      draggable={!isExcluded}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragIds))
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
      <input type="checkbox" checked={checked} onChange={onCheck} aria-label={`Seleccionar ${file.name}`} className="size-3.5 accent-[var(--df-primary)]" />
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
      <div className="flex w-[150px] items-center justify-end gap-1 max-[1100px]:w-auto">
        {file.relDir && !isExcluded && (
          <span className="mr-1 truncate text-[11px] text-faint max-[1300px]:hidden" title={`Origen: ${file.relDir}`}>
            desde {file.relDir}
          </span>
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
}

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
  const invalid = /[\\/:*?"<>|]/.test(name)
  return (
    <Dialog
      open={parent !== null}
      onClose={() => {
        setName('')
        onClose()
      }}
      title="Nueva carpeta"
      description={`Se creará dentro de ${parent ? parent : rootName}.`}
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
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
        {invalid && <p className="mt-1.5 text-[12px] text-danger">Windows no permite estos caracteres: \ / : * ? " &lt; &gt; |</p>}
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
