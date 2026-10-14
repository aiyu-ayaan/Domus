import { t } from '@/lib/i18n'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Controls'
import { Checkbox } from '@/components/ui/Field'
import { Confirm } from '@/components/ui/Sheet'
import { api } from '@/lib/api'
import { useDevices } from '@/lib/queries'
import { canToggle } from '@/lib/devices'
import { errorMessage, useToast } from '@/lib/toast'
import type { MatterBridge } from '@/lib/types'

/** The pairing QR, drawn from the server's module grid. Always dark on light, as scanners expect. */
function Qr({ rows }: { rows: string[] }) {
  const size = rows.length + 8
  const path = rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === '1' ? [`M${x + 4} ${y + 4}h1v1h-1z`] : []))).join('')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40 shrink-0 rounded-md" shapeRendering="crispEdges" role="img" aria-label={t('matter.qr')}>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}

/** Share devices with Google Home, Apple Home, Alexa or Home Assistant through the Matter bridge. */
export function MatterCard() {
  const qc = useQueryClient()
  const toast = useToast()
  const [resetting, setResetting] = useState(false)
  const { data: bridge } = useQuery({ queryKey: ['matter'], queryFn: api.matter, refetchInterval: 5000 })
  const { data: devices = [] } = useDevices()
  const done = (b: MatterBridge) => qc.setQueryData(['matter'], b)
  const failed = (e: unknown) => toast.push({ tone: 'error', title: t('drawer.saveFailed'), message: errorMessage(e) })
  const save = useMutation({ mutationFn: api.saveMatter, onSuccess: done, onError: failed })
  const pairing = useMutation({ mutationFn: api.matterPairing, onSuccess: done, onError: failed })
  const reset = useMutation({
    mutationFn: api.matterReset,
    onSuccess: (b) => {
      done(b)
      setResetting(false)
    },
    onError: failed,
  })
  if (!bridge) return null
  const shareable = devices.filter(canToggle)
  const toggleDevice = (id: string) =>
    save.mutate({ enabled: bridge.enabled, devices: bridge.devices.includes(id) ? bridge.devices.filter((x) => x !== id) : [...bridge.devices, id] })
  return (
    <Card>
      <CardHeader
        title={t('matter.title')}
        action={<Switch checked={bridge.enabled} onChange={(on) => save.mutate({ enabled: on, devices: bridge.devices.length ? bridge.devices : shareable.map((d) => d.id) })} label={t('matter.enable')} />}
      />
      <div className="flex flex-col gap-4 p-4">
        <p className="text-label text-muted">{t('matter.explain')}</p>
        {bridge.enabled && (
          <>
            <div className="flex items-center gap-2">
              {bridge.error ? (
                <Badge tone="danger">{t('matter.error')}</Badge>
              ) : bridge.paired ? (
                <Badge tone="on">{t('matter.paired')}</Badge>
              ) : (
                <Badge>{t('matter.waiting')}</Badge>
              )}
              {bridge.error && <span className="text-caption text-danger">{bridge.error}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Qr rows={bridge.qr} />
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-label text-muted">{t('matter.code')}</p>
                <p dir="ltr" className="text-page font-semibold tabular tracking-wider">{bridge.pairing_code}</p>
                <p className="mt-2 text-caption text-subtle">{t('matter.uncertified')}</p>
              </div>
            </div>
            <fieldset>
              <legend className="mb-1 text-label font-medium">{t('matter.devices')}</legend>
              {shareable.length === 0 ? (
                <p className="text-label text-muted">{t('matter.noDevices')}</p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {shareable.map((d) => (
                    <Checkbox key={d.id} checked={bridge.devices.includes(d.id)} onChange={() => toggleDevice(d.id)}>
                      {d.name}
                    </Checkbox>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={pairing.isPending} onClick={() => pairing.mutate()}>
                {t('matter.allowPairing')}
              </Button>
              <Button size="sm" variant="danger" onClick={() => setResetting(true)}>
                {t('matter.reset')}
              </Button>
            </div>
          </>
        )}
      </div>
      <Confirm
        open={resetting}
        onClose={() => setResetting(false)}
        onConfirm={() => reset.mutate()}
        loading={reset.isPending}
        title={t('matter.resetTitle')}
        message={t('matter.resetMessage')}
        confirmLabel={t('matter.reset')}
      />
    </Card>
  )
}
