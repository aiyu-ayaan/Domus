import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import QRCode from 'react-qr-code'
import { CheckCircle, CloudCheck, HouseLine, Link as LinkIcon, QrCode, Trash, WarningCircle } from '@phosphor-icons/react'
import { Badge, Card, PageHeader, Skeleton } from '@/components/Layout'
import { Button } from '@/components/Button'
import { Sheet, Confirm } from '@/components/Sheet'
import { Field, SelectField } from '@/components/Field'
import { api } from '@/lib/api'
import { useIsAdmin } from '@/lib/auth'
import { keys, useIntegrations } from '@/lib/queries'
import { errorMessage, useToast } from '@/lib/toast'
import { timeAgo } from '@/lib/format'
import { spring, stagger } from '@/lib/motion'
import type { Account, Integration } from '@/lib/types'

const brand: Record<string, string> = {
  tuya: 'from-orange-400 to-rose-500',
  tapo: 'from-teal-300 to-cyan-500',
  xiaomi: 'from-orange-500 to-amber-400',
  virtual: 'from-violet-400 to-indigo-500',
}

export function PluginsView() {
  const admin = useIsAdmin()
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
      toast.push({ tone: 'success', title: 'Account removed', message: r.removed_devices ? `${r.removed_devices} device(s) were removed too.` : undefined })
      setRemoving(null)
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not remove', message: errorMessage(e) }),
  })

  return (
    <div>
      <PageHeader title="Plugins" subtitle="Connect your smart-home brands. Credentials are encrypted on your server." />
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2">
          {data?.map((p) => (
            <PluginCard key={p.id} plugin={p} admin={admin} onLink={() => setLinking(p.id)} onRemove={setRemoving} />
          ))}
        </motion.div>
      )}
      <TuyaLinkSheet open={linking === 'tuya'} onClose={() => setLinking(null)} />
      <CredentialsSheet kind={linking === 'tapo' || linking === 'xiaomi' ? linking : null} onClose={() => setLinking(null)} />
      <Confirm
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        title={`Unlink ${removing?.name}?`}
        message="Devices added through this account are removed as well."
        confirmLabel="Unlink"
      />
    </div>
  )
}

