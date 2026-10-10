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
      toast.push({ tone: 'success', title: 'Account unlinked', message: r.removed_devices ? `${r.removed_devices} device(s) removed.` : undefined })
      setRemoving(null)
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not unlink', message: errorMessage(e) }),
  })
  return (
    <>
      <PageHeader title="Integrations" description="Connect device brands. Credentials are encrypted on this server." />
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
        title={`Unlink ${removing?.name}?`}
        message="Devices added through this account are removed too."
        confirmLabel="Unlink"
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
            <Badge>{p.local ? 'Local control' : 'Cloud'}</Badge>
            {!p.enabled && <Badge tone="warn">Disabled in config</Badge>}
          </div>
          <p className="mt-1 max-w-2xl text-body text-muted">{p.description}</p>
          <p className="mt-2 text-label text-subtle">
            {p.device_count} {p.device_count === 1 ? 'device' : 'devices'}
          </p>
        </div>
        {p.enabled && (
          <Button variant={p.accounts.length ? 'secondary' : 'primary'} onClick={onLink}>
            {p.link === 'form' ? (p.accounts.length ? 'Link another' : 'Link') : p.accounts.length ? 'Link another account' : p.link === 'qr' ? 'Link with QR code' : 'Link account'}
          </Button>
        )}
      </div>
      {p.accounts.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {p.accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              {a.status === 'ok' ? <CheckCircle size={16} className="shrink-0 text-on" aria-label="Connected" /> : <WarningCircle size={16} className="shrink-0 text-warn" aria-label="Needs attention" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-body">{a.name}</p>
                <p className="truncate text-label text-muted" title={a.last_error ?? undefined}>
                  {a.status === 'ok' ? `Linked ${timeAgo(a.created_at)}` : a.last_error}
                </p>
              </div>
              <Button variant="ghost" size="sm" aria-label={`Unlink ${a.name}`} icon={<Trash size={16} />} onClick={() => onRemove(a)} />
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
      setError('The QR code expired. Generate a new one.')
      setStep('code')
    }
  }, [status.data, qc])
  useEffect(() => {
    if (step !== 'qr') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [step])
  const left = qr ? Math.max(0, Math.round((qr.expires - now) / 1000)) : 0

  return (
    <Sheet open={open} onClose={close} title="Link Tuya / Smart Life" description="Same QR login Home Assistant uses. No Tuya developer account needed.">
      {step === 'code' && (
        <form className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), code.trim() && start.mutate())}>
          <Steps
            items={[
              <>Open the <span className="text-fg">Smart Life</span> or <span className="text-fg">Tuya Smart</span> app.</>,
              <>Go to <span className="text-fg">Me → Settings → Account and Security → User Code</span>.</>,
              'Copy the code and paste it below.',
            ]}
          />
          <Field label="User code" required spellCheck={false} autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} data-autofocus />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" loading={start.isPending} disabled={!code.trim()}>
            Generate QR code
          </Button>
        </form>
      )}
      {step === 'qr' && qr && (
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="rounded-lg bg-white p-4">
            <QRCode value={qr.content} size={200} aria-label="Tuya login QR code" />
          </div>
          <Steps items={['In Smart Life, tap the scan icon on the Home tab.', 'Scan this code and confirm the login.']} />
          <p className="text-label text-muted tabular" aria-live="polite">
            Waiting for confirmation · {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </p>
          <Button variant="ghost" size="sm" onClick={reset}>
            Use a different code
          </Button>
        </div>
      )}
      {step === 'done' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle size={40} className="text-on" aria-hidden />
          <p className="text-title font-semibold">Linked{linkedName ? ` ${linkedName}` : ''}</p>
          <p className="text-body text-muted">Your Smart Life devices are being discovered.</p>
          <Button
            variant="primary"
            className="mt-2"
            onClick={() => {
              close()
              navigate('/devices?tab=discovered')
            }}
          >
            View discovered devices
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
      toast.push({ tone: 'success', title: `${plugin?.name} linked`, message: 'Scanning for devices.' })
      close()
      navigate('/devices?tab=discovered')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <Sheet
      open={!!plugin}
      onClose={close}
      title={`Link ${plugin?.name ?? ''}`}
      description={plugin?.description}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={link.isPending} disabled={!ready} onClick={() => link.mutate()}>
            Link
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
  { value: 'i2', label: 'India' },
  { value: 'de', label: 'Europe' },
  { value: 'us', label: 'United States' },
  { value: 'sg', label: 'Singapore' },
  { value: 'cn', label: 'China mainland' },
  { value: 'ru', label: 'Russia' },
  { value: 'tw', label: 'Taiwan' },
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
      toast.push({ tone: 'success', title: 'Account linked', message: 'Scanning for devices.' })
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
      title={tapo ? 'Link TP-Link Tapo' : 'Link Xiaomi Mi Home'}
      description={tapo ? 'Your TP-Link ID only unlocks devices on your local network. Nothing is sent to the cloud.' : 'Signs in once to fetch device tokens. Control then stays on your network.'}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={link.isPending} disabled={!username || !password || (!!verify && !code)} onClick={() => link.mutate()}>
            {verify ? 'Verify' : 'Link account'}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), username && password && (!verify || code) && link.mutate())}>
        <Field label={tapo ? 'TP-Link ID (email)' : 'Xiaomi account'} hint={tapo ? undefined : 'Email, phone number with country code (e.g. +91…) or Xiaomi ID.'} required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Field label="Password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {!tapo && (
          <SelectField label="Server region" value={region} onChange={(e) => setRegion(e.target.value)} hint="The region selected in the Mi Home app.">
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </SelectField>
        )}
        {verify && (
          <Field
            label="Verification code"
            hint={`Xiaomi sent a code to your ${verify.via === 'phone' ? 'phone by SMS' : 'email'}.`}
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
