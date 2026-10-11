import { t } from '@/lib/i18n'
import { useState, type FormEvent, type ReactNode } from 'react'
import { DiceFive, LockSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { ErrorText, Notice } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { rollRandomAvatar } from '@/lib/avatar'
import { api, desktop } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/toast'

/** The centred column every signed-out screen shares. */
function Shell({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="anim-enter w-full max-w-[380px]">
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
        <h1 className="mt-6 text-page font-semibold tracking-[-0.01em]">{title}</h1>
        <p className="mt-1 text-body text-muted">{description}</p>
        {children}
      </div>
    </div>
  )
}

const formCls = 'mt-6 flex flex-col gap-4 rounded-lg border border-border bg-panel p-5'

/** A new password typed twice. `valid` is false until both match and are long enough. */
function useNewPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = confirm.length > 0 && confirm !== password
  const fields = (
    <>
      <Field label={t('auth.newPassword')} type="password" autoComplete="new-password" required minLength={8} hint={t('auth.atLeast8')} value={password} onChange={(e) => setPassword(e.target.value)} />
      <Field label={t('auth.confirmPassword')} type="password" autoComplete="new-password" required value={confirm} error={mismatch ? t('auth.mismatch') : undefined} onChange={(e) => setConfirm(e.target.value)} />
    </>
  )
  return { password, fields, valid: password.length >= 8 && confirm === password }
}

/** Shown instead of the app while the account is still on the password an administrator handed over. */
export function ChangePasswordScreen() {
  const { user, updateUser, signOut } = useAuth()
  const next = useNewPassword()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user || !next.valid) return
    setError(null)
    setLoading(true)
    try {
      await api.changePassword({ new_password: next.password })
      updateUser({ ...user, must_change_password: false })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Shell title={t('auth.choose.title')} description={t('auth.choose.description', { username: user?.username ?? '' })}>
      <form onSubmit={submit} className={formCls}>
        {next.fields}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="primary" loading={loading} disabled={!next.valid} className="mt-1 w-full">
          {t('auth.saveContinue')}
        </Button>
        <Button type="button" variant="ghost" onClick={signOut} className="w-full">
          {t('auth.signOut')}
        </Button>
      </form>
    </Shell>
  )
}

/** No mail server: an administrator is told, and hands over a one-time code that sets a new password here. */
function ForgotPassword({ initialUsername, onBack }: { initialUsername: string; onBack: () => void }) {
  const { signIn } = useAuth()
  const [step, setStep] = useState<'ask' | 'code'>('ask')
  const [username, setUsername] = useState(initialUsername)
  const [code, setCode] = useState('')
  const next = useNewPassword()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (step === 'ask') {
        await api.forgotPassword(username)
        setStep('code')
      } else {
        const res = await api.resetPassword({ username, code, new_password: next.password })
        signIn(res.token, res.user)
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Shell
      title={step === 'ask' ? t('auth.forgot.title') : t('auth.forgot.code.title')}
      description={step === 'ask' ? t('auth.forgot.description') : t('auth.forgot.resetting', { username })}
    >
      <form onSubmit={submit} className={formCls}>
        {step === 'ask' ? (
          <Field label={t('auth.username')} autoComplete="username" required minLength={3} value={username} onChange={(e) => setUsername(e.target.value)} />
        ) : (
          <>
            <Notice>{t('auth.forgot.told')}</Notice>
            <Field label={t('auth.forgot.codeLabel')} inputMode="numeric" autoComplete="one-time-code" required data-autofocus placeholder="1234 5678" className="tabular-nums" value={code} onChange={(e) => setCode(e.target.value)} />
            {next.fields}
          </>
        )}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="primary" loading={loading} disabled={step === 'code' && (!next.valid || code.replace(/\D/g, '').length < 8)} className="mt-1 w-full">
          {step === 'ask' ? t('auth.forgot.ask') : t('auth.forgot.set')}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack} className="w-full">
          {t('auth.backToSignIn')}
        </Button>
      </form>
    </Shell>
  )
}

export function AuthScreen() {
  const { needsSetup, signIn } = useAuth()
  const setup = !!needsSetup
  const [forgot, setForgot] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [avatar, setAvatar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const mismatch = setup && confirm.length > 0 && confirm !== password

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (mismatch) return
    setError(null)
    setLoading(true)
    try {
      const res = setup
        ? await api.setup({ username, email, password, avatar: avatar || undefined })
        : await api.login({ username, password })
      signIn(res.token, res.user)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (forgot) return <ForgotPassword initialUsername={username} onBack={() => setForgot(false)} />

  return (
    <Shell title={setup ? t('auth.setup.title') : t('auth.signIn.title')} description={setup ? t('auth.setup.description') : t('auth.signIn.description')}>
        <form onSubmit={submit} className={formCls}>
          {setup && (
            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-raised/40 p-3">
              <Avatar avatar={avatar || `dicebear:bottts:${username || 'admin'}`} username={username || 'Admin'} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-label font-medium text-fg">{t('auth.avatar.title')}</p>
                <p className="text-caption text-muted truncate">{t('auth.avatar.subtitle')}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<DiceFive size={16} />}
                onClick={() => setAvatar(rollRandomAvatar().spec)}
                title={t('auth.avatar.roll')}
              >
                {t('auth.avatar.rollShort')}
              </Button>
            </div>
          )}
          <Field label={t('auth.username')} autoComplete="username" required minLength={3} value={username} onChange={(e) => setUsername(e.target.value)} />
          {setup && <Field label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          <Field
            label={t('auth.password')}
            type="password"
            autoComplete={setup ? 'new-password' : 'current-password'}
            required
            minLength={setup ? 8 : undefined}
            hint={setup ? t('auth.atLeast8') : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {setup && (
            <Field label={t('auth.confirmPassword')} type="password" autoComplete="new-password" required value={confirm} error={mismatch ? t('auth.mismatch') : undefined} onChange={(e) => setConfirm(e.target.value)} />
          )}
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" loading={loading} className="mt-1 w-full">
            {setup ? t('auth.createAccount') : t('auth.signIn')}
          </Button>
          {!setup && (
            <button type="button" onClick={() => setForgot(true)} className="cursor-pointer self-center text-label text-muted underline transition-colors duration-fast hover:text-fg">
              {t('auth.forgotLink')}
            </button>
          )}
          {desktop && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => desktop?.chooseServer()}
              className="w-full"
            >
              {t('auth.changeServer')}
            </Button>
          )}
        </form>
        <div className="mt-4 flex items-center justify-between text-caption text-subtle">
          <p className="flex items-center gap-1.5">
            <LockSimple size={12} aria-hidden />
            <span>{t('auth.encrypted')} {desktop ? t('auth.connectedTo', { host: window.location.host }) : t('auth.dataStays')}</span>
          </p>
          {desktop && (
            <button
              type="button"
              onClick={() => desktop?.chooseServer()}
              className="text-muted hover:text-fg underline transition-colors cursor-pointer"
            >
              {t('auth.change')}
            </button>
          )}
        </div>
    </Shell>
  )
}