function PluginCard({ plugin: p, admin, onLink, onRemove }: { plugin: Integration; admin: boolean; onLink: () => void; onRemove: (a: Account) => void }) {
  const linked = p.accounts.length > 0
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br text-xl font-extrabold text-white shadow-lg ${brand[p.id] ?? 'from-slate-400 to-slate-600'}`} aria-hidden>
          {p.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{p.name}</h2>
            {p.local ? (
              <Badge tone="accent">
                <HouseLine size={12} weight="bold" aria-hidden /> Local control
              </Badge>
            ) : (
              <Badge tone="info">
                <CloudCheck size={12} weight="bold" aria-hidden /> Cloud
              </Badge>
            )}
            {!p.enabled && <Badge tone="warn">Disabled</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">{p.description}</p>
        </div>
      </div>

      {p.accounts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {p.accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-3xl bg-line/[0.05] p-3">
              {a.status === 'ok' ? (
                <CheckCircle size={22} weight="fill" className="shrink-0 text-power" aria-label="Connected" />
              ) : (
                <WarningCircle size={22} weight="fill" className="shrink-0 text-warn" aria-label="Problem" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{a.name}</p>
                <p className="truncate text-xs text-muted" title={a.last_error ?? undefined}>
                  {a.status === 'ok' ? `Linked ${timeAgo(a.created_at)}` : a.last_error}
                </p>
              </div>
              {admin && <Button variant="ghost" size="sm" aria-label={`Unlink ${a.name}`} icon={<Trash size={18} />} onClick={() => onRemove(a)} />}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="text-sm text-muted">
          {p.device_count} {p.device_count === 1 ? 'device' : 'devices'}
        </span>
        {admin && p.enabled && p.link !== 'none' && (
          <Button variant={linked ? 'glass' : 'primary'} size="sm" icon={p.link === 'qr' ? <QrCode size={18} /> : <LinkIcon size={18} />} onClick={onLink}>
            {linked ? 'Link another' : p.link === 'qr' ? 'Scan QR to link' : 'Link account'}
          </Button>
        )}
      </div>
    </Card>
  )
}

type TuyaStep = 'code' | 'qr' | 'done'

function TuyaLinkSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [step, setStep] = useState<TuyaStep>('code')
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

  // Poll the login result while the QR is shown.
  const status = useQuery({
    queryKey: ['tuya-qr', qr?.token],
    queryFn: () => api.tuyaQrStatus(qr!.token),
    enabled: step === 'qr' && !!qr,
    refetchInterval: 2000,
  })
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
  const remaining = qr ? Math.max(0, Math.round((qr.expires - now) / 1000)) : 0

  return (
    <Sheet open={open} onClose={close} title="Link Tuya / Smart Life" description="Uses the same QR login as Home Assistant — no developer account needed.">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0, transition: spring.default }} exit={{ opacity: 0, x: -24, transition: { duration: 0.12 } }}>
          {step === 'code' && (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (code.trim()) start.mutate()
              }}
            >
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted marker:font-bold marker:text-fg">
                <li>Open the <b className="text-fg">Smart Life</b> or <b className="text-fg">Tuya Smart</b> app.</li>
                <li>Go to <b className="text-fg">Me → Settings (gear) → Account and Security → User Code</b>.</li>
                <li>Copy the code and paste it below.</li>
              </ol>
              <Field label="User code" required value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} data-autofocus />
              {error && (
                <p role="alert" className="rounded-2xl bg-danger/10 p-3 text-sm text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" loading={start.isPending} disabled={!code.trim()} icon={<QrCode size={18} />}>
                Show QR code
              </Button>
            </form>
          )}
          {step === 'qr' && qr && (
            <div className="flex flex-col items-center gap-5 text-center">
              <div className="rounded-4xl bg-white p-5 shadow-xl">
                <QRCode value={qr.content} size={220} aria-label="Tuya login QR code" />
              </div>
              <div>
                <p className="font-semibold">Scan with the Smart Life app</p>
                <p className="mt-1 text-sm text-muted">
                  Tap <b className="text-fg">+</b> or the scan icon on the Home tab, scan this code and confirm the login.
                </p>
              </div>
              <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" aria-hidden />
                Waiting for confirmation · {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
              </p>
              <Button variant="ghost" size="sm" onClick={reset}>
                Use a different code
              </Button>
            </div>
          )}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={spring.bouncy} className="flex h-20 w-20 items-center justify-center rounded-full bg-power/15 text-power">
                <CheckCircle size={48} weight="fill" />
              </motion.span>
              <div>
                <p className="text-xl font-bold">Linked{linkedName ? ` ${linkedName}` : ''}</p>
                <p className="mt-1 text-muted">Your Smart Life devices are being discovered now.</p>
              </div>
              <Button
                variant="primary"
                onClick={() => {
                  close()
                  navigate('/devices?tab=discovered')
                }}
              >
                See discovered devices
              </Button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  )
}

const REGIONS = [
  { value: 'de', label: 'Europe' },
  { value: 'i2', label: 'India' },
  { value: 'us', label: 'United States' },
  { value: 'sg', label: 'Singapore' },
  { value: 'cn', label: 'China mainland' },
  { value: 'ru', label: 'Russia' },
  { value: 'tw', label: 'Taiwan' },
  { value: 'in', label: 'India (legacy)' },
]

function CredentialsSheet({ kind, onClose }: { kind: 'tapo' | 'xiaomi' | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [region, setRegion] = useState('de')
  const [error, setError] = useState<string | null>(null)
  const link = useMutation({
    mutationFn: () => (kind === 'tapo' ? api.linkTapo({ username, password }) : api.linkXiaomi({ username, password, region })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.integrations })
      toast.push({ tone: 'success', title: 'Account linked', message: 'Scanning for devices…' })
      setPassword('')
      setError(null)
      onClose()
      navigate('/devices?tab=discovered')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const tapo = kind === 'tapo'
  return (
    <Sheet
      open={!!kind}
      onClose={onClose}
      title={tapo ? 'Link TP-Link Tapo' : 'Link Xiaomi Mi Home'}
      description={
        tapo
          ? 'Your TP-Link ID is only used to unlock devices on your local network — nothing is sent to the cloud.'
          : 'Signs in once to fetch device tokens. Control then happens locally over your network.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={link.isPending} disabled={!username || !password} onClick={() => link.mutate()}>
            Link account
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), username && password && link.mutate())}>
        <Field label={tapo ? 'TP-Link ID (email)' : 'Xiaomi account (email, phone or ID)'} required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Field label="Password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {!tapo && (
          <SelectField label="Server region" value={region} onChange={(e) => setRegion(e.target.value)} hint="The region chosen in the Mi Home app.">
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </SelectField>
        )}
        {error && (
          <p role="alert" className="rounded-2xl bg-danger/10 p-3 text-sm text-danger [overflow-wrap:anywhere]">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  )
}
