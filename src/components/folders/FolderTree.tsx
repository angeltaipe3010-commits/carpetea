import type { KeyboardEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Folder, FolderOpen, FolderPlus, Inbox, Pencil } from 'lucide-react'
import { cn } from '@/lib/cn'
import { collapse } from '@/lib/motion'
import type { FolderNode } from '@/types'

export const DRAG_MIME = 'application/x-deskflow-files'

interface TreeProps {
  root: FolderNode
  rootLabel: string
  selected: string
  onSelect: (path: string) => void
  onDropFiles: (ids: string[], path: string) => void
  onRename: (path: string, name: string) => void
  onCreate: (parent: string) => void
  reviewName: string
}

/**
 * Árbol de carpetas propuesto. Se puede expandir/contraer, renombrar
 * (doble clic o F2), crear subcarpetas y soltar archivos encima.
 */
export function FolderTree(props: TreeProps) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {}
    props.root.children.forEach((c) => (o[c.path] = true))
    return o
  })
  const toggle = (p: string, v?: boolean) => setOpen((s) => ({ ...s, [p]: v ?? !s[p] }))

  // Al seleccionar una carpeta profunda, se abren sus ancestros.
  useEffect(() => {
    if (!props.selected) return
    const segs = props.selected.split('/')
    setOpen((s) => {
      const next = { ...s }
      for (let i = 1; i < segs.length; i++) next[segs.slice(0, i).join('/')] = true
      return next
    })
  }, [props.selected])

  return (
    <div role="tree" aria-label="Estructura de carpetas propuesta" className="text-[13px]">
      <Row
        node={props.root}
        label={props.rootLabel}
        isRoot
        open
        depth={0}
        {...props}
        onToggle={() => {}}
      />
      <Children nodes={props.root.children} open={open} toggle={toggle} {...props} />
    </div>
  )
}

function Children({
  nodes,
  open,
  toggle,
  ...props
}: TreeProps & { nodes: FolderNode[]; open: Record<string, boolean>; toggle: (p: string, v?: boolean) => void }) {
  return (
    <div role="group">
      {nodes.map((n) => (
        <div key={n.path}>
          <Row node={n} depth={n.depth} open={!!open[n.path]} onToggle={() => toggle(n.path)} {...props} />
          <AnimatePresence initial={false}>
            {open[n.path] && n.children.length > 0 && (
              <motion.div variants={collapse} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                <Children nodes={n.children} open={open} toggle={toggle} {...props} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

function Row({
  node,
  depth,
  open,
  onToggle,
  isRoot,
  label,
  selected,
  onSelect,
  onDropFiles,
  onRename,
  onCreate,
  reviewName,
}: TreeProps & { node: FolderNode; depth: number; open: boolean; onToggle: () => void; isRoot?: boolean; label?: string }) {
  const [over, setOver] = useState(false)
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const isSelected = selected === node.path
  const isReview = !isRoot && node.depth === 1 && node.name === reviewName
  const hasChildren = node.children.length > 0
  const Icon = isReview ? Inbox : open && hasChildren ? FolderOpen : Folder

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const commit = () => {
    const v = input.current?.value ?? ''
    if (v.trim() && v.trim() !== node.name) onRename(node.path, v)
    setEditing(false)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(node.path)
    } else if (e.key === 'ArrowRight' && hasChildren && !open) onToggle()
    else if (e.key === 'ArrowLeft' && open && !isRoot) onToggle()
    else if (e.key === 'F2' && !isRoot) setEditing(true)
  }

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={hasChildren ? open : undefined}
      tabIndex={0}
      onKeyDown={onKey}
      onClick={() => onSelect(node.path)}
      onDoubleClick={() => !isRoot && setEditing(true)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!over) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const raw = e.dataTransfer.getData(DRAG_MIME)
        if (raw && !isRoot) onDropFiles(JSON.parse(raw) as string[], node.path)
      }}
      className={cn(
        'group relative flex h-8 cursor-pointer items-center gap-1.5 rounded-lg pr-1.5 transition-[background-color,box-shadow] duration-150 outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary/60',
        isSelected ? 'bg-primary-soft text-text' : 'hover:bg-surface-2',
        over && !isRoot && 'bg-primary-soft ring-2 ring-primary',
      )}
      style={{ paddingLeft: 6 + depth * 16 }}
    >
      {isRoot ? (
        <span className="w-4" />
      ) : (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className={cn('grid size-4 place-items-center rounded text-faint', !hasChildren && 'invisible')}
        >
          <ChevronRight className={cn('size-3.5 transition-transform duration-200 ease-out-expo', open && 'rotate-90')} />
        </button>
      )}
      <motion.span animate={over ? { scale: 1.12 } : { scale: 1 }} transition={{ duration: 0.15 }} className="grid place-items-center">
        <Icon
          className={cn('size-4', isSelected || over ? 'text-primary' : isReview ? 'text-warning' : 'text-faint')}
          strokeWidth={1.8}
          aria-hidden
        />
      </motion.span>
      {editing ? (
        <input
          ref={input}
          defaultValue={node.name}
          aria-label="Nuevo nombre de carpeta"
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="h-6 min-w-0 flex-1 rounded-md border border-primary bg-surface px-1.5 text-[13px] outline-none ring-3 ring-[var(--df-ring)]"
        />
      ) : (
        <span className={cn('min-w-0 flex-1 truncate', isRoot ? 'font-semibold' : isSelected && 'font-medium')}>
          {label ?? node.name}
        </span>
      )}
      {!editing && node.isNew && !isRoot && (
        <span className="rounded bg-primary/10 px-1 text-[10px] font-semibold tracking-wide text-primary uppercase group-hover:hidden">
          Nueva
        </span>
      )}
      {!editing && (
        <span className="hidden items-center group-hover:flex group-focus-within:flex">
          {!isRoot && (
            <IconAction label={`Renombrar ${node.name}`} onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </IconAction>
          )}
          <IconAction label={`Nueva subcarpeta en ${label ?? node.name}`} onClick={() => onCreate(node.path)}>
            <FolderPlus className="size-3.5" />
          </IconAction>
        </span>
      )}
      {!editing && <span className="min-w-6 text-right text-[11.5px] text-faint tabular-nums">{node.total}</span>}
    </div>
  )
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="grid size-6 place-items-center rounded-md text-faint hover:bg-surface hover:text-text"
    >
      {children}
    </button>
  )
}
