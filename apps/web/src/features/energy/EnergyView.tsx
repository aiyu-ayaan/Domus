import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, Metric, PageHeader, Skeleton } from '@/components/ui/Card'
import { CalendarBlank, CalendarDot, CalendarDots, Clock, Pulse } from '@phosphor-icons/react'
import { Segmented } from '@/components/ui/Controls'
import { Field, SelectField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { EnergyChart } from '@/components/devices/EnergyChart'
import { TrendChart } from '@/components/devices/TrendChart'
import { DevicePicker } from '@/components/devices/DevicePicker'
import { HourGrid } from '@/components/devices/HourGrid'
import { api } from '@/lib/api'
import { useLive } from '@/lib/liveSamples'
import { useIsAdmin } from '@/lib/auth'
import { t, formatLocale } from '@/lib/i18n'
import { keys, useDevices, useEnergy } from '@/lib/queries'
import { formatBucket, formatKwh, formatMoney, formatNumber, formatWatts, ltr, type Range } from '@/lib/format'
import { errorMessage, useToast } from '@/lib/toast'
import type { ElectricitySettings, EnergyOverview, EnergyPoint } from '@/lib/types'

const RANGES = [
  { value: 'live' as const, label: 'common.live', icon: Pulse },
  { value: 'hour' as const, label: 'energy.range.hour', icon: Clock },
  { value: 'day' as const, label: 'energy.range.day', icon: CalendarDot },
  { value: 'week' as const, label: 'energy.range.week', icon: CalendarDots },
  { value: 'month' as const, label: 'energy.range.month', icon: CalendarBlank },
]

export function EnergyView() {
  const admin = useIsAdmin()
  const { data: o, isLoading } = useEnergy()
  const { data: devices } = useDevices()
  const [range, setRange] = useState<Range>('day')
  // Devices compared line by line; none is the home's combined chart.
  const [picked, setPicked] = useState<string[]>([])
  const history = useQuery({ queryKey: keys.energyHistory(range), queryFn: () => api.energyHistory(range as Exclude<Range, 'live'>), enabled: range !== 'live', refetchInterval: 60_000 })
  const perDevice = useQueries({
    queries: picked.map((id) => ({ queryKey: keys.energyHistory(range, id), queryFn: () => api.energyHistory(range as Exclude<Range, 'live'>, id), enabled: range !== 'live', refetchInterval: 60_000 })),
  })
  // Watts come from the live device list; kWh and cost from the periodic energy query.
  const power = new Map((devices ?? []).map((d) => [d.id, d.is_online ? d.state.current_power_watts ?? 0 : 0]))
  const watts = (id: string, fallback: number) => power.get(id) ?? fallback
  const totalWatts = o ? o.devices.reduce((sum, d) => sum + watts(d.device_id, d.current_watts), 0) : null
  const live = useLive(() => ({ kwh: 0, cost: 0, watts: totalWatts, by: Object.fromEntries(power) }))
  // The insights always compare against today's hours and the last 7 days, whatever range the chart shows.
  const day = useQuery({ queryKey: keys.energyHistory('day'), queryFn: () => api.energyHistory('day'), refetchInterval: 60_000 })
  const week = useQuery({ queryKey: keys.energyHistory('week'), queryFn: () => api.energyHistory('week'), refetchInterval: 60_000 })
  const hours = useQuery({ queryKey: keys.energyHistory('hours'), queryFn: () => api.energyHistory('hours'), refetchInterval: 300_000 })

  if (isLoading || !o) return <Skeleton className="h-64" />
  const currency = o.settings.currency
  const end = new Date(o.cycle_start)
  end.setDate(end.getDate() + o.cycle_days - 1)
  const fmt = (d: Date) => d.toLocaleDateString(formatLocale, { day: 'numeric', month: 'short' })
  const maxKwh = Math.max(...o.devices.map((d) => d.kwh), 0.0001)

  return (
    <>
      <PageHeader title={t('nav.energy')} description={t('energy.cycleSubtitle', { start: fmt(new Date(o.cycle_start)), end: fmt(end), day: o.cycle_day, days: o.cycle_days })} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label={t('overview.powerNow')} live value={formatWatts(totalWatts)} />
        <Metric label={t('overview.today')} value={formatKwh(o.today_kwh)} sub={formatMoney(o.today_cost, currency)} />
        <Metric label={t('energy.billSoFar')} value={formatMoney(o.cycle_cost, currency)} sub={t('energy.thisCycle', { kwh: formatKwh(o.cycle_kwh) })} />
        <Metric
          label={t('energy.projectedBill')}
          value={formatMoney(o.projected_cost, currency)}
          sub={o.budget_used_percent != null ? t('energy.percentOfBudget', { percent: formatNumber(o.budget_used_percent, 0) }) : ltr(`≈ ${formatKwh(o.projected_kwh)}`)}
        />
      </div>

      <Card className="mt-6">
        <CardHeader
          title={t('energy.consumption')}
          action={
            <Segmented<Range> size="sm" label={t('energy.range')} value={range} onChange={setRange} options={RANGES.map((r) => ({ ...r, label: t(r.label) }))} />
          }
        />
        <div className="p-4">
          <DevicePicker devices={o.devices.map((d) => ({ id: d.device_id, name: d.name }))} value={picked} onChange={setPicked} />
          {range !== 'live' && (history.isLoading || perDevice.some((q) => q.isLoading)) ? (
            <Skeleton className="h-[220px]" />
          ) : picked.length ? (
            // Compared devices: energy per bucket, or the power each draws while live.
            <TrendChart
              points={(range === 'live' ? live : history.data ?? []).map((p) => ({ t: p.t, value: null }))}
              series={picked.map((id, k) => ({
                name: o.devices.find((d) => d.device_id === id)?.name ?? '—',
                values: range === 'live' ? live.map((p) => p.by[id] ?? null) : (perDevice[k].data ?? []).map((p) => (p.kwh > 0 || p.watts != null ? p.kwh : null)),
              }))}
              range={range}
              unit={range === 'live' ? 'W' : 'kWh'}
              digits={range === 'live' ? 0 : 2}
              empty={range === 'live' ? t('chart.waiting') : t('chart.noConsumption')}
              height={220}
            />
          ) : (
            <EnergyChart points={range === 'live' ? live : history.data ?? []} range={range} currency={currency} height={220} />
          )}
        </div>
      </Card>

      <Insights o={o} day={day.data ?? []} week={week.data ?? []} />

      <Card className="mt-6">
        <CardHeader title={t('energy.byHour')} />
        <div className="p-4">
          {hours.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            // An hour without a sample was not measured, which is not the same as using nothing.
            <HourGrid points={(hours.data ?? []).map((p) => ({ t: p.t, value: p.kwh > 0 || p.watts != null ? p.kwh : null }))} format={formatKwh} label={t('energy.byHour')} empty={t('chart.noConsumption')} />
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title={t('energy.byDevice')} />
        {o.devices.length === 0 ? (
          <p className="px-4 py-6 text-label text-muted">{t('energy.noMeteredDevices')}</p>
        ) : (
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-border text-start text-label text-muted">
                <th className="px-4 py-2 font-medium">{t('device.type.other')}</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">{t('energy.col.share')}</th>
                <th className="px-4 py-2 text-end font-medium">{t('energy.col.now')}</th>
                <th className="px-4 py-2 text-end font-medium">{t('nav.energy')}</th>
                <th className="px-4 py-2 text-end font-medium">{t('energy.col.cost')}</th>
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
                  <td className="px-4 text-end text-muted">{formatWatts(watts(d.device_id, d.current_watts))}</td>
                  <td className="px-4 text-end">{formatKwh(d.kwh)}</td>
                  <td className="px-4 text-end">{formatMoney(d.cost, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {o.devices.some((d) => d.standby_watts != null) && (
        <Card className="mt-6">
          <CardHeader title={t('energy.standby.title')} />
          <p className="px-4 pt-3 text-label text-muted">{t('energy.standby.hint')}</p>
          <ul className="divide-y divide-border tabular">
            {o.devices
              .filter((d) => d.standby_watts != null)
              .sort((a, b) => (b.standby_monthly_cost ?? 0) - (a.standby_monthly_cost ?? 0))
              .map((d) => (
                <li key={d.device_id} className="flex min-h-11 items-center justify-between gap-4 px-4 py-2 text-body">
                  <span className="min-w-0 truncate">{d.name}</span>
                  <span className="shrink-0 text-muted">
                    {t('energy.standby.cost', { watts: formatWatts(d.standby_watts), cost: formatMoney(d.standby_monthly_cost ?? 0, currency) })}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}

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
        <CardHeader title={t('energy.insights')} />
        <dl className="grid grid-cols-2 divide-border max-sm:divide-y sm:grid-cols-4 sm:divide-x">
          <Insight
            label={t('energy.peakHour')}
            value={peak ? formatBucket(peak.t, 'hour') : '—'}
            sub={peak ? formatKwh(peak.kwh) : t('energy.noUsageYet')}
          />
          <Insight label={t('energy.dailyAverage')} value={average != null ? formatKwh(average) : '—'} sub={average != null ? t('energy.overLastDays', { count: earlier.length }) : t('energy.needsFullDay')} />
          <Insight
            label={t('energy.todayVsAverage')}
            value={change != null ? ltr(`${change > 0 ? '+' : ''}${formatNumber(change, 0)}%`) : '—'}
            sub={change == null ? t('energy.needsFullDay') : change > 10 ? t('energy.aboveUsual') : change < -10 ? t('energy.belowUsual') : t('energy.aboutUsual')}
          />
          <Insight label={t('energy.topDevice')} value={top ? `${formatNumber((top.kwh / Math.max(o.cycle_kwh, 0.0001)) * 100, 0)}%` : '—'} sub={top?.name ?? t('energy.noMeteredDevice')} />
        </dl>
      </Card>

      <Card>
        <CardHeader title={t('energy.billingCycle')} />
        <div className="space-y-4 p-4">
          <Progress label={t('energy.timeElapsed')} value={t('energy.dayOfDays', { day: o.cycle_day, days: o.cycle_days })} percent={elapsed} />
          {spent != null ? (
            <Progress label={t('insights.budgetUsed')} value={t('energy.spentOfBudget', { spent: formatMoney(o.cycle_cost, currency), budget: formatMoney(budget!, currency) })} percent={spent} warn={spent > elapsed + 10} />
          ) : (
            <p className="text-label text-muted">{t('energy.setBudgetHint')}</p>
          )}
          <p className="text-label text-muted tabular">
            {t('energy.onTrackFor', { cost: formatMoney(o.projected_cost, currency), kwh: formatKwh(o.projected_kwh) })}
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
      {warn && <p className="mt-1 text-caption text-warn">{t('energy.spendingAhead')}</p>}
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
  const [windows, setWindows] = useState(initial.time_of_use.map((w) => ({ ...w, adjust: String(w.adjust) })))
  const setWindow = (i: number, k: 'start' | 'end' | 'adjust', v: string) => setWindows(windows.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
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
        time_of_use: windows.map((w) => ({ ...w, adjust: Number(w.adjust) })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['energy'] })
      toast.push({ tone: 'success', title: t('energy.plan.saved') })
    },
    onError: (e) => toast.push({ tone: 'error', title: t('drawer.saveFailed'), message: errorMessage(e) }),
  })
  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value })
  return (
    <Card className="mt-6">
      <CardHeader title={t('energy.plan.title')} />
      <form
        className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
          <span className="text-label font-medium text-fg">{t('energy.plan.pricing')}</span>
          <Segmented
            size="sm"
            label={t('energy.plan.pricing')}
            value={slabbed ? 'slabs' : 'flat'}
            onChange={(v) => setSlabbed(v === 'slabs')}
            options={[
              { value: 'flat', label: t('energy.plan.flatRate') },
              { value: 'slabs', label: t('energy.plan.slabs') },
            ]}
          />
        </div>
        {slabbed ? (
          <fieldset className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
            <legend className="mb-1 text-label text-muted">{t('energy.plan.slabsLegend')}</legend>
            {slabs.map((x, i) => {
              const last = i === slabs.length - 1
              const from = i === 0 ? 0 : Number(slabs[i - 1].up_to_kwh || 0)
              return (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                  {last ? (
                    <Field label={i === 0 ? t('energy.plan.units') : t('energy.plan.aboveUnits', { from: formatNumber(from, 0) })} disabled value="" placeholder={t('energy.plan.andAbove')} />
                  ) : (
                    <Field label={t('energy.plan.fromUpTo', { from: formatNumber(from, 0) })} type="number" min="0" step="1" required value={x.up_to_kwh} onChange={(e) => setSlab(i, 'up_to_kwh', e.target.value)} />
                  )}
                  <Field label={t('energy.plan.pricePerUnit')} type="number" step="0.0001" min="0" required value={x.rate} onChange={(e) => setSlab(i, 'rate', e.target.value)} />
                  <Button variant="ghost" size="sm" aria-label={t('energy.plan.removeSlab')} disabled={slabs.length < 2} onClick={() => setSlabs(slabs.filter((_, j) => j !== i))}>
                    {t('drawer.removeConfirm')}
                  </Button>
                </div>
              )
            })}
            <div>
              <Button size="sm" onClick={() => setSlabs([...slabs.slice(0, -1), { up_to_kwh: '', rate: '' }, slabs[slabs.length - 1]])}>
                {t('energy.plan.addSlab')}
              </Button>
            </div>
          </fieldset>
        ) : (
          <Field label={t('energy.plan.pricePerKwh')} type="number" step="0.0001" min="0" required value={s.rate_per_kwh} onChange={set('rate_per_kwh')} />
        )}
        <fieldset className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <legend className="mb-1 text-label font-medium text-fg">{t('energy.plan.timeOfDay')}</legend>
          <p className="text-label text-muted">
            {t('energy.plan.timeOfDayHelp')}
          </p>
          {windows.map((w, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3">
              <Field label={t('energy.plan.from')} type="time" required value={w.start} onChange={(e) => setWindow(i, 'start', e.target.value)} />
              <Field label={t('energy.plan.until')} type="time" required value={w.end} onChange={(e) => setWindow(i, 'end', e.target.value)} />
              <Field label={t('energy.plan.perUnit')} type="number" step="0.0001" required value={w.adjust} onChange={(e) => setWindow(i, 'adjust', e.target.value)} />
              <Button variant="ghost" size="sm" aria-label={t('energy.plan.removeWindow')} onClick={() => setWindows(windows.filter((_, j) => j !== i))}>
                {t('drawer.removeConfirm')}
              </Button>
            </div>
          ))}
          <div>
            <Button size="sm" onClick={() => setWindows([...windows, { start: '22:00', end: '06:00', adjust: '' }])}>
              {t('energy.plan.addWindow')}
            </Button>
          </div>
        </fieldset>
        <SelectField label={t('energy.plan.currency')} required value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })}>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <Field label={t('energy.plan.fixedCharge')} type="number" step="0.01" min="0" value={s.fixed_monthly_charge} onChange={set('fixed_monthly_charge')} hint={t('energy.plan.fixedChargeHint')} />
        <Field label={t('insights.budget')} type="number" step="0.01" min="0" value={s.monthly_budget} onChange={set('monthly_budget')} hint={t('devices.optional')} />
        <Field label={t('energy.plan.cycleDay')} type="number" min="1" max="28" required value={s.billing_cycle_day} onChange={set('billing_cycle_day')} hint="1–28." />
        <div className="flex items-end">
          <Button type="submit" variant="primary" loading={save.isPending} className="w-full sm:w-auto">
            {t('energy.plan.save')}
          </Button>
        </div>
      </form>
    </Card>
  )
}

