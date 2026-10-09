import { useState } from 'react'
import { motion } from 'motion/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Receipt } from '@phosphor-icons/react'
import { Card, PageHeader, SectionTitle, Skeleton } from '@/components/Layout'
import { Segmented } from '@/components/Controls'
import { EnergyChart } from '@/components/EnergyChart'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { api } from '@/lib/api'
import { useIsAdmin } from '@/lib/auth'
import { keys, useEnergy } from '@/lib/queries'
import { formatKwh, formatMoney, formatNumber, formatWatts } from '@/lib/format'
import { errorMessage, useToast } from '@/lib/toast'
import { spring, stagger } from '@/lib/motion'
import type { ElectricitySettings } from '@/lib/types'

type Range = 'day' | 'week' | 'month'

function Stat({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tabular sm:text-3xl">{children}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </Card>
  )
}

export function EnergyView() {
  const admin = useIsAdmin()
  const { data: o, isLoading } = useEnergy()
  const [range, setRange] = useState<Range>('day')
  const history = useQuery({ queryKey: keys.energyHistory(range), queryFn: () => api.energyHistory(range), refetchInterval: 60_000 })
  const currency = o?.settings.currency ?? 'USD'
  const maxKwh = Math.max(...(o?.devices.map((d) => d.kwh) ?? [0]), 0.0001)

  if (isLoading || !o) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    )
  }
  const cycleEnd = new Date(o.cycle_start)
  cycleEnd.setDate(cycleEnd.getDate() + o.cycle_days)

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <PageHeader
        title="Energy"
        subtitle={`Billing cycle ${new Date(o.cycle_start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${cycleEnd.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · day ${o.cycle_day} of ${o.cycle_days}`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Using now">
          <AnimatedNumber value={o.current_watts} format={formatWatts} />
        </Stat>
        <Stat label="Today" hint={formatMoney(o.today_cost, currency)}>
          {formatKwh(o.today_kwh)}
        </Stat>
        <Stat label="Bill so far" hint={formatKwh(o.cycle_kwh)}>
          {formatMoney(o.cycle_cost, currency)}
        </Stat>
        <Stat label="Projected bill" hint={o.budget_used_percent != null ? `${formatNumber(o.budget_used_percent, 0)}% of budget used` : `≈ ${formatKwh(o.projected_kwh)}`}>
          {formatMoney(o.projected_cost, currency)}
        </Stat>
      </div>

      <Card className="mt-4">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Consumption</h2>
          <Segmented
            label="Range"
            size="sm"
            value={range}
            onChange={setRange}
            options={[
              { value: 'day', label: '24 h' },
              { value: 'week', label: '7 days' },
              { value: 'month', label: '30 days' },
            ]}
          />
        </div>
        {history.isLoading ? <Skeleton className="h-[220px]" /> : <EnergyChart points={history.data ?? []} range={range} currency={currency} height={220} />}
      </Card>

      <SectionTitle>By device this cycle</SectionTitle>
      {o.devices.length === 0 ? (
        <p className="surface rounded-4xl p-6 text-muted">Devices with power metering (like Tapo P110 or Tuya energy plugs) show their usage here.</p>
      ) : (
        <Card>
          <ul className="flex flex-col gap-4">
            {o.devices.map((d) => (
              <li key={d.device_id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="truncate font-semibold">{d.name}</span>
                  <span className="shrink-0 text-sm text-muted tabular">
                    {formatWatts(d.current_watts)} now · {formatKwh(d.kwh)} · <span className="font-semibold text-fg">{formatMoney(d.cost, currency)}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line/10">
                  <motion.div className="h-full rounded-full bg-power" initial={{ width: 0 }} animate={{ width: `${(d.kwh / maxKwh) * 100}%` }} transition={spring.gentle} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {admin && <BillSettings initial={o.settings} />}
    </motion.div>
  )
}

function BillSettings({ initial }: { initial: ElectricitySettings }) {
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
    <>
      <SectionTitle>Electricity plan</SectionTitle>
      <Card>
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <Field label="Price per kWh" type="number" step="0.0001" min="0" required value={s.rate_per_kwh} onChange={set('rate_per_kwh')} />
          <Field label="Currency" required maxLength={3} value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value.toUpperCase() })} hint="ISO code, e.g. INR, USD, EUR" />
          <Field label="Fixed monthly charge" type="number" step="0.01" min="0" value={s.fixed_monthly_charge} onChange={set('fixed_monthly_charge')} hint="Meter rent, fixed fees" />
          <Field label="Monthly budget" type="number" step="0.01" min="0" value={s.monthly_budget} onChange={set('monthly_budget')} hint="Optional — get a progress bar" />
          <Field label="Bill starts on day" type="number" min="1" max="28" required value={s.billing_cycle_day} onChange={set('billing_cycle_day')} hint="1–28" />
          <div className="flex items-end">
            <Button type="submit" variant="primary" icon={<Receipt size={18} />} loading={save.isPending} className="w-full">
              Save plan
            </Button>
          </div>
        </form>
      </Card>
    </>
  )
}
