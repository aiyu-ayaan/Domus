import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Lightning,
  Monitor,
  PencilSimple,
  Play,
  Plus,
  Sparkle,
  StopCircle,
  Trash,
} from '@phosphor-icons/react'
import { Badge, Card, CardHeader, EmptyState, ErrorText, Notice, PageHeader, Skeleton } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Segmented, Slider, Switch } from '@/components/ui/Controls'
import { Sheet, Confirm } from '@/components/ui/Sheet'
import { Checkbox, Field } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { useCanControl, useIsAdmin } from '@/lib/auth'
import { keys, useAutomations, useDevices, useGroups, useScenes } from '@/lib/queries'
import { errorMessage, useToast } from '@/lib/toast'
import { timeAgo } from '@/lib/format'
import type { Action, Automation, Condition, Device, Group, Scene, SceneKind, ScreenSyncConfig, Trigger } from '@/lib/types'
import {
  SCREEN_SYNC_DEFAULTS,
  isScreenSyncSupported,
  screenSyncConfig,
  useScreenSync,
} from '@/features/screensync/ScreenSync'
import { ActionEditor, ConditionEditor, TriggerEditor, describeAction, describeTrigger, validateRule } from './RuleEditor'

export function AutomationsView() {
  const admin = useIsAdmin()
  const control = useCanControl()
  const qc = useQueryClient()
  const toast = useToast()
  const { start: startScreenSync, stop: stopScreenSync, isRunning: isScreenSyncRunning } = useScreenSync()
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
            {scenes.map((s) => {
              if (s.kind === 'screen_sync') {
                const isLocal = isScreenSyncRunning(s.id)
                const isRemote = s.is_active && !isLocal
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1 basis-64">
                      <div className="flex items-center gap-2">
                        <Monitor size={16} className="shrink-0 text-info" />
                        <span className="text-body font-medium">{s.name}</span>
                        <Badge tone="info">Screen Sync</Badge>
                      </div>
                      <p className="truncate text-label text-muted">{describeScreenSyncSubtitle(s, groups)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isLocal ? (
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5 items-center justify-center mr-1" aria-hidden>
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-info shadow-[0_0_8px_rgb(var(--info))]" />
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger/10 hover:text-danger"
                            icon={<StopCircle size={16} />}
                            onClick={() => stopScreenSync()}
                          >
                            Stop Sync
                          </Button>
                        </div>
                      ) : isRemote ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 text-caption font-medium text-info mr-1">
                            <span className="h-2 w-2 rounded-full bg-info animate-pulse shadow-[0_0_8px_rgb(var(--info))]" />
                            Live
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger/10 hover:text-danger"
                            icon={<StopCircle size={16} />}
                            disabled={!control || (toggleScene.isPending && toggleScene.variables?.id === s.id)}
                            onClick={() => toggleScene.mutate({ id: s.id, on: false })}
                          >
                            Stop
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          icon={<Monitor size={14} />}
                          disabled={!control}
                          onClick={() => void startScreenSync(s)}
                        >
                          Sync screen
                        </Button>
                      )}
                      {admin && (
                        <>
                          <Button variant="ghost" size="sm" aria-label={`Edit ${s.name}`} icon={<PencilSimple size={16} />} onClick={() => setEditingScene(s)} />
                          <Button variant="ghost" size="sm" aria-label={`Delete ${s.name}`} icon={<Trash size={16} />} onClick={() => setDeleting({ kind: 'scene', id: s.id, name: s.name })} />
                        </>
                      )}
                    </div>
                  </li>
                )
              }

              return (
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
              )
            })}
          </ul>
        )}
      </Card>

      <AutomationSheet automation={editing} onClose={() => setEditing(null)} />
      <SceneSheet scene={editingScene} onClose={() => setEditingScene(null)} devices={devices} groups={groups} />
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

function describeScreenSyncSubtitle(s: Scene, groups: Group[]): string {
  const cfg = screenSyncConfig(s)
  const allDeviceIds = new Set<string>([
    ...cfg.device_ids,
    ...cfg.group_ids.flatMap((gid) => groups.find((g) => g.id === gid)?.device_ids ?? []),
  ])
  const count = allDeviceIds.size || (cfg.device_ids.length + cfg.group_ids.length)
  const targetsDesc = `${count} light${count === 1 ? '' : 's'}`
  const styleDesc = cfg.style === 'vivid' ? 'Vivid mode' : cfg.style === 'dominant' ? 'Dominant mode' : 'Soft Average mode'
  const regionDesc = cfg.region === 'edges' ? 'Edges (Ambilight)' : 'Entire screen'
  const fpsDesc = `${cfg.fps} fps`
  return `Screen Sync · ${targetsDesc} · ${styleDesc} · ${regionDesc} · ${fpsDesc}`
}

