import { useState } from 'react'
import { formatKwh, formatMoney, formatWatts } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { EnergyPoint } from '@/lib/types'

/** Bar chart with focusable bars; the selected bar's value is shown above. */
export function EnergyChart({ points, range, currency, height = 160 }: { points: EnergyPoint[]; range: 'day' | 'week' | 'month'; currency: string; height?: number }) {
  const [active, setActive] = useState<number | null>(null)
  const [metric, setMetric] = useState<'kwh' | 'watts'>('kwh')
  // Average power over a bucket is its energy divided by its length (1 h for the day view, else 24 h).
  const hours = range === 'day' ? 1 : 24
  const value = (p: EnergyPoint) => (metric === 'kwh' ? p.kwh : (p.kwh * 1000) / hours)
  const show = (v: number) => (metric === 'kwh' ? formatKwh(v) : formatWatts(v))
  const max = Math.max(...points.map(value), 0.0001)
  const total = points.reduce((s, p) => s + p.kwh, 0)
  const label = (t: string) => {
    const d = new Date(t)
    return range === 'day'
      ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(undefined, range === 'week' ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' })
  }
  if (!points.length || total === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-label text-subtle" style={{ height }}>
        No consumption recorded yet. Metered devices report every minute.
      </div>
    )
  }
  const shown = active ?? points.length - 1
  const sel = points[shown]
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3 text-label" aria-live="polite">
        <span className="flex items-center gap-2 text-muted">
          {label(sel.t)}
          <span role="group" aria-label="Chart unit" className="flex rounded-md border border-border text-caption">
            {(['kwh', 'watts'] as const).map((m) => (
              <button key={m} aria-pressed={metric === m} onClick={() => setMetric(m)} className={cn('px-1.5 py-0.5', metric === m ? 'bg-raised text-fg' : 'text-muted')}>
                {m === 'kwh' ? 'kWh' : 'W'}
              </button>
            ))}
          </span>
        </span>
        <span className="font-medium tabular">
          {show(value(sel))} <span className="text-muted">· {formatMoney(sel.cost, currency)}</span>
        </span>
      </div>
      <div className="relative" style={{ height }}>
        {/* grid lines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-border/70" style={{ bottom: `${f * 100}%` }} aria-hidden />
        ))}
        <div role="list" aria-label={`${metric === 'kwh' ? 'Energy' : 'Average power'} per ${range === 'day' ? 'hour' : 'day'}, total ${formatKwh(total)}`} className="relative flex h-full items-end gap-px" onMouseLeave={() => setActive(null)}>
          {points.map((p, i) => (
            <button
              key={p.t}
              role="listitem"
              aria-label={`${label(p.t)}: ${show(value(p))}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className="group flex h-full flex-1 cursor-pointer items-end focus-visible:outline-offset-0"
            >
              <span
                style={{ height: `${Math.max((value(p) / max) * 100, p.kwh > 0 ? 2 : 0.5)}%` }}
                className={cn('block w-full rounded-t-[2px] transition-colors duration-fast', i === shown ? 'bg-on' : 'bg-fg/20 group-hover:bg-fg/40')}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-caption text-subtle tabular" aria-hidden>
        <span>{label(points[0].t)}</span>
        <span>{label(points[points.length - 1].t)}</span>
      </div>
    </div>
  )
}
