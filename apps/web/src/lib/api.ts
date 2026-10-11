import type { Range } from './format'
import type {
  AirPoint,
  Automation,
  Device,
  DeviceCommand,
  Discovered,
  EffectCatalog,
  DiscoveryReport,
  DiscoverySettings,
  ElectricitySettings,
  EnergyOverview,
  EnergyPoint,
  Group,
  Integration,
  Notification,
  Room,
  Scene,
  SceneKind,
  ScreenSyncConfig,
  ServerLinks,
  HomeLocation,
  User,
} from './types'

import { getStorageKey, type AppFlavor } from './flavor'
import { t, tOr } from '@/lib/i18n'

const TOKEN_KEY = getStorageKey('domus.token')

/** What the desktop app's preload exposes (apps/desktop/src/preload.js). */
interface DesktopBridge {
  platform?: string
  isDesktop?: boolean
  flavor?: AppFlavor
  hour12?: boolean
  apiBase?: string
  /** One token for the local and the remote address, which are different origins. */
  token: { get(): string | null; set(token: string | null): void }
  saveLinks(links: ServerLinks): void
  chooseServer(): void
  /** 'system' | 'light' | 'dark': the window buttons follow the app theme. */
  setTheme(theme: string): void
  /** The desktop app's own releases. Absent in desktop builds older than the update channel. */
  updates?: {
    info(): Promise<{ version: string; channel: UpdateChannel; selfInstall: boolean; skipped?: string | null } | null>
    check(): Promise<{ version: string } | null>
    /** The reason it failed, or '' (the app restarts, or the installer was opened). */
    install(): Promise<string>
    setChannel(channel: UpdateChannel): Promise<void>
    /** Don't offer the found version at start again. Absent, like `onProgress`, in older desktop builds. */
    skip?(): Promise<void>
    /** The download's progress, 0..1, then null. Returns the function that stops listening. */
    onProgress?(listener: (fraction: number | null) => void): () => void
  }
}
export type UpdateChannel = 'stable' | 'beta' | 'alpha'
export const desktop = (window as unknown as { domus?: DesktopBridge }).domus

/**
 * API origin. Same-origin in the browser (the backend or Vite proxy serves
 * /api); Electron's preload can point it at the home server.
 */
const BASE = desktop?.apiBase ?? ''

export const session = {
  get token() {
    try {
      return desktop ? desktop.token.get() : localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string | null) {
    try {
      if (desktop) desktop.token.set(token)
      else if (token) localStorage.setItem(TOKEN_KEY, token)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage unavailable: session lasts for this tab only */
    }
  },
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Devices that ask before switching, when the server wants a yes first (status 428). */
    public confirm?: string[],
    public code?: string,
    public params?: Record<string, string | number>,
  ) {
    super(message)
  }
}

let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

/** Asked when the server wants a yes before switching devices that ask first; resolves to the answer. */
let askToConfirm: ((names: string[]) => Promise<boolean>) | null = null
export const setConfirmHandler = (fn: typeof askToConfirm) => {
  askToConfirm = fn
}

async function request<T>(method: string, path: string, body?: unknown, confirmed = false): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = session.token
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(t('api.unreachable'), 0)
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.()
    const names: string[] | undefined = data?.error?.confirm
    if (res.status === 428 && names?.length && askToConfirm && !confirmed) {
      if (!(await askToConfirm(names))) throw new ApiError(t('api.notSwitched'), 428)
      return request<T>(method, `${path}${path.includes('?') ? '&' : '?'}confirmed=true`, body, true)
    }
    const code: string | undefined = data?.error?.code
    const params: Record<string, string | number> | undefined = data?.error?.params
    const fallback: string = data?.error?.message ?? t('api.requestFailed', { status: res.status })
    throw new ApiError(tOr(code, params, fallback), res.status, names, code, params)
  }
  return data as T
}

/** The viewer's time zone: history buckets are hours and days on their clock, not the server's. */
const zone = () => encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)

const get = <T>(p: string) => request<T>('GET', p)
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {})
const put = <T>(p: string, b: unknown) => request<T>('PUT', p, b)
const patch = <T>(p: string, b: unknown) => request<T>('PATCH', p, b)
const del = <T>(p: string) => request<T>('DELETE', p)

type Ok = { success: boolean }
type AuthResponse = { token: string; user: User }
export type SceneBody = {
  name: string
  icon?: string
  actions: Scene['actions']
  kind?: SceneKind
  config?: Partial<ScreenSyncConfig>
}

export const wsUrl = () => {
  const origin = BASE || window.location.origin
  return `${origin.replace(/^http/, 'ws')}/api/v1/ws?token=${encodeURIComponent(session.token ?? '')}`
}

/** Live colour stream of a Screen Sync scene. */
export const sceneSyncUrl = (sceneId: string) => {
  const origin = BASE || window.location.origin
  return `${origin.replace(/^http/, 'ws')}/api/v1/scenes/${encodeURIComponent(sceneId)}/sync?token=${encodeURIComponent(session.token ?? '')}`
}

