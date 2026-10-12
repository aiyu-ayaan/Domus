import { useState } from 'react'
import { t } from '@/lib/i18n'
import { formatBucket, formatTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { TrendPoint } from './TrendChart'

/**
 * A week as a grid: a row per day, a column per hour, a darker cell for a higher value. It shows when in
 * the day something happens, which a line over the same week hides. `points` are hourly buckets
 * (the "hours" history range); each cell is focusable and the selected one's value is shown above.
 * `tone` picks a cell's colour class from its value (neutral by default).
 */
export function HourGrid({
  points,
  format,
  tone = () => 'bg-fg',
  label,
  empty,
}: {
  points: TrendPoint[]
  format: (value: number) => string
  tone?: (value: number) => string
  label: string
  empty: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const measured = points.flatMap((p, i) => (p.value == null ? [] : [i]))
  if (measured.length === 0) {
    return <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-label text-subtle">{empty}</div>
  }
  const max = Math.max(...measured.map((i) => points[i].value!), 0.0001)
  // The viewer's days, in order, each with its 24 hours (a missing hour stays empty).
  const days: { key: string; t: string; cells: (number | undefined)[] }[] = []
  points.forEach((p, i) => {
    const d = new Date(p.t)
    const key = d.toDateString()
    if (days[days.length - 1]?.key !== key) days.push({ key, t: p.t, cells: Array(24).fill(undefined) })
    days[days.length - 1].cells[d.getHours()] = i
  })
  const when = (ts: string) => t('chart.dayHour', { day: formatBucket(ts, 'week'), hour: formatBucket(ts, 'day') })
  const text = (v: number | null) => (v == null ? t('chart.noReading') : format(v))
  const sel = points[active ?? measured[measured.length - 1]]
  const hourAt = (h: number) => formatTime(new Date(2000, 0, 1, h))

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3 text-label" aria-live="polite">
        <span className="text-muted">{when(sel.t)}</span>
        <span className="font-medium tabular">{text(sel.value)}</span>
      </div>
      <div role="list" aria-label={label} className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] items-center gap-0.5" onMouseLeave={() => setActive(null)}>
        {days.map((day) => (
          <div key={day.key} className="contents">
            <span className="pr-2 text-caption text-subtle tabular" aria-hidden>{formatBucket(day.t, 'week')}</span>
            {day.cells.map((i, h) => {
              const v = i == null ? null : points[i].value
              if (i == null) return <span key={h} className="h-5" aria-hidden />
              return (
                <button
                  key={h}
                  role="listitem"
                  aria-label={`${when(points[i].t)}: ${text(v)}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  className={cn('relative h-5 cursor-pointer overflow-hidden rounded-[2px] bg-raised focus-visible:outline-offset-0', points[i] === sel && 'ring-1 ring-fg')}
                >
                  {v != null && <span className={cn('absolute inset-0', tone(v))} style={{ opacity: 0.15 + 0.85 * (v / max) }} />}
                </button>
              )
            })}
          </div>
        ))}
        <span />
        {[0, 6, 12, 18].map((h) => (
          <span key={h} className="col-span-6 pt-1 text-caption text-subtle tabular" aria-hidden>{hourAt(h)}</span>
        ))}
      </div>
    </div>
  )
}
