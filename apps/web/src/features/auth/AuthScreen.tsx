import { useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { ShieldCheck } from '@phosphor-icons/react'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/toast'
import { spring } from '@/lib/motion'

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
    <div className="relative flex min-h-dvh items-center justify-center p-4">
      <div className="ambient" aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring.gentle}
        className="glass w-full max-w-md rounded-4xl p-7 sm:p-9"
      >
        <img src="/favicon.svg" alt="" className="h-14 w-14 rounded-3xl" />
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">{setup ? 'Welcome to Docus' : 'Welcome back'}</h1>
        <p className="mt-2 text-muted">
          {setup
            ? 'Create the administrator account for your home. You can invite family members afterwards.'
            : 'Sign in to control your home.'}
        </p>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-4" noValidate={false}>
          <Field
            label="Username"
            autoComplete="username"
            required
            minLength={3}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          {setup && (
            <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
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
            <Field
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              error={mismatch ? 'Passwords do not match' : undefined}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
          {error && (
            <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-2 w-full">
            {setup ? 'Create admin account' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-6 flex items-center gap-2 text-xs text-subtle">
          <ShieldCheck size={16} aria-hidden /> Connection encrypted · data stays on your server
        </p>
      </motion.div>
    </div>
  )
}
