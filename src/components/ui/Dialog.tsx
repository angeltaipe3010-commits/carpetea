import type { ReactNode } from 'react'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
  /** Impide cerrar mientras hay una operación en curso. */
  locked?: boolean
}

export function Dialog({ open, onClose, title, description, children, footer, width = 'md', locked }: DialogProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose()
      // Trampa de foco simple dentro del diálogo.
      if (e.key === 'Tab' && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>('[data-autofocus], input, button:not([data-close])')
      target?.focus()
    })
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, onClose, locked])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div
            className="absolute inset-0 bg-[#0b0d14]/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => !locked && onClose()}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(
              'relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop',
              width === 'sm' && 'max-w-[420px]',
              width === 'md' && 'max-w-[540px]',
              width === 'lg' && 'max-w-[720px]',
            )}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.24, ease: ease.out } }}
            exit={{ opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.14, ease: ease.standard } }}
          >
            <div className="flex items-start gap-4 px-6 pt-5 pb-1">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-[16px] font-semibold tracking-[-0.01em] text-text">
                  {title}
                </h2>
                {description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}
              </div>
              {!locked && (
                <button
                  data-close
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="-mr-2 grid size-8 place-items-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-text"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-border bg-surface-2/50 px-6 py-3.5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