function SceneSheet({
  scene,
  onClose,
  devices,
  groups,
}: {
  scene: Scene | 'new' | null
  onClose: () => void
  devices: Device[]
  groups: Group[]
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const existing = scene && scene !== 'new' ? scene : null
  const [kind, setKind] = useState<SceneKind>('standard')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [actions, setActions] = useState<Action[]>([])
  const [syncConfig, setSyncConfig] = useState<ScreenSyncConfig>(SCREEN_SYNC_DEFAULTS)
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const current = existing?.id ?? (scene === 'new' ? 'new' : null)
  if (current !== key) {
    setKey(current)
    setName(existing?.name ?? '')
    setKind(existing?.kind ?? 'standard')
    setIcon(existing?.icon ?? null)
    setActions(existing?.actions ?? [{ type: 'device_command', device_id: '', command: { is_on: false } }])
    setSyncConfig(existing ? screenSyncConfig(existing) : { ...SCREEN_SYNC_DEFAULTS })
    setError(null)
  }
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        icon: icon ?? undefined,
        actions: kind === 'screen_sync' ? [] : actions,
        kind,
        config: kind === 'screen_sync' ? syncConfig : undefined,
      }
      if (existing) await api.updateScene(existing.id, body)
      else await api.createScene(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.scenes })
      toast.push({ tone: 'success', title: 'Scene saved' })
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const submit = () => {
    if (!name.trim()) {
      setError('Give the scene a name.')
      return
    }
    if (kind === 'screen_sync') {
      if (syncConfig.device_ids.length === 0 && syncConfig.group_ids.length === 0) {
        setError('Select at least one target light or device group.')
        return
      }
    } else {
      const problem = validateRule(null, actions)
      if (problem) {
        setError(problem)
        return
      }
    }
    setError(null)
    save.mutate()
  }

  const lightDevices = devices.filter(
    (d) => d.device_type === 'light' || d.state.color != null || d.state.color_temp != null || d.state.brightness != null,
  )

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
        <SheetSection title="Scene Type">
          <Segmented<SceneKind>
            label="Scene type"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'standard', label: 'Standard scene' },
              { value: 'screen_sync', label: 'Screen Sync (Ambient light)' },
            ]}
          />
        </SheetSection>

        <Field
          label="Name"
          required
          placeholder={kind === 'screen_sync' ? 'Screen Sync - TV Backlight' : 'Movie night'}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {kind === 'standard' ? (
          <SheetSection title="Actions">
            <ActionEditor value={actions} onChange={setActions} allowScenes={false} />
          </SheetSection>
        ) : (
          <>
            <Notice tone="info">
              Screen Sync mirrors your screen’s dominant colors onto smart lights in real-time, creating an immersive ambient backlight effect for movies and gaming.
            </Notice>

            {!isScreenSyncSupported() && (
              <Notice tone="warn">
                Screen sharing is not supported in this browser window. You can still configure and save this scene.
              </Notice>
            )}

            <SheetSection title="Target Lights" hint="Choose color lights and device groups to mirror the screen.">
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-raised/40 p-2">
                {lightDevices.length === 0 && groups.length === 0 ? (
                  <p className="px-2 py-3 text-caption text-subtle">No lights or device groups available.</p>
                ) : (
                  <>
                    {groups.length > 0 && (
                      <div className="mb-2">
                        <span className="px-2 text-caption font-semibold uppercase tracking-wider text-subtle">
                          Device Groups
                        </span>
                        <div className="mt-1 flex flex-col gap-0.5">
                          {groups.map((g) => {
                            const checked = syncConfig.group_ids.includes(g.id)
                            return (
                              <Checkbox
                                key={g.id}
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? syncConfig.group_ids.filter((id) => id !== g.id)
                                    : [...syncConfig.group_ids, g.id]
                                  setSyncConfig({ ...syncConfig, group_ids: next })
                                }}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="truncate text-body font-medium">{g.name}</span>
                                  <span className="text-caption text-subtle">({g.device_ids.length} devices)</span>
                                </div>
                              </Checkbox>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {lightDevices.length > 0 && (
                      <div>
                        {groups.length > 0 && (
                          <span className="px-2 text-caption font-semibold uppercase tracking-wider text-subtle">
                            Individual Lights
                          </span>
                        )}
                        <div className="mt-1 flex flex-col gap-0.5">
                          {lightDevices.map((d) => {
                            const checked = syncConfig.device_ids.includes(d.id)
                            return (
                              <Checkbox
                                key={d.id}
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? syncConfig.device_ids.filter((id) => id !== d.id)
                                    : [...syncConfig.device_ids, d.id]
                                  setSyncConfig({ ...syncConfig, device_ids: next })
                                }}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <Sparkle size={16} className="shrink-0 text-info" />
                                  <span className="truncate text-body">{d.name}</span>
                                  {d.state.color != null && (
                                    <span
                                      className="h-3 w-3 shrink-0 rounded-full border border-border"
                                      style={{ backgroundColor: d.state.color }}
                                      title={d.state.color}
                                    />
                                  )}
                                </div>
                              </Checkbox>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </SheetSection>

            <SheetSection title="Extraction Style" hint="How colors are sampled from the screen.">
              <Segmented<'vivid' | 'dominant' | 'average'>
                label="Extraction style"
                value={syncConfig.style}
                onChange={(style) => setSyncConfig({ ...syncConfig, style })}
                options={[
                  { value: 'vivid', label: 'Vivid (Dynamic)' },
                  { value: 'dominant', label: 'Dominant' },
                  { value: 'average', label: 'Soft Average' },
                ]}
              />
              <p className="mt-2 text-caption text-subtle">
                {syncConfig.style === 'vivid' && 'Strongest hue, ideal for gaming & movies.'}
                {syncConfig.style === 'dominant' && 'Most common color across the sample area.'}
                {syncConfig.style === 'average' && 'Mean ambient color blended smoothly.'}
              </p>
            </SheetSection>

            <SheetSection title="Capture Area" hint="Area of the screen analyzed for color.">
              <Segmented<'full' | 'edges'>
                label="Capture area"
                value={syncConfig.region}
                onChange={(region) => setSyncConfig({ ...syncConfig, region })}
                options={[
                  { value: 'full', label: 'Entire screen' },
                  { value: 'edges', label: 'Edges only (Ambilight)' },
                ]}
              />
              <p className="mt-2 text-caption text-subtle">
                {syncConfig.region === 'edges'
                  ? 'Perimeters only, for TV backlights and lightstrips.'
                  : 'Entire screen display.'}
              </p>
            </SheetSection>

            <SheetSection title="Brightness Sync">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-label font-medium">Sync light brightness with screen luminance</span>
                  <p className="text-caption text-subtle">Dim lights during dark scenes and brighten during light scenes.</p>
                </div>
                <Switch
                  checked={syncConfig.follow_brightness}
                  onChange={(follow_brightness) => setSyncConfig({ ...syncConfig, follow_brightness })}
                  label="Sync light brightness with screen luminance"
                />
              </div>

              {syncConfig.follow_brightness && (
                <div className="mt-4 flex flex-col gap-4 rounded-md border border-border bg-raised/40 p-3">
                  <div>
                    <div className="flex items-center justify-between text-caption font-medium">
                      <span>Minimum brightness (1–50%)</span>
                      <span className="tabular text-subtle">{syncConfig.min_brightness}%</span>
                    </div>
                    <div className="mt-1.5">
                      <Slider
                        label="Minimum brightness"
                        min={1}
                        max={50}
                        value={syncConfig.min_brightness}
                        onChange={(min_brightness) => setSyncConfig({ ...syncConfig, min_brightness })}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-caption font-medium">
                      <span>Maximum brightness (50–100%)</span>
                      <span className="tabular text-subtle">{syncConfig.max_brightness}%</span>
                    </div>
                    <div className="mt-1.5">
                      <Slider
                        label="Maximum brightness"
                        min={50}
                        max={100}
                        value={syncConfig.max_brightness}
                        onChange={(max_brightness) => setSyncConfig({ ...syncConfig, max_brightness })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </SheetSection>

            <SheetSection title="Smoothing" hint="0 = Instant, 100 = Smooth transition (default 40).">
              <div className="flex items-center justify-between text-caption font-medium">
                <span>Transition smoothing</span>
                <span className="tabular text-subtle">
                  {syncConfig.smoothing === 0 ? 'Instant (0%)' : `${syncConfig.smoothing}%`}
                </span>
              </div>
              <div className="mt-1.5">
                <Slider
                  label="Smoothing"
                  min={0}
                  max={100}
                  value={syncConfig.smoothing}
                  onChange={(smoothing) => setSyncConfig({ ...syncConfig, smoothing })}
                />
              </div>
              <div className="mt-1 flex justify-between text-caption text-subtle">
                <span>0 (Instant)</span>
                <span>100 (Smooth transition)</span>
              </div>
            </SheetSection>

            <SheetSection title="Frame Rate" hint="Samples per second sent to the lights.">
              <Segmented<string>
                label="Frame rate"
                value={String(syncConfig.fps)}
                onChange={(val) => setSyncConfig({ ...syncConfig, fps: Number(val) })}
                options={[
                  { value: '5', label: '5 fps' },
                  { value: '10', label: '10 fps' },
                  { value: '15', label: '15 fps' },
                  { value: '20', label: '20 fps' },
                ]}
              />
            </SheetSection>

            <SheetSection title="Restore on Stop">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-label font-medium">Restore lights to previous color &amp; state</span>
                  <p className="text-caption text-subtle">
                    Restore lights to previous color &amp; state when sharing stops.
                  </p>
                </div>
                <Switch
                  checked={syncConfig.restore_on_stop}
                  onChange={(restore_on_stop) => setSyncConfig({ ...syncConfig, restore_on_stop })}
                  label="Restore lights to previous color & state when sharing stops"
                />
              </div>
            </SheetSection>
          </>
        )}

        <ErrorText>{error}</ErrorText>
      </div>
    </Sheet>
  )
}

function isSceneActive(scene: Scene, devices: Device[], groups: Group[]): boolean {
  if (scene.kind === 'screen_sync') {
    return scene.is_active
  }
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

