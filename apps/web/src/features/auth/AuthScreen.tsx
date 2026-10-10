import { useState, type FormEvent } from 'react'
import { DiceFive, LockSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { ErrorText } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { rollRandomAvatar } from '@/lib/avatar'
import { api, desktop } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/toast'

export function AuthScreen() {
  const { needsSetup, signIn } = useAuth()
  const setup = !!needsSetup
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

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="anim-enter w-full max-w-[380px]">
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
        <h1 className="mt-6 text-page font-semibold tracking-[-0.01em]">{setup ? 'Set up Docus' : 'Sign in to Docus'}</h1>
        <p className="mt-1 text-body text-muted">
          {setup ? 'Create the administrator account for this home. You can add other people later.' : 'Use your Docus account.'}
        </p>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4 rounded-lg border border-border bg-panel p-5">
          {setup && (
            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-raised/40 p-3">
              <Avatar avatar={avatar || `dicebear:bottts:${username || 'admin'}`} username={username || 'Admin'} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-label font-medium text-fg">Profile avatar</p>
                <p className="text-caption text-muted truncate">DiceBear random avatar</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<DiceFive size={16} />}
                onClick={() => setAvatar(rollRandomAvatar().spec)}
                title="Roll random avatar"
              >
                Roll
              </Button>
            </div>
          )}
          <Field label="Username" autoComplete="username" required minLength={3} value={username} onChange={(e) => setUsername(e.target.value)} />
          {setup && <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          <Field
            label="Password"
            type="password"
            autoComplete={setup ? 'new-password' : 'current-password'}
            required
            minLength={setup ? 8 : undefined}
            hint={setup ? 'At least 8 characters.' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {setup && (
            <Field label="Confirm password" type="password" autoComplete="new-password" required value={confirm} error={mismatch ? 'Passwords do not match.' : undefined} onChange={(e) => setConfirm(e.target.value)} />
          )}
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" loading={loading} className="mt-1 w-full">
            {setup ? 'Create account' : 'Sign in'}
          </Button>
          {desktop && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => desktop?.chooseServer()}
              className="w-full"
            >
              Change server
            </Button>
          )}
        </form>
        <div className="mt-4 flex items-center justify-between text-caption text-subtle">
          <p className="flex items-center gap-1.5">
            <LockSimple size={12} aria-hidden />
            <span>Encrypted connection.{desktop ? ` Connected to ${window.location.host}` : ' Data stays on your server.'}</span>
          </p>
          {desktop && (
            <button
              type="button"
              onClick={() => desktop?.chooseServer()}
              className="text-muted hover:text-fg underline transition-colors cursor-pointer"
            >
              Change
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
