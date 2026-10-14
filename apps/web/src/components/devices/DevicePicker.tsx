import { t } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import { dashOf, Swatch } from './TrendChart'

/**
 * Which devices a history chart shows: none chosen is the home's combined line, otherwise one line per
 * chosen device, drawn with the dash shown on its chip.
 */
export function DevicePicker({ devices, value, onChange }: { devices: { id: string; name: string }[]; value: string[]; onChange: (ids: string[]) => void }) {
  if (devices.length < 2) return null
  const chip = (active: boolean) =>
    cn(
      'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-caption font-medium transition-colors duration-fast',
      active ? 'border-border-strong bg-raised text-fg' : 'border-border text-muted hover:text-fg',
    )
  return (
    <div role="group" aria-label={t('chart.devices')} className="mb-3 flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={value.length === 0} onClick={() => onChange([])} className={chip(value.length === 0)}>
        {t('chart.combined')}
      </button>
      {devices.map((d) => {
        const at = value.indexOf(d.id)
        return (
          <button key={d.id} type="button" aria-pressed={at >= 0} onClick={() => onChange(at >= 0 ? value.filter((id) => id !== d.id) : [...value, d.id])} className={chip(at >= 0)}>
            {at >= 0 && <Swatch dash={dashOf(at)} />}
            {d.name}
          </button>
        )
      })}
    </div>
  )
}
