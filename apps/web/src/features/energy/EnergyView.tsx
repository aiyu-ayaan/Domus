import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, Metric, PageHeader, Skeleton } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/Controls'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { EnergyChart } from '@/components/devices/EnergyChart'
import { api } from '@/lib/api'
import { useIsAdmin } from '@/lib/auth'
import { keys, useEnergy } from '@/lib/queries'
import { formatKwh, formatMoney, formatNumber, formatWatts } from '@/lib/format'
import { errorMessage, useToast } from '@/lib/toast'
import type { ElectricitySettings } from '@/lib/types'

type Range = 'day' | 'week' | 'month'

export function EnergyView() {
  const admin = useIsAdmin()
  const { data: o, isLoading } = useEnergy()
  const [range, setRange] = useState<Range>('day')
  const history = useQuery({ queryKey: keys.energyHistory(range), queryFn: () => api.energyHistory(range), refetchInterval: 60_000 })

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
        <Metric label="Power now" live value={formatWatts(o.current_watts)} />
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
            <Segmented size="sm" label="Range" value={range} onChange={setRange} options={[{ value: 'day', label: '24 hours' }, { value: 'week', label: '7 days' }, { value: 'month', label: '30 days' }]} />
          }
        />
        <div className="p-4">{history.isLoading ? <Skeleton className="h-[220px]" /> : <EnergyChart points={history.data ?? []} range={range} currency={currency} height={220} />}</div>
      </Card>

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
                  <td className="px-4 text-right text-muted">{formatWatts(d.current_watts)}</td>
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
  const save = useMutation({
    mutationFn: () =>
      api.saveEnergySettings({
        rate_per_kwh: Number(s.rate_per_kwh),
        currency: s.currency,
        monthly_budget: s.monthly_budget ? Number(s.monthly_budget) : null,
        billing_cycle_day: Number(s.billing_cycle_day),
        fixed_monthly_charge: Number(s.fixed_monthly_charge || 0),
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
        <Field label="Price per kWh" type="number" step="0.0001" min="0" required value={s.rate_per_kwh} onChange={set('rate_per_kwh')} />
        <Field label="Currency" required maxLength={3} value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value.toUpperCase() })} hint="ISO code, e.g. INR, USD, EUR." />
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
