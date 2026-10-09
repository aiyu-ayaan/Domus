const nf = (digits: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 })

export const formatWatts = (w?: number | null) => {
  if (w == null) return '—'
  w = Math.abs(w) < 0.05 ? 0 : w
  return w >= 1000 ? `${nf(2).format(w / 1000)} kW` : `${nf(w < 10 ? 1 : 0).format(w)} W`
}

export const formatKwh = (kwh?: number | null) => {
  if (kwh == null) return '—'
  kwh = Math.max(kwh, 0)
  return kwh < 1 ? `${nf(0).format(kwh * 1000)} Wh` : `${nf(kwh < 10 ? 2 : 1).format(kwh)} kWh`
}

export const formatMoney = (value: number, currency: string) => {
  value = Math.abs(value) < 0.005 ? 0 : value
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 }).format(value)
  } catch {
    return `${nf(2).format(value)} ${currency}`
  }
}

export const formatNumber = (v: number | undefined | null, digits = 1) => (v == null ? '—' : nf(digits).format(v))

export const timeAgo = (iso?: string | null) => {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (s < 45) return 'just now'
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute')
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour')
  return rtf.format(-Math.round(s / 86400), 'day')
}

export const greeting = () => {
  const h = new Date().getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** PM2.5 µg/m³ → label and token colour. */
export const airQuality = (pm?: number) => {
  if (pm == null) return null
  if (pm <= 12) return { label: 'Excellent', tone: 'text-power' }
  if (pm <= 35) return { label: 'Good', tone: 'text-air' }
  if (pm <= 55) return { label: 'Moderate', tone: 'text-warn' }
  return { label: 'Poor', tone: 'text-danger' }
}
