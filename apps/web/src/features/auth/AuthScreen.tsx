import { useState, type FormEvent } from 'react'
import { LockSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { ErrorText } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/toast'

export function AuthScreen() {
  const { needsSetup, signIn } = useAuth()
  const setup = !!needsSetup
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const mismatch = setup && confirm.length > 0 && confirm !== password

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (mismatch) return
    setError(null)
    setLoading(true)
    try {
      const res = setup ? await api.setup({ username, email, password }) : await api.login({ username, password })
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
        </form>
        <p className="mt-4 flex items-center gap-1.5 text-caption text-subtle">
          <LockSimple size={12} aria-hidden /> Encrypted connection. Data stays on your server.
        </p>
      </div>
    </div>
  )
}
