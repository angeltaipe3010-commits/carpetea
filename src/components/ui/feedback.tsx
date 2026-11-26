import { useEffect, useRef } from 'react'
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react'
import { CircleCheck, CircleExclamationPoint, Info, TriangleExclamationPoint, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'
import { formatNumber } from '@/lib/format'
import { useToasts } from '@/stores/toasts'
import type { ToastTone } from '@/stores/toasts'

/* ───────────── Número con conteo ascendente ───────────── */
export function AnimatedNumber({ value, format = formatNumber, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce) {
      el.textContent = format(value)
      prev.current = value
      return
    }
    const controls = animate(prev.current, value, {
      duration: 0.9,
      ease: ease.out,
      onUpdate: (v) => (el.textContent = format(Math.round(v))),
    })
    prev.current = value
    return () => controls.stop()
  }, [value, format, reduce])
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {format(value)}
    </span>
  )
}

/* ───────────── Check de éxito que se dibuja ───────────── */
export function SuccessCheck({ size = 56 }: { size?: number }) {
  return (
    <motion.svg width={size} height={size} viewBox="0 0 56 56" aria-hidden initial="hidden" animate="visible">
      <motion.circle
        cx="28"
        cy="28"
        r="26"
        fill="var(--df-success-soft)"
        variants={{ hidden: { scale: 0.6, opacity: 0 }, visible: { scale: 1, opacity: 1, transition: { duration: 0.35, ease: ease.out } } }}
        style={{ originX: '50%', originY: '50%' }}
      />
      <motion.path
        d="M18 28.5l7 7 13-14"
        fill="none"
        stroke="var(--df-success)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1, transition: { delay: 0.2, duration: 0.4, ease: ease.out } } }}
      />
    </motion.svg>
  )
}

/* ───────────── Notificaciones discretas ───────────── */
const toneIcon: Record<ToastTone, typeof Info> = {
  success: CircleCheck,
  info: Info,
  warning: TriangleExclamationPoint,
  danger: CircleExclamationPoint,
}
const toneColor: Record<ToastTone, string> = {
  success: 'text-success',
  info: 'text-primary',
  warning: 'text-warning',
  danger: 'text-danger',
}

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = toneIcon[t.tone]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.26, ease: ease.out } }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.16 } }}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-pop"
            >
              <Icon className={cn('mt-px size-[18px] shrink-0', toneColor[t.tone])} strokeWidth={2} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-text">{t.title}</p>
                {t.description && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar notificación"
                className="-m-1 grid size-6 place-items-center rounded-md text-faint hover:bg-surface-2 hover:text-text"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
