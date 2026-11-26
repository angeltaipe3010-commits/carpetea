import type { HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { forwardRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { ease, spring } from '@/lib/motion'

/* ───────────── Panel: superficie con borde sutil ───────────── */
export function Panel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface shadow-card', className)} {...rest} />
}

/* ───────────── Badge ───────────── */
type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({
  tone = 'neutral',
  icon: Icon,
  dot,
  className,
  children,
}: {
  tone?: Tone
  icon?: LucideIcon
  dot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-md px-2 text-[11.5px] font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {Icon && <Icon className="size-3.5" strokeWidth={2} aria-hidden />}
      {children}
    </span>
  )
}

/* ───────────── Switch ───────────── */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  id?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200',
        checked ? 'bg-primary' : 'bg-surface-3',
        'disabled:opacity-45',
      )}
    >
      <motion.span
        layout
        transition={spring}
        className={cn('size-4 rounded-full bg-white shadow-sm', checked && 'ml-auto')}
      />
    </button>
  )
}

/* ───────────── Segmented control ───────────── */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  name,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: LucideIcon }[]
  name: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-md font-medium transition-colors duration-150',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
              active ? 'text-text' : 'text-muted hover:text-text',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${name}`}
                transition={spring}
                className="absolute inset-0 rounded-md bg-surface shadow-card ring-1 ring-border"
              />
            )}
            {o.icon && <o.icon className="relative size-3.5" strokeWidth={2} aria-hidden />}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ───────────── Progress ───────────── */
export function Progress({
  value,
  indeterminate,
  tone = 'primary',
  className,
  label,
}: {
  value?: number
  indeterminate?: boolean
  tone?: 'primary' | 'success'
  className?: string
  label: string
}) {
  const pct = Math.max(0, Math.min(100, (value ?? 0) * 100))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      className={cn('relative h-1.5 overflow-hidden rounded-full bg-surface-3', className)}
    >
      {indeterminate ? (
        <span
          className={cn('absolute inset-y-0 w-2/5 rounded-full', tone === 'success' ? 'bg-success' : 'bg-primary')}
          style={{ animation: 'df-indeterminate 1.2s var(--ease-standard) infinite' }}
        />
      ) : (
        <motion.span
          className={cn('absolute inset-y-0 left-0 rounded-full', tone === 'success' ? 'bg-success' : 'bg-primary')}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, ease: ease.out }}
        />
      )}
    </div>
  )
}

/* ───────────── Skeleton ───────────── */
export function Skeleton({ className, width }: { className?: string; width?: number | string }) {
  return <div aria-hidden className={cn('df-skeleton rounded-md', className)} style={width ? { width } : undefined} />
}

/* ───────────── Form controls ───────────── */
// El ancho completo es el valor por defecto, salvo que el uso indique su propio ancho (w-*).
const width = (className?: string) => (/(^|\s)w-/.test(className ?? '') ? '' : 'w-full')

const field =
  'h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13.5px] text-text placeholder:text-faint ' +
  'transition-[border-color,box-shadow] duration-150 focus:border-primary focus:outline-none focus:ring-3 focus:ring-[var(--df-ring)]'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(field, width(className), className)} {...rest} />
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, width(className), 'cursor-pointer appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238991A3' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...rest}
    >
      {children}
    </select>
  )
}

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-medium text-text">
      {children}
      {hint && <span className="ml-1.5 font-normal text-faint">{hint}</span>}
    </label>
  )
}

/* ───────────── Empty state ───────────── */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 grid size-12 place-items-center rounded-xl border border-border bg-surface-2 text-faint">
        <Icon className="size-[22px]" strokeWidth={1.6} aria-hidden />
      </div>
      <h3 className="text-[15px] font-semibold text-text">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ───────────── Kbd ───────────── */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-surface px-1 font-sans text-[10.5px] font-medium text-muted">
      {children}
    </kbd>
  )
}
