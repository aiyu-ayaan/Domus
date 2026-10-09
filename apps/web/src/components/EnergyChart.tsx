import { useState } from 'react'
import { motion } from 'motion/react'
import { formatKwh, formatMoney } from '@/lib/format'
import type { EnergyPoint } from '@/lib/types'

/** Accessible bar chart: each bar is focusable and announces its value. */
export function EnergyChart({
  points,
  range,
  currency,
  height = 180,
}: {
  points: EnergyPoint[]
  range: 'day' | 'week' | 'month'
  currency: string
  height?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...points.map((p) => p.kwh), 0.001)
  const total = points.reduce((s, p) => s + p.kwh, 0)
  const label = (t: string) => {
    const d = new Date(t)
    return range === 'day'
      ? d.toLocaleTimeString(undefined, { hour: 'numeric' })
      : d.toLocaleDateString(undefined, range === 'week' ? { weekday: 'short' } : { day: 'numeric', month: 'short' })
  }
  const shown = active ?? points.length - 1
  const sel = points[shown]

  if (!points.length || total === 0) {
    return (
      <div className="flex items-center justify-center rounded-3xl bg-line/[0.04] text-sm text-muted" style={{ height }}>
        No energy recorded yet — data appears as metered devices report power.
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between text-sm" aria-live="polite">
        <span className="text-muted">{sel && label(sel.t)}</span>
        <span className="font-semibold tabular">
          {sel && `${formatKwh(sel.kwh)} · ${formatMoney(sel.cost, currency)}`}
        </span>
      </div>
      <div
        role="list"
        aria-label={`Energy use per ${range === 'day' ? 'hour' : 'day'}, total ${formatKwh(total)}`}
        className="flex items-end gap-[3px]"
        style={{ height }}
        onMouseLeave={() => setActive(null)}
      >
        {points.map((p, i) => {
          const h = Math.max((p.kwh / max) * 100, p.kwh > 0 ? 3 : 1.5)
          return (
            <button
              key={p.t}
              role="listitem"
              aria-label={`${label(p.t)}: ${formatKwh(p.kwh)}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className="group flex h-full flex-1 cursor-pointer items-end rounded-md focus-visible:outline-offset-0"
            >
              <motion.span
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26, delay: i * 0.012 }}
                style={{ height: `${h}%`, originY: 1 }}
                className={`block w-full rounded-md transition-colors duration-200 ${
                  i === shown ? 'bg-power' : 'bg-power/35 group-hover:bg-power/60'
                }`}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-subtle" aria-hidden>
        <span>{label(points[0].t)}</span>
        <span>{label(points[Math.floor(points.length / 2)].t)}</span>
        <span>{label(points[points.length - 1].t)}</span>
      </div>
    </div>
  )
}
