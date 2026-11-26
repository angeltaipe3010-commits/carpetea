import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { page } from '@/lib/motion'

/** Contenedor de cada pantalla: aplica la transición y el ancho de lectura. */
export function Page({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <motion.div
      variants={page}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn('mx-auto w-full px-8 pt-7 pb-12 max-[700px]:px-4', wide ? 'max-w-[1280px]' : 'max-w-[1040px]', className)}
    >
      {children}
    </motion.div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[12px] font-medium text-faint">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text">{title}</h1>
        {description && <p className="mt-1 max-w-[620px] text-[13.5px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[13px] font-semibold text-text">{children}</h2>
      {action}
    </div>
  )
}
