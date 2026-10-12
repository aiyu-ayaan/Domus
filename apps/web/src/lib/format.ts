import { formatLocale, isRtl, t } from './i18n'

/**
 * Keeps a number and what is written around it ("12 W", "$1.50", "7:00 – 8:00") in that order inside right-to-left
 * text: a left-to-right mark in front makes the digits, and a Latin unit after them, one left-to-right run.
 */
export const ltr = (text: string) => (isRtl ? `\u200e${text}` : text)

const nf = (digits: number) => new Intl.NumberFormat(formatLocale, { maximumFractionDigits: digits, minimumFractionDigits: 0 })

export const formatWatts = (w?: number | null) => {
  if (w == null) return '—'
  w = Math.abs(w) < 0.05 ? 0 : w
  return ltr(w >= 1000 ? `${nf(2).format(w / 1000)} kW` : `${nf(w < 10 ? 1 : 0).format(w)} W`)
}

export const formatKwh = (kwh?: number | null) => {
  if (kwh == null) return '—'
  kwh = Math.max(kwh, 0)
  return ltr(kwh < 1 ? `${nf(0).format(kwh * 1000)} Wh` : `${nf(kwh < 10 ? 2 : 1).format(kwh)} kWh`)
}

export const formatMoney = (value: number, currency: string) => {
  value = Math.abs(value) < 0.005 ? 0 : value
  try {
    return ltr(new Intl.NumberFormat(formatLocale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 }).format(value))
  } catch {
    return ltr(`${nf(2).format(value)} ${currency}`)
  }
}

export const formatNumber = (v: number | undefined | null, digits = 1) => (v == null ? '—' : ltr(nf(digits).format(v)))

export const timeAgo = (iso?: string | null) => {
  if (!iso) return t('time.never')
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(formatLocale, { numeric: 'auto' })
  if (s < 45) return t('time.justNow')
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute')
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour')
  return rtf.format(-Math.round(s / 86400), 'day')
}

const hour12Option = (): { hour12?: boolean } => {
  const h12 = (window as unknown as { domus?: { hour12?: boolean } }).domus?.hour12
  return typeof h12 === 'boolean' ? { hour12: h12 } : {}
}

/** Formats a Date or ISO timestamp as a clock time following the device/OS 12/24-hour preference. */
export const formatTime = (value: Date | string) => {
  const d = typeof value === 'string' ? new Date(value) : value
  return ltr(d.toLocaleTimeString(formatLocale, { hour: 'numeric', minute: '2-digit', ...hour12Option() }))
}

/** Formats a stored 24-hour rule time ("HH:MM", e.g. "07:00" or "22:00") following the device/OS 12/24-hour preference. */
export const formatClockTime = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return hhmm
  return formatTime(new Date(2000, 0, 1, Number(m[1]), Number(m[2])))
}

/**
 * A chart range: "live" is what the devices report now, sampled by the page (`useLive`); "hour" is the last
 * 60 minutes with a bucket a minute; the others have hourly or daily buckets.
 */
export type Range = 'live' | 'hour' | 'day' | 'week' | 'month'

/** What one bucket of a range covers. */
export const bucketOf = (range: Range) => t(`range.bucket.${range === 'week' || range === 'month' ? 'week' : range}`)

/**
 * Formats a chart bucket timestamp on the viewer's clock: the minute for the 60 min range, the hour's span
 * ("12:00 am – 1:00 am") for 24h, weekday+day for 7d, month+day for 30d.
 */
export const formatBucket = (iso: string, range: Range) => {
  const d = new Date(iso)
  if (range === 'live') return d.toLocaleTimeString(formatLocale, { hour: 'numeric', minute: '2-digit', second: '2-digit', ...hour12Option() })
  if (range === 'hour') return formatTime(d)
  return range === 'day'
    ? ltr(`${formatTime(d)} – ${formatTime(new Date(d.getTime() + 3_600_000))}`)
    : d.toLocaleDateString(formatLocale, range === 'week' ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' })
}

export const greeting = () => {
  const h = new Date().getHours()
  if (h < 5) return t('greeting.night')
  if (h < 12) return t('greeting.morning')
  if (h < 18) return t('greeting.afternoon')
  return t('greeting.evening')
}

/** PM2.5 µg/m³ → label and token colour. */
export const airQuality = (pm?: number) => {
  if (pm == null) return null
  if (pm <= 12) return { label: t('air.excellent'), tone: 'text-on', bg: 'bg-on' }
  if (pm <= 35) return { label: t('air.good'), tone: 'text-on', bg: 'bg-on' }
  if (pm <= 55) return { label: t('air.moderate'), tone: 'text-warn', bg: 'bg-warn' }
  return { label: t('air.poor'), tone: 'text-danger', bg: 'bg-danger' }
}

