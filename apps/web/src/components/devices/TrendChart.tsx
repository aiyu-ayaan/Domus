import { t } from '@/lib/i18n'
import { useState } from 'react'
import { bucketOf, formatBucket, formatNumber, type Range } from '@/lib/format'

export interface TrendPoint {
  t: string
  value: number | null
  /** The highest reading in the bucket, when the history has it: drawn as a fainter line above the average. */
  peak?: number | null
}

/**
 * Line chart of one reading over time. Gaps (nothing measured) break the line.
 * Each bucket is a focusable column; the selected one's value is shown above.
 * `marks` draws labelled reference lines (e.g. the WHO PM2.5 limits).
 */
export function TrendChart({
  points,
  range,
  unit,
  digits = 0,
  marks = [],
  empty,
  height = 200,
}: {
  points: TrendPoint[]
  range: Range
  unit: string
  digits?: number
  marks?: { value: number; label: string }[]
  empty: string
  height?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const measured = points.flatMap((p, i) => (p.value == null ? [] : [{ i, value: p.value }]))
  const label = (t: string) => formatBucket(t, range)
  if (measured.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-label text-subtle" style={{ height }}>
        {empty}
      </div>
    )
  }
  const peaks = points.flatMap((p, i) => (p.peak == null ? [] : [{ i, value: p.peak }]))
  const max = Math.max(...measured.map((m) => m.value), ...peaks.map((m) => m.value), ...marks.map((m) => m.value)) * 1.1 || 1
  const x = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 100)
  const y = (v: number) => 100 - (v / max) * 100
  // One path segment per run of consecutive measured buckets.
  const path = (line: typeof measured) => line.map((m, k) => `${k > 0 && line[k - 1].i === m.i - 1 ? 'L' : 'M'}${x(m.i)},${y(m.value)}`).join(' ')
  const shown = active ?? measured[measured.length - 1].i
  const sel = points[shown]
  const value = (v: number | null) => (v == null ? t('chart.noReading') : `${formatNumber(v, digits)} ${unit}`)

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3 text-label" aria-live="polite">
        <span className="text-muted">{label(sel.t)}</span>
        <span className="font-medium tabular">
          {value(sel.value)}
          {sel.peak != null && <span className="font-normal text-muted"> · {t('chart.peak', { value: value(sel.peak) })}</span>}
        </span>
      </div>
      {/* Time runs left to right in every language. */}
      <div dir="ltr" className="relative" style={{ height }}>
        {marks.map((m) => (
          <div key={m.label} className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${y(m.value)}%` }} aria-hidden>
            <span className="absolute end-0 -translate-y-full text-caption text-subtle">{m.label}</span>
          </div>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {peaks.length > 0 && <path d={path(peaks)} fill="none" className="stroke-fg/25" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
          <path d={path(measured)} fill="none" className="stroke-fg/70" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {sel.value != null && (
          <span className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-on" style={{ left: `${x(shown)}%`, top: `${y(sel.value)}%` }} aria-hidden />
        )}
        <div role="list" aria-label={t('chart.trendPer', { bucket: bucketOf(range) })} className="absolute inset-0 flex" onMouseLeave={() => setActive(null)}>
          {points.map((p, i) => (
            <button
              key={p.t}
              role="listitem"
              aria-label={`${label(p.t)}: ${value(p.value)}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className="h-full flex-1 cursor-pointer focus-visible:outline-offset-0"
            />
          ))}
        </div>
      </div>
      <div dir="ltr" className="mt-2 flex justify-between text-caption text-subtle tabular" aria-hidden>
        <span>{label(points[0].t)}</span>
        <span>{label(points[points.length - 1].t)}</span>
      </div>
    </div>
  )
}
