import { t } from '@/lib/i18n'
import { useQuery } from '@tanstack/react-query'
import { Sheet } from '@/components/ui/Sheet'
import { Badge } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { formatClockTime, formatMoment } from '@/lib/format'
import type { Automation, AutomationRun, Device } from '@/lib/types'
import { describeTrigger } from './RuleEditor'

const TONE = { done: 'on', failed: 'danger', blocked: 'neutral', running: 'info' } as const

function trigger(run: AutomationRun, a: Automation, devices: Device[]) {
  if ('manual' in run.trigger) {
    const actor = run.trigger.manual
    return t('runs.manual', { name: actor.kind === 'user' ? actor.name : '' })
  }
  const trig = a.triggers[run.trigger.index]
  return trig ? describeTrigger(trig, devices) : t('runs.triggerRemoved')
}

/** Why a run did not go ahead: the conditions that were not met. */
function heldBack(run: AutomationRun, a: Automation, devices: Device[]) {
  return run.conditions
    .filter((c) => !c.passed)
    .map(({ index }) => {
      const c = a.conditions[index]
      if (!c) return t('runs.cond.removed')
      if (c.type === 'time_between') return t('runs.cond.between', { start: formatClockTime(c.start), end: formatClockTime(c.end) })
      return t('runs.cond.state', { device: devices.find((d) => d.id === c.device_id)?.name ?? t('rule.deviceFallback') })
    })
}

/** An automation's recent runs, newest first, with what held each one back. */
export function RunsSheet({ automation, devices, onClose }: { automation: Automation | null; devices: Device[]; onClose: () => void }) {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['automation-runs', automation?.id],
    queryFn: () => api.automationRuns(automation!.id),
    enabled: !!automation,
    refetchInterval: 15_000,
  })
  return (
    <Sheet open={!!automation} onClose={onClose} title={automation ? t('runs.title', { name: automation.name }) : ''} description={t('runs.hint')}>
      {automation && !isLoading && !runs.length && <p className="text-body text-muted">{t('runs.empty')}</p>}
      {automation && runs.length > 0 && (
        <ol className="rounded-lg border border-border px-4">
          {runs.map((run, i) => {
            const reasons = run.outcome === 'blocked' ? heldBack(run, automation, devices) : run.errors
            return (
              <li key={`${run.started_at}-${i}`} className="border-b border-border py-3 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <Badge tone={TONE[run.outcome]}>{t(`runs.outcome.${run.outcome}`)}</Badge>
                  <time dateTime={run.started_at} className="text-caption text-subtle tabular">
                    {formatMoment(run.started_at)}
                  </time>
                </div>
                <p className="mt-1.5 text-body">{trigger(run, automation, devices)}</p>
                {reasons.map((r, j) => (
                  <p key={j} className={run.outcome === 'failed' ? 'text-caption text-danger' : 'text-caption text-muted'}>
                    {run.outcome === 'blocked' ? t('runs.heldBack', { condition: r }) : r}
                  </p>
                ))}
              </li>
            )
          })}
        </ol>
      )}
    </Sheet>
  )
}
