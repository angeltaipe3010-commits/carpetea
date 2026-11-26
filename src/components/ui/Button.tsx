import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  iconRight?: LucideIcon
  children?: ReactNode
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-[0_1px_2px_rgb(32_36_49/0.12)]',
  secondary: 'bg-surface text-text border border-border-strong hover:bg-surface-2',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
  subtle: 'bg-surface-2 text-text hover:bg-surface-3',
  danger: 'bg-danger-soft text-danger hover:brightness-95 dark:hover:brightness-125',
}

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12.5px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-[13.5px] gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[14.5px] gap-2 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none',
        'transition-[background-color,color,box-shadow,transform,filter] duration-150 ease-standard',
        'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        !children && (size === 'sm' ? 'w-7 px-0' : size === 'md' ? 'w-9 px-0' : 'w-11 px-0'),
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className={size === 'lg' ? 'size-[18px]' : 'size-4'} strokeWidth={1.9} aria-hidden />}
      {children}
      {IconRight && <IconRight className="size-4" strokeWidth={1.9} aria-hidden />}
    </button>
  )
})
