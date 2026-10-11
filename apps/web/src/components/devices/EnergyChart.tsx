import { t } from '@/lib/i18n'
import { useState } from 'react'
import { bucketOf, formatBucket, formatKwh, formatMoney, type Range } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { EnergyPoint } from '@/lib/types'
import { TrendChart } from './TrendChart'

/** Energy as a bar chart with focusable bars, or the measured power as a line; the selected value is shown above. */
export function EnergyChart({ points, range, currency, height = 160 }: { points: EnergyPoint[]; range: Range; currency: string; height?: number }) {
  const [active, setActive] = useState<number | null>(null)
  const [metric, setMetric] = useState<'kwh' | 'watts'>('kwh')
  const max = Math.max(...points.map((p) => p.kwh), 0.0001)
  const total = points.reduce((s, p) => s + p.kwh, 0)
  const label = (t: string) => formatBucket(t, range)
  // Live samples carry no energy yet, only the power being drawn.
  if (range === 'live') return <TrendChart points={points.map((p) => ({ t: p.t, value: p.watts }))} range={range} unit="W" empty={t('chart.waiting')} height={height} />
  if (!points.length || total === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-label text-subtle" style={{ height }}>
        {t('chart.noConsumption')}
      </div>
    )
  }
  const toggle = (
    <span role="group" aria-label={t('chart.unit')} className="flex rounded-md border border-border text-caption">
      {(['kwh', 'watts'] as const).map((m) => (
        <button key={m} aria-pressed={metric === m} onClick={() => setMetric(m)} className={cn('cursor-pointer px-1.5 py-0.5', metric === m ? 'bg-raised text-fg' : 'text-muted')}>
          {m === 'kwh' ? 'kWh' : 'W'}
        </button>
      ))}
    </span>
  )
  if (metric === 'watts') {
    return (
      <div>
        <div className="mb-2 flex">{toggle}</div>
        <TrendChart points={points.map((p) => ({ t: p.t, value: p.watts }))} range={range} unit="W" empty={t('chart.noPower')} height={height} />
      </div>
    )
  }
  const shown = active ?? points.length - 1
  const sel = points[shown]
  return (
    <div>
      <div className="mb-2 flex">{toggle}</div>
      <div className="mb-3 flex items-baseline justify-between gap-3 text-label" aria-live="polite">
        <span className="text-muted">{label(sel.t)}</span>
        <span className="font-medium tabular">
          {formatKwh(sel.kwh)} <span className="text-muted">· {formatMoney(sel.cost, currency)}</span>
        </span>
      </div>
      <div className="relative" style={{ height }}>
        {/* grid lines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-border/70" style={{ bottom: `${f * 100}%` }} aria-hidden />
        ))}
        <div role="list" aria-label={t('chart.energyPer', { bucket: bucketOf(range), total: formatKwh(total) })} className="relative flex h-full items-end gap-px" onMouseLeave={() => setActive(null)}>
          {points.map((p, i) => (
            <button
              key={p.t}
              role="listitem"
              aria-label={`${label(p.t)}: ${formatKwh(p.kwh)}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className="group flex h-full flex-1 cursor-pointer items-end focus-visible:outline-offset-0"
            >
              <span
                style={{ height: `${Math.max((p.kwh / max) * 100, p.kwh > 0 ? 2 : 0.5)}%` }}
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
