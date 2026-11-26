import type { Transition, Variants } from 'motion/react'

/**
 * Vocabulario de movimiento de DeskFlow, tomado de las reglas de la skill
 * MotionSites y ajustado a una app de escritorio: duraciones más cortas
 * (150–300 ms), desplazamientos de 4–8 px y nada decorativo en bucle.
 */
export const ease = {
  /** Entradas y aperturas. */
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  /** Cambios de estado. */
  standard: [0.4, 0, 0.2, 1] as [number, number, number, number],
}

export const spring: Transition = { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 }

export const page: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: ease.out } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.14, ease: ease.standard } },
}

export const list: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
}

export const listItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: ease.out } },
}

export const collapse: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1, transition: { duration: 0.22, ease: ease.out } },
  exit: { height: 0, opacity: 0, transition: { duration: 0.16, ease: ease.standard } },
}
