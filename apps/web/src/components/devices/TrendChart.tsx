import { t } from '@/lib/i18n'
import { useState } from 'react'
import { bucketOf, formatBucket, formatNumber, type Range } from '@/lib/format'

export interface TrendPoint {
  t: string
  value: number | null
  /** The highest reading in the bucket, when the history has it: drawn as a fainter line above the average. */
  peak?: number | null
}

/** One device's line when several are compared; `values` follow the chart's `points`. */
export interface TrendSeries {
  name: string
  values: (number | null)[]
}

/** Neutral dash patterns that tell compared lines apart without colour. */
const DASHES = ['', '5 3', '1.5 3', '8 3 2 3', '3 2']
export const dashOf = (i: number) => DASHES[i % DASHES.length]

/**
 * Line chart of one reading over time, or of several devices' readings (`series`) side by side. Gaps (nothing measured) break the line.
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
  series,
}: {
  points: TrendPoint[]
  range: Range
  unit: string
  digits?: number
  marks?: { value: number; label: string }[]
  empty: string
  height?: number
  series?: TrendSeries[]
}) {
  const [active, setActive] = useState<number | null>(null)
  const lines = (series ?? [{ name: '', values: points.map((p) => p.value) }]).map((s) => ({
    name: s.name,
    measured: s.values.flatMap((v, i) => (v == null ? [] : [{ i, value: v }])),
  }))
  const measured = lines.flatMap((l) => l.measured)
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
  const shown = active ?? Math.max(...measured.map((m) => m.i))
  const sel = points[shown]
  const value = (v: number | null) => (v == null ? t('chart.noReading') : `${formatNumber(v, digits)} ${unit}`)

  return (
    <div>
      {series ? (
        <div className="mb-3 text-label" aria-live="polite">
          <span className="text-muted">{label(sel.t)}</span>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {series.map((s, k) => (
              <li key={s.name + k} className="flex items-center gap-1.5">
                <Swatch dash={dashOf(k)} />
                <span className="text-muted">{s.name}</span>
                <span className="font-medium tabular">{value(s.values[shown] ?? null)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mb-3 flex items-baseline justify-between gap-3 text-label" aria-live="polite">
          <span className="text-muted">{label(sel.t)}</span>
          <span className="font-medium tabular">
            {value(sel.value)}
            {sel.peak != null && <span className="font-normal text-muted"> · {t('chart.peak', { value: value(sel.peak) })}</span>}
          </span>
        </div>
      )}
      {/* Time runs left to right in every language. */}
      <div dir="ltr" className="relative" style={{ height }}>
        {marks.map((m) => (
          <div key={m.label} className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${y(m.value)}%` }} aria-hidden>
            <span className="absolute end-0 -translate-y-full text-caption text-subtle">{m.label}</span>
          </div>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {peaks.length > 0 && <path d={path(peaks)} fill="none" className="stroke-fg/25" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
          {lines.map((l, k) => (
            <path key={k} d={path(l.measured)} fill="none" className="stroke-fg/70" strokeWidth={1.5} strokeDasharray={series ? dashOf(k) : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </svg>
        {series && active != null && <div className="absolute inset-y-0 border-s border-border-strong" style={{ left: `${x(shown)}%` }} aria-hidden />}
        {(series ? series.map((s) => s.values[shown] ?? null) : [sel.value]).map(
          (v, k) => v != null && <span key={k} className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-on" style={{ left: `${x(shown)}%`, top: `${y(v)}%` }} aria-hidden />,
        )}
        <div role="list" aria-label={t('chart.trendPer', { bucket: bucketOf(range) })} className="absolute inset-0 flex" onMouseLeave={() => setActive(null)}>
          {points.map((p, i) => (
            <button
              key={p.t}
              role="listitem"
              aria-label={`${label(p.t)}: ${series ? series.map((s) => `${s.name} ${value(s.values[i] ?? null)}`).join(', ') : value(p.value)}`}
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

/** A short sample of a compared line, for the readout and the device picker. */
export function Swatch({ dash }: { dash: string }) {
  return (
    <svg width="16" height="6" className="shrink-0" aria-hidden>
      <line x1="0" y1="3" x2="16" y2="3" className="stroke-fg/70" strokeWidth={1.5} strokeDasharray={dash || undefined} strokeLinecap="round" />
    </svg>
  )
}
