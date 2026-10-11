import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import QRCode from 'react-qr-code'
import { CheckCircle, Trash, WarningCircle } from '@phosphor-icons/react'
import { Badge, Card, ErrorText, PageHeader, Skeleton } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Sheet, Confirm } from '@/components/ui/Sheet'
import { Field, SelectField } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { keys, useIntegrations } from '@/lib/queries'
import { errorMessage, useToast } from '@/lib/toast'
import { timeAgo } from '@/lib/format'
import type { Account, Integration } from '@/lib/types'

export function IntegrationsView() {
  const { data, isLoading } = useIntegrations()
  const [linking, setLinking] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Account | null>(null)
  const qc = useQueryClient()
  const toast = useToast()
  const remove = useMutation({
    mutationFn: (id: string) => api.removeAccount(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: keys.integrations })
      qc.invalidateQueries({ queryKey: keys.devices })
      toast.push({ tone: 'success', title: t('integrations.unlinked'), message: r.removed_devices ? t('integrations.removedDevices', { count: r.removed_devices }) : undefined })
      setRemoving(null)
    },
    onError: (e) => toast.push({ tone: 'error', title: t('integrations.unlinkFailed'), message: errorMessage(e) }),
  })
  return (
    <>
      <PageHeader title={t('nav.integrations')} description={t('integrations.description')} />
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="flex flex-col gap-4">
          {data?.map((p) => (
            <IntegrationCard key={p.id} plugin={p} onLink={() => setLinking(p.id)} onRemove={setRemoving} />
          ))}
        </div>
      )}
      <TuyaSheet open={linking === 'tuya'} onClose={() => setLinking(null)} />
      <CredentialsSheet kind={linking === 'tapo' || linking === 'xiaomi' ? linking : null} onClose={() => setLinking(null)} />
      <FormSheet plugin={data?.find((p) => p.id === linking && p.link === 'form') ?? null} onClose={() => setLinking(null)} />
      <Confirm
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        title={t('integrations.unlinkTitle', { name: removing?.name ?? '' })}
        message={t('integrations.unlinkMessage')}
        confirmLabel={t('integrations.unlinkConfirm')}
      />
    </>
  )
}

function IntegrationCard({ plugin: p, onLink, onRemove }: { plugin: Integration; onLink: () => void; onRemove: (a: Account) => void }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4 p-4">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-title font-semibold">{p.name}</h2>
            <Badge>{p.local ? t('integrations.localControl') : t('integrations.cloud')}</Badge>
            {!p.enabled && <Badge tone="warn">{t('integrations.disabledInConfig')}</Badge>}
          </div>
          <p className="mt-1 max-w-2xl text-body text-muted">{p.description}</p>
          <p className="mt-2 text-label text-subtle">
            {t('common.deviceCount', { count: p.device_count })}
          </p>
        </div>
        {p.enabled && (
          <Button variant={p.accounts.length ? 'secondary' : 'primary'} onClick={onLink}>
            {p.link === 'form' ? (p.accounts.length ? t('integrations.linkAnother') : t('integrations.link')) : p.accounts.length ? t('integrations.linkAnotherAccount') : p.link === 'qr' ? t('integrations.linkQr') : t('integrations.linkAccount')}
          </Button>
        )}
      </div>
      {p.accounts.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {p.accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              {a.status === 'ok' ? <CheckCircle size={16} className="shrink-0 text-on" aria-label={t('integrations.connected')} /> : <WarningCircle size={16} className="shrink-0 text-warn" aria-label={t('integrations.needsAttention')} />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-body">{a.name}</p>
                <p className="truncate text-label text-muted" title={a.last_error ?? undefined}>
                  {a.status === 'ok' ? t('integrations.linkedWhen', { when: timeAgo(a.created_at) }) : a.last_error}
                </p>
              </div>
              <Button variant="ghost" size="sm" aria-label={t('integrations.unlinkName', { name: a.name })} icon={<Trash size={16} />} onClick={() => onRemove(a)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3 text-body">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-caption text-muted tabular">{i + 1}</span>
          <span className="text-muted">{s}</span>
        </li>
      ))}
    </ol>
  )
}

function TuyaSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [step, setStep] = useState<'code' | 'qr' | 'done'>('code')
  const [code, setCode] = useState('')
  const [qr, setQr] = useState<{ token: string; content: string; expires: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [linkedName, setLinkedName] = useState('')
  const [now, setNow] = useState(Date.now())
  const reset = () => {
    setStep('code')
    setQr(null)
    setError(null)
  }
  const close = () => {
    reset()
    onClose()
  }
  const start = useMutation({
    mutationFn: () => api.tuyaQr(code.trim()),
    onSuccess: (r) => {
      setQr({ token: r.qr_token, content: r.qr_content, expires: Date.now() + r.expires_in * 1000 })
      setStep('qr')
      setError(null)
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const status = useQuery({ queryKey: ['tuya-qr', qr?.token], queryFn: () => api.tuyaQrStatus(qr!.token), enabled: step === 'qr' && !!qr, refetchInterval: 2000 })
  useEffect(() => {
    if (status.data?.status === 'linked') {
      setLinkedName(status.data.name ?? '')
      setStep('done')
      qc.invalidateQueries({ queryKey: keys.integrations })
    } else if (status.data?.status === 'expired') {
      setError(t('integrations.tuya.qrExpired'))
      setStep('code')
    }
  }, [status.data, qc])
  useEffect(() => {
    if (step !== 'qr') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [step])
  const left = qr ? Math.max(0, Math.round((qr.expires - now) / 1000)) : 0

  return (
    <Sheet open={open} onClose={close} title={t('integrations.tuya.title')} description={t('integrations.tuya.description')}>
      {step === 'code' && (
        <form className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), code.trim() && start.mutate())}>
          <Steps
            items={[
              t('integrations.tuya.step1'),
              t('integrations.tuya.step2'),
              t('integrations.tuya.step3'),
            ]}
          />
          <Field label={t('integrations.tuya.userCode')} required spellCheck={false} autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} data-autofocus />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" loading={start.isPending} disabled={!code.trim()}>
            {t('integrations.tuya.generateQr')}
          </Button>
        </form>
      )}
      {step === 'qr' && qr && (
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="rounded-lg bg-white p-4">
            <QRCode value={qr.content} size={200} aria-label={t('integrations.tuya.qrLabel')} />
          </div>
          <Steps items={[t('integrations.tuya.qrStep1'), t('integrations.tuya.qrStep2')]} />
          <p className="text-label text-muted tabular" aria-live="polite">
            {t('integrations.tuya.waiting', { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` })}
          </p>
          <Button variant="ghost" size="sm" onClick={reset}>
            {t('integrations.tuya.differentCode')}
          </Button>
        </div>
      )}
      {step === 'done' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle size={40} className="text-on" aria-hidden />
          <p className="text-title font-semibold">{linkedName ? t('integrations.tuya.linkedNamed', { name: linkedName }) : t('integrations.tuya.linked')}</p>
          <p className="text-body text-muted">{t('integrations.tuya.discovering')}</p>
          <Button
            variant="primary"
            className="mt-2"
            onClick={() => {
              close()
              navigate('/devices?tab=discovered')
            }}
          >
            {t('integrations.viewDiscovered')}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

/** Link sheet for integrations whose inputs the server lists (`link: 'form'`). */
function FormSheet({ plugin, onClose }: { plugin: Integration | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const fields = plugin?.fields ?? []
  const value = (key: string) => values[key] ?? fields.find((f) => f.key === key)?.default ?? ''
  const ready = fields.every((f) => !f.required || value(f.key).trim())
  const close = () => (setValues({}), setError(null), onClose())
  const link = useMutation({
    mutationFn: () => api.linkForm(plugin!.id, Object.fromEntries(fields.map((f) => [f.key, value(f.key)]))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.integrations })
      toast.push({ tone: 'success', title: t('integrations.formLinked', { name: plugin?.name ?? '' }), message: t('integrations.scanningDevices') })
      close()
      navigate('/devices?tab=discovered')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <Sheet
      open={!!plugin}
      onClose={close}
      title={t('integrations.linkTitle', { name: plugin?.name ?? '' })}
      description={plugin?.description}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={link.isPending} disabled={!ready} onClick={() => link.mutate()}>
            {t('integrations.link')}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), ready && link.mutate())}>
        {fields.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            hint={f.hint || undefined}
            required={f.required}
            type={f.kind === 'password' ? 'password' : 'text'}
            inputMode={f.kind === 'number' ? 'numeric' : undefined}
            autoComplete="off"
            spellCheck={false}
            value={value(f.key)}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        ))}
        <ErrorText>{error}</ErrorText>
      </form>
    </Sheet>
  )
}

const REGIONS = [
  { value: 'i2', label: 'integrations.region.i2' },
  { value: 'de', label: 'integrations.region.de' },
  { value: 'us', label: 'integrations.region.us' },
  { value: 'sg', label: 'integrations.region.sg' },
  { value: 'cn', label: 'integrations.region.cn' },
  { value: 'ru', label: 'integrations.region.ru' },
  { value: 'tw', label: 'integrations.region.tw' },
]

function CredentialsSheet({ kind, onClose }: { kind: 'tapo' | 'xiaomi' | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [region, setRegion] = useState('i2')
  const [error, setError] = useState<string | null>(null)
  // Set when Xiaomi asks for a two-step verification code.
  const [verify, setVerify] = useState<{ id: string; via: string } | null>(null)
  const [code, setCode] = useState('')
  const tapo = kind === 'tapo'
  const close = () => (setVerify(null), setCode(''), onClose())
  const link = useMutation({
    mutationFn: async () => {
      if (tapo) return void (await api.linkTapo({ username, password }))
      if (verify) return void (await api.verifyXiaomi({ verify_id: verify.id, code }))
      const r = await api.linkXiaomi({ username, password, region })
      if (r.verify_id) return { id: r.verify_id, via: r.via ?? 'email' }
    },
    onSuccess: (pending) => {
      if (pending) {
        setVerify(pending)
        setError(null)
        return
      }
      qc.invalidateQueries({ queryKey: keys.integrations })
      toast.push({ tone: 'success', title: t('integrations.accountLinked'), message: t('integrations.scanningDevices') })
      setPassword('')
      setError(null)
      close()
      navigate('/devices?tab=discovered')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <Sheet
      open={!!kind}
      onClose={close}
      title={tapo ? t('integrations.tapo.title') : t('integrations.xiaomi.title')}
      description={tapo ? t('integrations.tapo.description') : t('integrations.xiaomi.description')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={link.isPending} disabled={!username || !password || (!!verify && !code)} onClick={() => link.mutate()}>
            {verify ? t('integrations.xiaomi.verify') : t('integrations.linkAccount')}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), username && password && (!verify || code) && link.mutate())}>
        <Field label={tapo ? t('integrations.tapo.idLabel') : t('integrations.xiaomi.accountLabel')} hint={tapo ? undefined : t('integrations.xiaomi.accountHint')} required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Field label={t('auth.password')} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {!tapo && (
          <SelectField label={t('integrations.xiaomi.regionLabel')} value={region} onChange={(e) => setRegion(e.target.value)} hint={t('integrations.xiaomi.regionHint')}>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {t(r.label)}
              </option>
            ))}
          </SelectField>
        )}
        {verify && (
          <Field
            label={t('integrations.xiaomi.codeLabel')}
            hint={verify.via === 'phone' ? t('integrations.xiaomi.sentPhone') : t('integrations.xiaomi.sentEmail')}
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        )}
        <ErrorText>{error}</ErrorText>
      </form>
    </Sheet>
  )
}

