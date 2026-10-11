import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, Metric, PageHeader, Skeleton } from '@/components/ui/Card'
import { CalendarBlank, CalendarDot, CalendarDots, Clock, Pulse } from '@phosphor-icons/react'
import { Segmented } from '@/components/ui/Controls'
import { Field, SelectField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { EnergyChart } from '@/components/devices/EnergyChart'
import { api } from '@/lib/api'
import { useLive } from '@/lib/liveSamples'
import { useIsAdmin } from '@/lib/auth'
import { keys, useDevices, useEnergy } from '@/lib/queries'
import { formatBucket, formatKwh, formatMoney, formatNumber, formatWatts, type Range } from '@/lib/format'
import { errorMessage, useToast } from '@/lib/toast'
import type { ElectricitySettings, EnergyOverview, EnergyPoint } from '@/lib/types'

const RANGES = [
  { value: 'live' as const, label: 'Live', icon: Pulse },
  { value: 'hour' as const, label: '1 min', icon: Clock },
  { value: 'day' as const, label: '24 hours', icon: CalendarDot },
  { value: 'week' as const, label: '7 days', icon: CalendarDots },
  { value: 'month' as const, label: '30 days', icon: CalendarBlank },
]

export function EnergyView() {
  const admin = useIsAdmin()
  const { data: o, isLoading } = useEnergy()
  const { data: devices } = useDevices()
  const [range, setRange] = useState<Range>('day')
  const history = useQuery({ queryKey: keys.energyHistory(range), queryFn: () => api.energyHistory(range as Exclude<Range, 'live'>), enabled: range !== 'live', refetchInterval: 60_000 })
  // Watts come from the live device list; kWh and cost from the periodic energy query.
  const power = new Map((devices ?? []).map((d) => [d.id, d.is_online ? d.state.current_power_watts ?? 0 : 0]))
  const watts = (id: string, fallback: number) => power.get(id) ?? fallback
  const totalWatts = o ? o.devices.reduce((sum, d) => sum + watts(d.device_id, d.current_watts), 0) : null
  const live = useLive(() => ({ kwh: 0, cost: 0, watts: totalWatts }))
  // The insights always compare against today's hours and the last 7 days, whatever range the chart shows.
  const day = useQuery({ queryKey: keys.energyHistory('day'), queryFn: () => api.energyHistory('day'), refetchInterval: 60_000 })
  const week = useQuery({ queryKey: keys.energyHistory('week'), queryFn: () => api.energyHistory('week'), refetchInterval: 60_000 })

  if (isLoading || !o) return <Skeleton className="h-64" />
  const currency = o.settings.currency
  const end = new Date(o.cycle_start)
  end.setDate(end.getDate() + o.cycle_days - 1)
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const maxKwh = Math.max(...o.devices.map((d) => d.kwh), 0.0001)

  return (
    <>
      <PageHeader title="Energy" description={`Billing cycle ${fmt(new Date(o.cycle_start))} – ${fmt(end)} · day ${o.cycle_day} of ${o.cycle_days}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Power now" live value={formatWatts(totalWatts)} />
        <Metric label="Today" value={formatKwh(o.today_kwh)} sub={formatMoney(o.today_cost, currency)} />
        <Metric label="Bill so far" value={formatMoney(o.cycle_cost, currency)} sub={`${formatKwh(o.cycle_kwh)} this cycle`} />
        <Metric
          label="Projected bill"
          value={formatMoney(o.projected_cost, currency)}
          sub={o.budget_used_percent != null ? `${formatNumber(o.budget_used_percent, 0)}% of budget used` : `≈ ${formatKwh(o.projected_kwh)}`}
        />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Consumption"
          action={
            <Segmented<Range> size="sm" label="Range" value={range} onChange={setRange} options={RANGES} />
          }
        />
        <div className="p-4">{range !== 'live' && history.isLoading ? <Skeleton className="h-[220px]" /> : <EnergyChart points={range === 'live' ? live : history.data ?? []} range={range} currency={currency} height={220} />}</div>
      </Card>

      <Insights o={o} day={day.data ?? []} week={week.data ?? []} />

      <Card className="mt-6">
        <CardHeader title="By device · this cycle" />
        {o.devices.length === 0 ? (
          <p className="px-4 py-6 text-label text-muted">Devices with power metering, such as the Tapo P110 or Tuya energy plugs, appear here.</p>
        ) : (
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-border text-left text-label text-muted">
                <th className="px-4 py-2 font-medium">Device</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Share</th>
                <th className="px-4 py-2 text-right font-medium">Now</th>
                <th className="px-4 py-2 text-right font-medium">Energy</th>
                <th className="px-4 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular">
              {o.devices.map((d) => (
                <tr key={d.device_id}>
                  <td className="max-w-[10rem] truncate px-4 py-2.5">{d.name}</td>
                  <td className="hidden w-1/3 px-4 sm:table-cell">
                    <div className="h-1.5 rounded-full bg-raised">
                      <div className="h-full rounded-full bg-fg/70" style={{ width: `${(d.kwh / maxKwh) * 100}%` }} />
                    </div>
                  </td>
                  <td className="px-4 text-right text-muted">{formatWatts(watts(d.device_id, d.current_watts))}</td>
                  <td className="px-4 text-right">{formatKwh(d.kwh)}</td>
                  <td className="px-4 text-right">{formatMoney(d.cost, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {admin && <Plan initial={o.settings} />}
    </>
  )
}

/** What the numbers mean: when power is used, how today compares, who uses it, and how the bill is tracking. */
function Insights({ o, day, week }: { o: EnergyOverview; day: EnergyPoint[]; week: EnergyPoint[] }) {
  const currency = o.settings.currency
  const peak = day.reduce<EnergyPoint | null>((best, p) => (p.kwh > (best?.kwh ?? 0) ? p : best), null)
  // Days before today that recorded anything: an empty day means "not measured yet", not "used nothing".
  const earlier = week.slice(0, -1).filter((p) => p.kwh > 0)
  const average = earlier.length ? earlier.reduce((s, p) => s + p.kwh, 0) / earlier.length : null
  const change = average ? ((o.today_kwh - average) / average) * 100 : null
  const top = o.devices.reduce<EnergyOverview['devices'][number] | null>((best, d) => (d.kwh > (best?.kwh ?? 0) ? d : best), null)
  const elapsed = (o.cycle_day / o.cycle_days) * 100
  const budget = o.settings.monthly_budget
  const spent = budget ? Math.min((o.cycle_cost / budget) * 100, 100) : null

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Insights" />
        <dl className="grid grid-cols-2 divide-border max-sm:divide-y sm:grid-cols-4 sm:divide-x">
          <Insight
            label="Peak hour (24 h)"
            value={peak ? formatBucket(peak.t, 'hour') : '—'}
            sub={peak ? formatKwh(peak.kwh) : 'No usage yet'}
          />
          <Insight label="Daily average" value={average != null ? formatKwh(average) : '—'} sub={average != null ? `Over the last ${earlier.length} ${earlier.length === 1 ? 'day' : 'days'}` : 'Needs a full day'} />
          <Insight
            label="Today vs average"
            value={change != null ? `${change > 0 ? '+' : ''}${formatNumber(change, 0)}%` : '—'}
            sub={change == null ? 'Needs a full day' : change > 10 ? 'Above your usual day' : change < -10 ? 'Below your usual day' : 'About your usual day'}
          />
          <Insight label="Top device" value={top ? `${formatNumber((top.kwh / Math.max(o.cycle_kwh, 0.0001)) * 100, 0)}%` : '—'} sub={top?.name ?? 'No metered device'} />
        </dl>
      </Card>

      <Card>
        <CardHeader title="Billing cycle" />
        <div className="space-y-4 p-4">
          <Progress label="Time elapsed" value={`Day ${o.cycle_day} of ${o.cycle_days}`} percent={elapsed} />
          {spent != null ? (
            <Progress label="Budget used" value={`${formatMoney(o.cycle_cost, currency)} of ${formatMoney(budget!, currency)}`} percent={spent} warn={spent > elapsed + 10} />
          ) : (
            <p className="text-label text-muted">Set a monthly budget in the plan below to track spending against it.</p>
          )}
          <p className="text-label text-muted tabular">
            On track for {formatMoney(o.projected_cost, currency)} ({formatKwh(o.projected_kwh)}) by the end of the cycle.
          </p>
        </div>
      </Card>
    </div>
  )
}

function Insight({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="p-4">
      <dt className="text-label text-muted">{label}</dt>
      <dd className="mt-1 text-title font-semibold tabular">{value}</dd>
      <dd className="mt-0.5 truncate text-label text-muted tabular">{sub}</dd>
    </div>
  )
}

function Progress({ label, value, percent, warn }: { label: string; value: string; percent: number; warn?: boolean }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between gap-3 text-label">
        <span className="text-muted">{label}</span>
        <span className="tabular">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-raised" role="progressbar" aria-label={label} aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
        <div className={warn ? 'h-full rounded-full bg-warn' : 'h-full rounded-full bg-fg/70'} style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
      </div>
      {warn && <p className="mt-1 text-caption text-warn">Spending is ahead of the calendar.</p>}
    </div>
  )
}

/** Every ISO 4217 currency the browser knows, labelled with its name. */
function useCurrencies(current: string) {
  return useMemo(() => {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    const codes = intl.supportedValuesOf?.('currency') ?? ['EUR', 'GBP', 'INR', 'USD']
    let names: Intl.DisplayNames | null = null
    try {
      names = new Intl.DisplayNames(undefined, { type: 'currency' })
    } catch {
      /* older browsers: codes only */
    }
    return [...new Set([...codes, current])].sort().map((c) => ({ code: c, label: `${c} — ${names?.of(c) ?? c}` }))
  }, [current])
}

type SlabRow = { up_to_kwh: string; rate: string }

function Plan({ initial }: { initial: ElectricitySettings }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [s, setS] = useState({
    rate_per_kwh: String(initial.rate_per_kwh),
    currency: initial.currency,
    monthly_budget: initial.monthly_budget != null ? String(initial.monthly_budget) : '',
    billing_cycle_day: String(initial.billing_cycle_day),
    fixed_monthly_charge: String(initial.fixed_monthly_charge),
  })
  const [slabbed, setSlabbed] = useState(initial.slabs.length > 0)
  const [slabs, setSlabs] = useState<SlabRow[]>(
    initial.slabs.length
      ? initial.slabs.map((x) => ({ up_to_kwh: x.up_to_kwh == null ? '' : String(x.up_to_kwh), rate: String(x.rate) }))
      : [
          { up_to_kwh: '100', rate: '' },
          { up_to_kwh: '', rate: '' },
        ],
  )
  const currencies = useCurrencies(s.currency)
  const setSlab = (i: number, k: keyof SlabRow, v: string) => setSlabs(slabs.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const save = useMutation({
    mutationFn: () =>
      api.saveEnergySettings({
        rate_per_kwh: Number(s.rate_per_kwh),
        currency: s.currency,
        monthly_budget: s.monthly_budget ? Number(s.monthly_budget) : null,
        billing_cycle_day: Number(s.billing_cycle_day),
        fixed_monthly_charge: Number(s.fixed_monthly_charge || 0),
        slabs: slabbed
          ? slabs.map((x, i) => ({ up_to_kwh: x.up_to_kwh === '' || i === slabs.length - 1 ? null : Number(x.up_to_kwh), rate: Number(x.rate) }))
          : [],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['energy'] })
      toast.push({ tone: 'success', title: 'Electricity plan saved' })
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not save', message: errorMessage(e) }),
  })
  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value })
  return (
    <Card className="mt-6">
      <CardHeader title="Electricity plan" />
      <form
        className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
          <span className="text-label font-medium text-fg">Pricing</span>
          <Segmented
            size="sm"
            label="Pricing"
            value={slabbed ? 'slabs' : 'flat'}
            onChange={(v) => setSlabbed(v === 'slabs')}
            options={[
              { value: 'flat', label: 'Flat rate' },
              { value: 'slabs', label: 'Slabs (per units)' },
            ]}
          />
        </div>
        {slabbed ? (
          <fieldset className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
            <legend className="mb-1 text-label text-muted">Units (kWh) per billing cycle, billed slab by slab — e.g. MSEDCL: 0–100, 101–300, 301–500, above 500.</legend>
            {slabs.map((x, i) => {
              const last = i === slabs.length - 1
              const from = i === 0 ? 0 : Number(slabs[i - 1].up_to_kwh || 0)
              return (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                  {last ? (
                    <Field label={i === 0 ? 'Units' : `Above ${formatNumber(from, 0)} units`} disabled value="" placeholder="and above" />
                  ) : (
                    <Field label={`From ${formatNumber(from, 0)} up to`} type="number" min="0" step="1" required value={x.up_to_kwh} onChange={(e) => setSlab(i, 'up_to_kwh', e.target.value)} />
                  )}
                  <Field label="Price per unit" type="number" step="0.0001" min="0" required value={x.rate} onChange={(e) => setSlab(i, 'rate', e.target.value)} />
                  <Button variant="ghost" size="sm" aria-label="Remove slab" disabled={slabs.length < 2} onClick={() => setSlabs(slabs.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              )
            })}
            <div>
              <Button size="sm" onClick={() => setSlabs([...slabs.slice(0, -1), { up_to_kwh: '', rate: '' }, slabs[slabs.length - 1]])}>
                Add slab
              </Button>
            </div>
          </fieldset>
        ) : (
          <Field label="Price per kWh" type="number" step="0.0001" min="0" required value={s.rate_per_kwh} onChange={set('rate_per_kwh')} />
        )}
        <SelectField label="Currency" required value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })}>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <Field label="Fixed monthly charge" type="number" step="0.01" min="0" value={s.fixed_monthly_charge} onChange={set('fixed_monthly_charge')} hint="Meter rent and fixed fees." />
        <Field label="Monthly budget" type="number" step="0.01" min="0" value={s.monthly_budget} onChange={set('monthly_budget')} hint="Optional." />
        <Field label="Billing cycle starts on day" type="number" min="1" max="28" required value={s.billing_cycle_day} onChange={set('billing_cycle_day')} hint="1–28." />
        <div className="flex items-end">
          <Button type="submit" variant="primary" loading={save.isPending} className="w-full sm:w-auto">
            Save plan
          </Button>
        </div>
      </form>
    </Card>
  )
}
