import { useEffect } from 'react'
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react'

/** Number that springs to new values (static under reduced motion). */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion()
  const spring = useSpring(value, { stiffness: 120, damping: 22 })
  const text = useTransform(spring, (v) => format(v))
  useEffect(() => {
    if (reduce) spring.jump(value)
    else spring.set(value)
  }, [value, reduce, spring])
  return <motion.span className="tabular">{text}</motion.span>
}