/** What a member or guest may reach; the `view_only_*` lists are the subset they may not control, the `edit_*` lists the subset they may also rename. */
export interface Grants {
  room_ids: string[]
  device_ids: string[]
  view_only_room_ids: string[]
  view_only_device_ids: string[]
  edit_room_ids: string[]
  edit_device_ids: string[]
}

export const api = {
  setupStatus: () => get<{ needs_admin_setup: boolean }>('/auth/setup-status'),
  setup: (b: { username: string; email: string; password: string; avatar?: string }) => post<AuthResponse>('/auth/setup', b),
  login: (b: { username: string; password: string }) => post<AuthResponse>('/auth/login', b),
  me: () => get<User>('/auth/me'),
  updateAvatar: (avatar: string) => put<User>('/auth/me/avatar', { avatar }),

  /** The desktop app keeps the answer, so it can find the server from home and from outside. */
  serverLinks: () =>
    get<ServerLinks>('/server/links').then((links) => {
      desktop?.saveLinks(links)
      return links
    }),
  homeLocation: () => get<HomeLocation>('/server/location'),
  saveHomeLocation: (b: { latitude: number; longitude: number }) => put<HomeLocation>('/server/location', b),
  /** Places named like `q`, looked up by the server. */
  searchPlaces: (q: string) => get<{ name: string; latitude: number; longitude: number }[]>(`/server/location/search?q=${encodeURIComponent(q)}`),
  /** Saves the database, with the key that opens its stored accounts, as one file. */
  downloadBackup: async () => {
    const res = await fetch(`${BASE}/api/v1/server/backup`, { headers: { Authorization: `Bearer ${session.token}` } }).catch(() => null)
    if (!res?.ok) throw new ApiError((await res?.json().catch(() => null))?.error?.message ?? t('settings.backup.failed'), res?.status ?? 0)
    const link = document.createElement('a')
    link.href = URL.createObjectURL(await res.blob())
    link.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'domus-backup.db'
    link.click()
    URL.revokeObjectURL(link.href)
  },
  saveServerLinks: (b: { local_url: string; remote_url: string }) =>
    put<ServerLinks>('/server/links', b).then((links) => {
      desktop?.saveLinks(links)
      return links
    }),
  /** `current_password` may be left out while the account is still on its generated password. */
  changePassword: (b: { current_password?: string; new_password: string }) => post<Ok>('/auth/password', b),
  /** Tells the administrators; the answer is the same whether or not the account exists. */
  forgotPassword: (username: string) => post<Ok>('/auth/forgot', { username }),
  /** Spends the one-time code an administrator handed over and signs in. */
  resetPassword: (b: { username: string; code: string; new_password: string }) => post<AuthResponse>('/auth/reset', b),

  devices: () => get<Device[]>('/devices'),
  device: (id: string) => get<Device>(`/devices/${id}`),
  updateDevice: (id: string, b: { name?: string; room_id?: string | null; icon?: string | null; confirm_changes?: boolean }) =>
    patch<Device>(`/devices/${id}`, b),
  removeDevice: (id: string) => del<Ok>(`/devices/${id}`),
  command: (id: string, cmd: DeviceCommand) => post<Device>(`/devices/${id}/command`, cmd),
  effects: () => get<EffectCatalog>('/devices/effects'),
  refresh: (id: string) => post<Device>(`/devices/${id}/refresh`),
  addManual: (b: { integration_type: string; host: string; token?: string; name?: string; room_id?: string }) =>
    post<Device>('/devices/manual', b),

  discovered: (status = 'pending') => get<Discovered[]>(`/discovery?status=${status}`),
  scan: () => post<DiscoveryReport>('/discovery/scan'),
  adopt: (id: string, b: { name?: string; room_id?: string; token?: string }) => post<Device>(`/discovery/${id}/adopt`, b),
  ignore: (id: string) => post<Ok>(`/discovery/${id}/ignore`),
  restore: (id: string) => post<Ok>(`/discovery/${id}/restore`),
  discoverySettings: () => get<DiscoverySettings>('/discovery/settings'),
  saveDiscoverySettings: (b: DiscoverySettings) => put<DiscoverySettings>('/discovery/settings', b),

  groups: () => get<Group[]>('/groups'),
  createGroup: (b: { name: string; description?: string; device_ids: string[] }) => post<Group>('/groups', b),
  updateGroup: (id: string, b: { name: string; description?: string; device_ids: string[] }) => put<Ok>(`/groups/${id}`, b),
  removeGroup: (id: string) => del<Ok>(`/groups/${id}`),
  groupCommand: (id: string, cmd: DeviceCommand) =>
    post<{ sent: number; failed: { device_id: string; error: string }[] }>(`/groups/${id}/command`, cmd),

  rooms: () => get<Room[]>('/rooms'),
  createRoom: (b: { name: string; icon?: string; floor?: number }) => post<Room>('/rooms', b),
  updateRoom: (id: string, b: { name: string; icon?: string; floor?: number }) => put<Ok>(`/rooms/${id}`, b),
  removeRoom: (id: string) => del<Ok>(`/rooms/${id}`),

  automations: () => get<Automation[]>('/automations'),
  createAutomation: (b: Omit<Automation, 'id' | 'created_at' | 'last_triggered_at'>) => post<Automation>('/automations', b),
  updateAutomation: (id: string, b: Omit<Automation, 'id' | 'created_at' | 'last_triggered_at'>) =>
    put<Automation>(`/automations/${id}`, b),
  toggleAutomation: (id: string) => post<Automation>(`/automations/${id}/toggle`),
  runAutomation: (id: string) => post<{ success: boolean; errors: string[] }>(`/automations/${id}/run`),
  removeAutomation: (id: string) => del<Ok>(`/automations/${id}`),

  scenes: () => get<Scene[]>('/scenes'),
  createScene: (b: SceneBody) => post<Scene>('/scenes', b),
  updateScene: (id: string, b: SceneBody) => put<Ok>(`/scenes/${id}`, b),
  activateScene: (id: string) => post<{ success: boolean; errors: string[] }>(`/scenes/${id}/activate`),
  deactivateScene: (id: string) => post<{ success: boolean; errors: string[] }>(`/scenes/${id}/deactivate`),
  toggleScene: (id: string, on?: boolean) =>
    post<{ success: boolean; errors: string[] }>(`/scenes/${id}/toggle`, on !== undefined ? { on } : undefined),
  removeScene: (id: string) => del<Ok>(`/scenes/${id}`),

  energyOverview: () => get<EnergyOverview>('/energy/overview'),
  energyHistory: (range: Exclude<Range, 'live'>, deviceId?: string) =>
    get<EnergyPoint[]>(`/energy/history?range=${range}&tz=${zone()}${deviceId ? `&device_id=${deviceId}` : ''}`),
  /** Air is sampled every few minutes, so it has no per-minute range. */
  airHistory: (range: Exclude<Range, 'live' | 'hour'>) => get<AirPoint[]>(`/air/history?range=${range}&tz=${zone()}`),
  energySettings: () => get<ElectricitySettings>('/energy/settings'),
  saveEnergySettings: (b: ElectricitySettings) => put<ElectricitySettings>('/energy/settings', b),

  notifications: () => get<{ items: Notification[]; unread: number }>('/notifications'),
  readNotification: (id: string) => post<Ok>(`/notifications/${id}/read`),
  readAll: () => post<Ok>('/notifications/read-all'),
  removeNotification: (id: string) => del<Ok>(`/notifications/${id}`),
  clearNotifications: () => del<Ok>('/notifications'),

  users: () => get<User[]>('/users'),
  /** Without `password` the server generates one and returns it once as `generated_password`; a kid's account needs one. */
  createUser: (b: { username: string; email: string; password?: string; kid: boolean; role: string; avatar?: string; all_rooms: boolean } & Grants) =>
    post<User>('/users', b),
  /** `reset_password` generates a new password, `reset_allowed` issues (or withdraws) a one-time reset code; both come back once. */
  updateUser: (id: string, b: Partial<{ email: string; role: string; password: string; kid: boolean; reset_password: boolean; reset_allowed: boolean; avatar: string; all_rooms: boolean } & Grants>) =>
    put<User>(`/users/${id}`, b),
  removeUser: (id: string) => del<Ok>(`/users/${id}`),
  /** Whether another account already uses the address; `userId` is the account being edited. */
  emailAvailable: (email: string, userId?: string) =>
    get<{ available: boolean }>(`/users/email/check?email=${encodeURIComponent(email)}${userId ? `&user_id=${userId}` : ''}`),
  /** The first free address for a username, at @domus.home. */
  suggestEmail: (username: string, userId?: string) =>
    get<{ email: string }>(`/users/email/suggest?username=${encodeURIComponent(username)}${userId ? `&user_id=${userId}` : ''}`),

  integrations: () => get<Integration[]>('/integrations'),
  removeAccount: (id: string) => del<Ok & { removed_devices: number }>(`/integrations/accounts/${id}`),
  tuyaQr: (user_code: string) =>
    post<{ qr_token: string; qr_content: string; expires_in: number }>('/integrations/tuya/qr', { user_code }),
  tuyaQrStatus: (token: string) =>
    get<{ status: 'waiting' | 'linked' | 'expired'; account_id?: string; name?: string }>(`/integrations/tuya/qr/${token}`),
  linkTapo: (b: { username: string; password: string }) => post<{ account_id: string }>('/integrations/tapo/accounts', b),
  linkXiaomi: (b: { username: string; password: string; region: string }) =>
    post<{ account_id?: string; verify_id?: string; via?: 'email' | 'phone' }>('/integrations/xiaomi/accounts', b),
  /** Integrations linked by a form the server describes (MQTT broker, Hue bridge). */
  linkForm: (id: string, b: Record<string, string>) => post<{ account_id: string }>(`/integrations/${id}/accounts`, b),
  verifyXiaomi: (b: { verify_id: string; code: string }) => post<{ account_id: string }>('/integrations/xiaomi/verify', b),
}

