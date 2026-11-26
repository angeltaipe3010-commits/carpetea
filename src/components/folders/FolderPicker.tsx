import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, ChevronRight, Cloud, Folder, FolderPlus, HardDrive, Lock, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'
import { localFs } from '@/services/localFs'
import type { FsFolder } from '@/types'
import { cloudProvider, destinationProblem } from '@/utils/destination'

/**
 * Selector de carpeta de destino.
 *
 * Prototipo del diálogo nativo de Windows: en la Fase 2 se sustituye por
 * `open({ directory: true })` de Tauri, y la validación se repite en Rust.
 * Las carpetas del sistema no se pueden elegir. Las sincronizadas con la nube
 * sí, pero quedan marcadas y quien llama pide confirmación antes de usarlas.
 */
export function FolderPicker({
  open,
  initialPath,
  onClose,
  onPick,
}: {
  open: boolean
  initialPath?: string
  onClose: () => void
  onPick: (path: string) => void
}) {
  const [current, setCurrent] = useState(initialPath || 'D:')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (open) {
      setCurrent(initialPath || 'D:')
      setCreating(false)
    }
  }, [open, initialPath])

  const children = useMemo(() => localFs.list(current), [current, creating]) // eslint-disable-line react-hooks/exhaustive-deps
  const problem = destinationProblem(current)
  const cloud = cloudProvider(current)
  const segs = current.split('\\')
  const parent = segs.length > 1 ? segs.slice(0, -1).join('\\') : null
  const nameInvalid = /[\\/:*?"<>|]/.test(newName)

  const createFolder = () => {
    const name = newName.trim()
    if (!name || nameInvalid) return
    const f = localFs.mkdir(current, name)
    setNewName('')
    setCreating(false)
    setCurrent(f.path)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="lg"
      title="Elegir carpeta de destino"
      description="Aquí se creará la estructura organizada. Mejor una carpeta de este equipo."
      footer={
        <>
          <div className="mr-auto min-w-0 self-center">
            <div className="truncate font-mono text-[12px] text-text" title={current}>
              {current}
            </div>
            <div className={cn('text-[11.5px]', problem ? 'text-danger' : cloud ? 'text-warning' : 'text-success')}>
              {problem ?? (cloud ? `Sincronizada con ${cloud}: te pediremos confirmación` : 'Carpeta local de este equipo')}
            </div>
          </div>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!!problem} onClick={() => onPick(current)}>
            Elegir esta carpeta
          </Button>
        </>
      }
    >
      <div className="grid h-[380px] grid-cols-[180px_1fr] gap-4 max-[640px]:grid-cols-1">
        {/* Accesos rápidos y unidades */}
        <nav aria-label="Ubicaciones" className="space-y-4 overflow-y-auto max-[640px]:hidden">
          <Group title="Acceso rápido">
            {localFs.quickAccess().map(({ label, folder }) => (
              <Place key={folder.path} icon={Folder} label={label} active={current === folder.path} onClick={() => setCurrent(folder.path)} />
            ))}
          </Group>
          <Group title="Este equipo">
            {localFs.drives().map((d) => (
              <Place key={d.path} icon={HardDrive} label={d.name} active={current === d.path} onClick={() => setCurrent(d.path)} />
            ))}
          </Group>
        </nav>

        <div className="flex min-h-0 flex-col rounded-xl border border-border">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            <Button size="sm" variant="ghost" icon={ArrowUp} aria-label="Carpeta superior" disabled={!parent} onClick={() => parent && setCurrent(parent)} />
            <nav aria-label="Ruta" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-[12.5px]">
              {segs.map((seg, i) => (
                <span key={i} className="flex min-w-0 items-center gap-0.5">
                  {i > 0 && <ChevronRight className="size-3 shrink-0 text-faint" />}
                  <button
                    type="button"
                    onClick={() => setCurrent(segs.slice(0, i + 1).join('\\'))}
                    className={cn('truncate rounded px-1 py-0.5 hover:bg-surface-2', i === segs.length - 1 ? 'font-medium text-text' : 'text-muted')}
                  >
                    {seg}
                  </button>
                </span>
              ))}
            </nav>
            <Button size="sm" variant="ghost" icon={FolderPlus} onClick={() => setCreating(true)} disabled={!!problem && !/^[a-z]:$/i.test(current)}>
              Nueva carpeta
            </Button>
          </div>

          <AnimatePresence initial={false}>
            {creating && (
              <motion.form
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1, transition: { duration: 0.2, ease: ease.out } }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-border"
                onSubmit={(e) => {
                  e.preventDefault()
                  createFolder()
                }}
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <FolderPlus className="size-4 shrink-0 text-primary" />
                  <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej. Organizado" aria-label="Nombre de la nueva carpeta" className="h-8" aria-invalid={nameInvalid} />
                  <Button size="sm" type="submit" variant="primary" disabled={!newName.trim() || nameInvalid}>
                    Crear
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                    Cancelar
                  </Button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5" aria-label="Subcarpetas">
            {children.length === 0 ? (
              <li className="px-3 py-8 text-center text-[12.5px] text-faint">Carpeta vacía. Puedes elegirla o crear una subcarpeta.</li>
            ) : (
              children.map((f) => <Row key={f.path} folder={f} onOpen={() => setCurrent(f.path)} />)
            )}
          </ul>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-[12px] text-muted">
        <ShieldCheck className="size-3.5 shrink-0 text-success" />
        DeskFlow no sube nada por su cuenta. Si eliges una carpeta de OneDrive, Google Drive, Dropbox o iCloud, te preguntaremos antes.
      </p>
    </Dialog>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-faint uppercase">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function Place({ icon: Icon, label, active, onClick }: { icon: typeof Folder; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors',
        active ? 'bg-primary-soft font-medium text-text' : 'text-muted hover:bg-surface-2 hover:text-text',
      )}
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-faint')} strokeWidth={1.8} />
      <span className="truncate">{label}</span>
    </button>
  )
}

function Row({ folder, onOpen }: { folder: FsFolder; onOpen: () => void }) {
  const blocked = folder.system ? 'Sistema' : null
  const Icon = folder.system ? Lock : folder.cloud ? Cloud : Folder
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        disabled={!!blocked}
        title={blocked ? 'Carpeta del sistema protegida' : folder.cloud ? `Sincronizada con ${folder.cloud}` : undefined}
        className={cn(
          'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors',
          blocked ? 'cursor-not-allowed text-faint' : 'text-text hover:bg-surface-2',
        )}
      >
        <Icon className={cn('size-4 shrink-0', blocked ? 'text-faint' : folder.cloud ? 'text-warning' : 'text-primary/80')} strokeWidth={1.8} />
        <span className={cn('min-w-0 flex-1 truncate', blocked && 'line-through decoration-faint/50')}>{folder.name}</span>
        {blocked && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-faint">{blocked}</span>}
        {!blocked && folder.cloud && (
          <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-medium text-warning">{folder.cloud}</span>
        )}
        {!blocked && <ChevronRight className="size-3.5 text-faint" />}
      </button>
    </li>
  )
}
