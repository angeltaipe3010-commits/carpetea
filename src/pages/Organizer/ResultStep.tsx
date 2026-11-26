import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { FolderSync, RotateCcwClock, TriangleExclamationPoint } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Panel, Progress } from '@/components/ui/primitives'
import { AnimatedNumber, SuccessCheck } from '@/components/ui/feedback'
import { formatNumber, plural } from '@/lib/format'
import { ease, list, listItem } from '@/lib/motion'
import { useOrganizer } from '@/stores/organizer'
import { toast } from '@/stores/toasts'

export default function ResultStep() {
  const navigate = useNavigate()
  const { step, exec, operation, source, reset } = useOrganizer()
  const notified = useRef<string | null>(null)

  useEffect(() => {
    if (step === 'done' && operation && notified.current !== operation.id) {
      notified.current = operation.id
      const moved = operation.moves.filter((m) => m.status === 'moved').length
      toast({
        tone: operation.errors.length ? 'warning' : 'success',
        title: `${source?.name} organizada`,
        description: `${plural(moved, 'archivo movido', 'archivos movidos')}${operation.errors.length ? ` · ${plural(operation.errors.length, 'aviso', 'avisos')}` : ''}`,
      })
    }
  }, [step, operation, source])

  if (step === 'executing' || !operation) {
    const frac = exec && exec.total ? exec.done / exec.total : 0
    return (
      <Panel className="mx-auto max-w-[560px] p-7" aria-busy>
        <h2 className="text-[15px] font-semibold text-text">Organizando {source?.name}…</h2>
        <p className="mt-1 text-[13px] text-muted tabular-nums">
          {exec ? `${formatNumber(exec.done)} de ${formatNumber(exec.total)} archivos` : 'Preparando…'}
        </p>
        <Progress value={frac} label="Progreso de la organización" className="mt-5" />
        <p className="mt-2.5 h-4 truncate font-mono text-[11px] text-faint">{exec?.current}</p>
        <p className="mt-5 rounded-lg bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-muted">
          Cada movimiento se verifica y se registra antes de pasar al siguiente. Mantén DeskFlow abierto hasta que termine.
        </p>
      </Panel>
    )
  }

  const moved = operation.moves.filter((m) => m.status === 'moved').length
  const skipped = operation.moves.filter((m) => m.status === 'skipped').length

  return (
    <Panel className="mx-auto max-w-[640px] px-7 py-8 text-center">
      <div className="flex justify-center">
        <SuccessCheck />
      </div>
      <motion.h2
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.25, duration: 0.4, ease: ease.out } }}
        className="mt-4 text-[19px] font-semibold tracking-[-0.015em] text-text"
      >
        {source?.name} está organizada
      </motion.h2>
      <p className="mt-1 text-[13.5px] text-muted">
        {operation.errors.length ? 'Terminó con algunos avisos. Nada se perdió ni se sobrescribió.' : 'Todo salió bien. Puedes deshacerlo cuando quieras desde el Historial.'}
      </p>
      {operation.destination && (
        <p className="mx-auto mt-2 max-w-full truncate font-mono text-[11.5px] text-faint" title={operation.destination}>
          Guardado en {operation.destination}
        </p>
      )}

      <motion.dl variants={list} initial="initial" animate="animate" className="mt-6 grid grid-cols-3 gap-2.5 text-left max-[560px]:grid-cols-1">
        {[
          { label: 'Archivos movidos', value: moved },
          { label: 'Carpetas creadas', value: operation.foldersCreated.length },
          { label: 'Sin mover', value: skipped },
        ].map((s) => (
          <motion.div key={s.label} variants={listItem} className="rounded-xl border border-border px-4 py-3">
            <dt className="text-[12px] text-muted">{s.label}</dt>
            <dd className="mt-0.5 text-[22px] font-semibold tracking-[-0.02em] text-text">
              <AnimatedNumber value={s.value} />
            </dd>
          </motion.div>
        ))}
      </motion.dl>

      {operation.errors.length > 0 && (
        <div role="status" className="mt-4 rounded-xl border border-warning/30 bg-warning-soft p-3.5 text-left">
          {operation.errors.map((e) => (
            <p key={e} className="flex items-start gap-2 text-[12.5px] text-text">
              <TriangleExclamationPoint className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {e}
            </p>
          ))}
        </div>
      )}

      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button icon={RotateCcwClock} onClick={() => navigate('/historial')}>
          Ver en el historial
        </Button>
        <Button variant="primary" icon={FolderSync} onClick={reset}>
          Organizar otra carpeta
        </Button>
      </div>
    </Panel>
  )
}
