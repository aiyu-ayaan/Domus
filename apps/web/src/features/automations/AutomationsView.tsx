import { useState } from 'react'
import { motion } from 'motion/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lightning, MagicWand, PencilSimple, Play, Plus, Trash } from '@phosphor-icons/react'
import { Card, EmptyState, PageHeader, SectionTitle, Skeleton } from '@/components/Layout'
import { Button } from '@/components/Button'
import { Switch } from '@/components/Controls'
import { Sheet, Confirm } from '@/components/Sheet'
import { Field } from '@/components/Field'
import { api } from '@/lib/api'
import { useCanControl, useIsAdmin } from '@/lib/auth'
import { keys, useAutomations, useDevices, useGroups, useScenes } from '@/lib/queries'
import { errorMessage, useToast } from '@/lib/toast'
import { timeAgo } from '@/lib/format'
import { stagger } from '@/lib/motion'
import type { Action, Automation, Condition, Scene, Trigger } from '@/lib/types'
import { ActionEditor, ConditionEditor, TriggerEditor, describeAction, describeTrigger, validateRule } from './RuleEditor'

export function AutomationsView() {
  const admin = useIsAdmin()
  const control = useCanControl()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: automations, isLoading } = useAutomations()
  const { data: scenes = [] } = useScenes()
  const { data: devices = [] } = useDevices()
  const { data: groups = [] } = useGroups()
  const [editing, setEditing] = useState<Automation | 'new' | null>(null)
  const [editingScene, setEditingScene] = useState<Scene | 'new' | null>(null)
  const [deleting, setDeleting] = useState<{ kind: 'automation' | 'scene'; id: string; name: string } | null>(null)

  const toggle = useMutation({
    mutationFn: api.toggleAutomation,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.automations }),
    onError: (e) => toast.push({ tone: 'error', title: 'Could not update', message: errorMessage(e) }),
  })
  const run = useMutation({
    mutationFn: (a: Automation) => api.runAutomation(a.id),
    onSuccess: (r, a) =>
      toast.push(r.success ? { tone: 'success', title: `Ran “${a.name}”` } : { tone: 'warning', title: `“${a.name}” had problems`, message: r.errors.join('; ') }),
    onError: (e) => toast.push({ tone: 'error', title: 'Run failed', message: errorMessage(e) }),
  })
  const activate = useMutation({
    mutationFn: (s: Scene) => api.activateScene(s.id),
    onSuccess: (r, s) => {
      qc.invalidateQueries({ queryKey: keys.scenes })
      toast.push(r.success ? { tone: 'success', title: `${s.name} activated` } : { tone: 'warning', title: `${s.name} partly applied`, message: r.errors.join('; ') })
    },
  })
  const remove = useMutation({
    mutationFn: () => (deleting!.kind === 'automation' ? api.removeAutomation(deleting!.id) : api.removeScene(deleting!.id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deleting!.kind === 'automation' ? keys.automations : keys.scenes })
      setDeleting(null)
    },
  })

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <PageHeader
        title="Automations"
        subtitle="Let your home react on its own"
        actions={
          admin && (
            <Button variant="primary" icon={<Plus size={18} />} onClick={() => setEditing('new')}>
              New automation
            </Button>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="h-32" />
      ) : !automations?.length ? (
        <EmptyState
          icon={<Lightning size={30} />}
          title="No automations yet"
          message="Turn the porch light on at sunset, get notified when the washer finishes, or switch the purifier on when PM2.5 rises."
          action={admin && <Button variant="primary" onClick={() => setEditing('new')}>Create automation</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {automations.map((a) => (
            <Card key={a.id} className="flex flex-wrap items-center gap-4">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${a.is_enabled ? 'bg-warn/20 text-warn' : 'bg-line/[0.08] text-muted'}`}>
                <Lightning size={24} weight={a.is_enabled ? 'fill' : 'regular'} aria-hidden />
              </span>
              <div className="min-w-0 flex-1 basis-60">
                <p className="font-bold">{a.name}</p>
                <p className="text-sm text-muted">
                  {a.triggers.map((t) => describeTrigger(t, devices)).join(' or ')}, {a.actions.map((x) => describeAction(x, devices, groups, scenes)).join(', then ')}.
                </p>
                <p className="mt-1 text-xs text-subtle">Last ran {timeAgo(a.last_triggered_at)}</p>
              </div>
              <div className="flex items-center gap-1">
                {control && <Button variant="ghost" size="sm" aria-label={`Run ${a.name} now`} icon={<Play size={18} />} onClick={() => run.mutate(a)} />}
                {admin && (
                  <>
                    <Button variant="ghost" size="sm" aria-label={`Edit ${a.name}`} icon={<PencilSimple size={18} />} onClick={() => setEditing(a)} />
                    <Button variant="ghost" size="sm" aria-label={`Delete ${a.name}`} icon={<Trash size={18} />} onClick={() => setDeleting({ kind: 'automation', id: a.id, name: a.name })} />
                    <Switch checked={a.is_enabled} onChange={() => toggle.mutate(a.id)} label={`${a.name} enabled`} />
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle
        action={
          admin && (
            <Button variant="glass" size="sm" icon={<Plus size={16} />} onClick={() => setEditingScene('new')}>
              New scene
            </Button>
          )
        }
      >
        Scenes
      </SectionTitle>
      {scenes.length === 0 ? (
        <p className="surface rounded-4xl p-6 text-muted">Scenes set several devices at once — “Movie night” or “Leaving home”.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <MagicWand size={22} weight="fill" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{s.name}</p>
                  <p className="line-clamp-2 text-sm text-muted">{s.actions.map((x) => describeAction(x, devices, groups, scenes)).join(', ')}</p>
                </div>
              </div>
              <div className="mt-auto flex items-center gap-1">
                <Button variant="primary" size="sm" icon={<Play size={16} />} disabled={!control} loading={activate.isPending && activate.variables?.id === s.id} onClick={() => activate.mutate(s)}>
                  Activate
                </Button>
                {admin && (
                  <>
                    <Button variant="ghost" size="sm" aria-label={`Edit ${s.name}`} icon={<PencilSimple size={18} />} onClick={() => setEditingScene(s)} className="ml-auto" />
                    <Button variant="ghost" size="sm" aria-label={`Delete ${s.name}`} icon={<Trash size={18} />} onClick={() => setDeleting({ kind: 'scene', id: s.id, name: s.name })} />
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <AutomationSheet automation={editing} onClose={() => setEditing(null)} />
      <SceneSheet scene={editingScene} onClose={() => setEditingScene(null)} />
      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={`Delete ${deleting?.name}?`}
        message="This cannot be undone."
      />
    </motion.div>
  )
}

function AutomationSheet({ automation, onClose }: { automation: Automation | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const existing = automation && automation !== 'new' ? automation : null
  const [name, setName] = useState('')
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [conditions, setConditions] = useState<Condition[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const current = existing?.id ?? (automation === 'new' ? 'new' : null)
  if (current !== key) {
    setKey(current)
    setName(existing?.name ?? '')
    setTriggers(existing?.triggers ?? [{ type: 'time', at: '07:00', days: [] }])
    setConditions(existing?.conditions ?? [])
    setActions(existing?.actions ?? [{ type: 'device_command', device_id: '', command: { is_on: true } }])
    setError(null)
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { name, description: null, triggers, conditions, actions, is_enabled: existing?.is_enabled ?? true }
      return existing ? api.updateAutomation(existing.id, body) : api.createAutomation(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.automations })
      toast.push({ tone: 'success', title: 'Automation saved' })
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const submit = () => {
    const problem = !name.trim() ? 'Give the automation a name' : validateRule(triggers, actions)
    if (problem) setError(problem)
    else save.mutate()
  }

  return (
    <Sheet
      open={!!automation}
      onClose={onClose}
      size="lg"
      title={existing ? 'Edit automation' : 'New automation'}
      footer={
        <>
          {error && (
            <p role="alert" className="mr-auto self-center text-sm text-danger">
              {error}
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Purifier on when air is poor" />
        <section>
          <h3 className="mb-3 font-bold">When</h3>
          <TriggerEditor value={triggers} onChange={setTriggers} />
        </section>
        <section>
          <h3 className="mb-1 font-bold">Only if</h3>
          <p className="mb-3 text-sm text-muted">Optional — every condition must be true.</p>
          <ConditionEditor value={conditions} onChange={setConditions} />
        </section>
        <section>
          <h3 className="mb-3 font-bold">Then</h3>
          <ActionEditor value={actions} onChange={setActions} />
        </section>
      </div>
    </Sheet>
  )
}

function SceneSheet({ scene, onClose }: { scene: Scene | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const existing = scene && scene !== 'new' ? scene : null
  const [name, setName] = useState('')
  const [actions, setActions] = useState<Action[]>([])
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const current = existing?.id ?? (scene === 'new' ? 'new' : null)
  if (current !== key) {
    setKey(current)
    setName(existing?.name ?? '')
    setActions(existing?.actions ?? [{ type: 'device_command', device_id: '', command: { is_on: false } }])
    setError(null)
  }
  const save = useMutation({
    mutationFn: async () => {
      if (existing) await api.updateScene(existing.id, { name, actions })
      else await api.createScene({ name, actions })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.scenes })
      toast.push({ tone: 'success', title: 'Scene saved' })
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const submit = () => {
    const problem = !name.trim() ? 'Give the scene a name' : validateRule(null, actions)
    if (problem) setError(problem)
    else save.mutate()
  }
  return (
    <Sheet
      open={!!scene}
      onClose={onClose}
      size="lg"
      title={existing ? 'Edit scene' : 'New scene'}
      footer={
        <>
          {error && (
            <p role="alert" className="mr-auto self-center text-sm text-danger">
              {error}
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Movie night" />
        <section>
          <h3 className="mb-3 font-bold">Actions</h3>
          <ActionEditor value={actions} onChange={setActions} allowScenes={false} />
        </section>
      </div>
    </Sheet>
  )
}
