import { AnimatePresence, motion } from 'motion/react'
import { Check } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/Page'
import { cn } from '@/lib/cn'
import { page } from '@/lib/motion'
import { useOrganizer } from '@/stores/organizer'
import type { OrganizerStep } from '@/stores/organizer'
import SourceStep from './SourceStep'
import ScanStep from './ScanStep'
import PreviewStep from './PreviewStep'
import ResultStep from './ResultStep'

const STEPS: { key: OrganizerStep[]; label: string }[] = [
  { key: ['source'], label: 'Origen' },
  { key: ['scanning'], label: 'Análisis' },
  { key: ['preview'], label: 'Vista previa' },
  { key: ['executing', 'done'], label: 'Resultado' },
]

export default function Organizer() {
  const step = useOrganizer((s) => s.step)
  const source = useOrganizer((s) => s.source)
  const current = STEPS.findIndex((s) => s.key.includes(step))

  return (
    <Page wide>
      <PageHeader
        title="Organizar"
        description={
          step === 'preview' && source
            ? `Revisa la estructura propuesta para ${source.name}. Puedes renombrar carpetas, crear subcarpetas y arrastrar archivos antes de confirmar.`
            : 'Elige una carpeta, revisa la propuesta y confirma. Nada se mueve sin tu aprobación.'
        }
        actions={<Stepper current={current} />}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step === 'done' ? 'executing' : step} variants={page} initial="initial" animate="animate" exit="exit">
          {step === 'source' && <SourceStep />}
          {step === 'scanning' && <ScanStep />}
          {step === 'preview' && <PreviewStep />}
          {(step === 'executing' || step === 'done') && <ResultStep />}
        </motion.div>
      </AnimatePresence>
    </Page>
  )
}

function Stepper({ current }: { current: number }) {
  return (
    <ol aria-label="Progreso" className="flex items-center gap-1.5 max-[760px]:hidden">
      {STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s.label} className="flex items-center gap-1.5">
            <span
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-full pr-3 pl-1 text-[12px] font-medium transition-colors duration-200',
                active ? 'bg-primary-soft text-primary' : done ? 'text-text' : 'text-faint',
              )}
            >
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full text-[10.5px] transition-colors duration-200',
                  active ? 'bg-primary text-primary-fg' : done ? 'bg-success-soft text-success' : 'bg-surface-2 text-faint',
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className={cn('h-px w-4', i < current ? 'bg-success/50' : 'bg-border-strong')} />}
          </li>
        )
      })}
    </ol>
  )
}
