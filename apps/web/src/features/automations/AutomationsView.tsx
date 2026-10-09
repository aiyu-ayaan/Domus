import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lightning, PencilSimple, Play, Plus, Trash } from '@phosphor-icons/react'
import { Card, CardHeader, EmptyState, ErrorText, PageHeader, Skeleton } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Controls'
import { Sheet, Confirm } from '@/components/ui/Sheet'
import { Field } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { useCanControl, useIsAdmin } from '@/lib/auth'
import { keys, useAutomations, useDevices, useGroups, useScenes } from '@/lib/queries'
import { errorMessage, useToast } from '@/lib/toast'
import { timeAgo } from '@/lib/format'
import type { Action, Automation, Condition, Device, Group, Scene, Trigger } from '@/lib/types'
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
    onSuccess: (r, a) => toast.push(r.success ? { tone: 'success', title: `Ran ${a.name}` } : { tone: 'warning', title: `${a.name} had problems`, message: r.errors.join('; ') }),
    onError: (e) => toast.push({ tone: 'error', title: 'Run failed', message: errorMessage(e) }),
  })
  const activate = useMutation({
    mutationFn: (s: Scene) => api.activateScene(s.id),
    onSuccess: (r, s) => {
      qc.invalidateQueries({ queryKey: keys.scenes })
      qc.invalidateQueries({ queryKey: keys.devices })
      toast.push(r.success ? { tone: 'success', title: `${s.name} applied` } : { tone: 'warning', title: `${s.name} partly applied`, message: r.errors.join('; ') })
    },
  })
  const toggleScene = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api.toggleScene(id, on),
    onSuccess: (r, { on }) => {
      qc.invalidateQueries({ queryKey: keys.scenes })
      qc.invalidateQueries({ queryKey: keys.devices })
      toast.push(
        r.success
          ? { tone: 'success', title: `Scene switched ${on ? 'on' : 'off'}` }
          : { tone: 'warning', title: `Scene partly applied`, message: r.errors.join('; ') },
      )
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Scene toggle failed', message: errorMessage(e) }),
  })
  const remove = useMutation({
    mutationFn: async () => {
      if (deleting!.kind === 'automation') await api.removeAutomation(deleting!.id)
      else await api.removeScene(deleting!.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deleting!.kind === 'automation' ? keys.automations : keys.scenes })
      setDeleting(null)
    },
  })

  return (
    <>
      <PageHeader
        title="Automations"
        description="Rules that run on their own, and scenes you trigger with one tap."
        actions={admin && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>New automation</Button>}
      />

      {isLoading ? (
        <Skeleton className="h-32" />
      ) : !automations?.length ? (
        <EmptyState
          icon={<Lightning size={28} />}
          title="No automations"
          message="For example: switch the purifier on when PM2.5 rises above 35, or turn everything off at midnight."
          action={admin && <Button variant="primary" onClick={() => setEditing('new')}>Create automation</Button>}
        />
      ) : (
        <Card>
          <CardHeader title={`Automations · ${automations.length}`} />
          <ul className="divide-y divide-border">
            {automations.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-body font-medium">{a.name}</p>
                  <p className="text-label text-muted">
                    {a.triggers.map((t) => describeTrigger(t, devices)).join(' or ')}, then {a.actions.map((x) => describeAction(x, devices, groups, scenes)).join(', ')}.
                  </p>
                  <p className="mt-0.5 text-caption text-subtle">Last ran {timeAgo(a.last_triggered_at)}</p>
                </div>
                <div className="flex items-center gap-1">
                  {control && <Button variant="ghost" size="sm" aria-label={`Run ${a.name} now`} icon={<Play size={16} />} onClick={() => run.mutate(a)} />}
                  {admin && (
                    <>
                      <Button variant="ghost" size="sm" aria-label={`Edit ${a.name}`} icon={<PencilSimple size={16} />} onClick={() => setEditing(a)} />
                      <Button variant="ghost" size="sm" aria-label={`Delete ${a.name}`} icon={<Trash size={16} />} onClick={() => setDeleting({ kind: 'automation', id: a.id, name: a.name })} />
                      <span className="ml-2">
                        <Switch checked={a.is_enabled} onChange={() => toggle.mutate(a.id)} label={`${a.name} enabled`} />
                      </span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title={`Scenes · ${scenes.length}`} action={admin && <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditingScene('new')}>New scene</Button>} />
        {scenes.length === 0 ? (
          <p className="px-4 py-6 text-label text-muted">A scene sets several devices at once, for example “Movie night” or “Leaving home”.</p>
        ) : (
          <ul className="divide-y divide-border">
            {scenes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-body font-medium">{s.name}</p>
                  <p className="truncate text-label text-muted">{s.actions.map((x) => describeAction(x, devices, groups, scenes)).join(', ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isSceneActive(s, devices, groups)}
                    disabled={!control || (toggleScene.isPending && toggleScene.variables?.id === s.id)}
                    label={`Toggle ${s.name}`}
                    onChange={(on) => toggleScene.mutate({ id: s.id, on })}
                  />
                  {admin && (
                    <>
                      <Button variant="ghost" size="sm" aria-label={`Edit ${s.name}`} icon={<PencilSimple size={16} />} onClick={() => setEditingScene(s)} />
                      <Button variant="ghost" size="sm" aria-label={`Delete ${s.name}`} icon={<Trash size={16} />} onClick={() => setDeleting({ kind: 'scene', id: s.id, name: s.name })} />
                    </>
                  )}
                  <Button size="sm" disabled={!control} loading={activate.isPending && activate.variables?.id === s.id} onClick={() => activate.mutate(s)}>
                    Run
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AutomationSheet automation={editing} onClose={() => setEditing(null)} />
      <SceneSheet scene={editingScene} onClose={() => setEditingScene(null)} />
      <Confirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => remove.mutate()} loading={remove.isPending} title={`Delete ${deleting?.name}?`} message="This cannot be undone." />
    </>
  )
}

function SheetSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-label font-medium">{title}</h3>
      {hint && <p className="text-caption text-subtle">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
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
    mutationFn: async () => {
      const body = { name, description: null, triggers, conditions, actions, is_enabled: existing?.is_enabled ?? true }
      if (existing) await api.updateAutomation(existing.id, body)
      else await api.createAutomation(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.automations })
      toast.push({ tone: 'success', title: 'Automation saved' })
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const submit = () => {
    const problem = !name.trim() ? 'Give the automation a name.' : validateRule(triggers, actions)
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
        <Field label="Name" required placeholder="Purifier on when air is poor" value={name} onChange={(e) => setName(e.target.value)} />
        <SheetSection title="When">
          <TriggerEditor value={triggers} onChange={setTriggers} />
        </SheetSection>
        <SheetSection title="Only if" hint="Optional. All conditions must be true.">
          <ConditionEditor value={conditions} onChange={setConditions} />
        </SheetSection>
        <SheetSection title="Then">
          <ActionEditor value={actions} onChange={setActions} />
        </SheetSection>
        <ErrorText>{error}</ErrorText>
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
    const problem = !name.trim() ? 'Give the scene a name.' : validateRule(null, actions)
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
        <Field label="Name" required placeholder="Movie night" value={name} onChange={(e) => setName(e.target.value)} />
        <SheetSection title="Actions">
          <ActionEditor value={actions} onChange={setActions} allowScenes={false} />
        </SheetSection>
        <ErrorText>{error}</ErrorText>
      </div>
    </Sheet>
  )
}

function isSceneActive(scene: Scene, devices: Device[], groups: Group[]): boolean {
  const targetIds = new Set<string>()
  for (const action of scene.actions) {
    if (action.type === 'device_command' && action.device_id) {
      targetIds.add(action.device_id)
    } else if (action.type === 'group_command' && action.group_id) {
      const g = groups.find((grp) => grp.id === action.group_id)
      g?.device_ids.forEach((id) => targetIds.add(id))
    }
  }
  if (targetIds.size > 0) {
    const memberDevices = devices.filter((d) => targetIds.has(d.id))
    return memberDevices.some((d) => d.is_online && d.state.is_on)
  }
  return scene.is_active
}

