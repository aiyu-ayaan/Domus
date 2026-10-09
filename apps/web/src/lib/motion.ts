import type { Transition, Variants } from 'motion/react'

/** Material 3 Expressive spring tokens. */
export const spring = {
  fast: { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 } as Transition,
  default: { type: 'spring', stiffness: 380, damping: 30 } as Transition,
  bouncy: { type: 'spring', stiffness: 420, damping: 20 } as Transition,
  gentle: { type: 'spring', stiffness: 220, damping: 28 } as Transition,
}

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
}

export const rise: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring.default },
}

export const page = {
  initial: { opacity: 0, y: 12, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { ...spring.gentle } },
  exit: { opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.14 } },
}
