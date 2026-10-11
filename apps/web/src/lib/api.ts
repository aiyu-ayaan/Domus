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
  User,
} from './types'

import { getStorageKey, type AppFlavor } from './flavor'

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
    info(): Promise<{ version: string; channel: UpdateChannel; selfInstall: boolean } | null>
    check(): Promise<{ version: string } | null>
    /** The reason it failed, or '' (the app restarts, or the browser has the download). */
    install(): Promise<string>
    setChannel(channel: UpdateChannel): Promise<void>
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
  ) {
    super(message)
  }
}

let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
    throw new ApiError('Cannot reach the Domus server. Check that it is running.', 0)
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.()
    throw new ApiError(data?.error?.message ?? `Request failed (${res.status})`, res.status)
  }
  return data as T
}

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
  saveServerLinks: (b: { local_url: string; remote_url: string }) =>
    put<ServerLinks>('/server/links', b).then((links) => {
      desktop?.saveLinks(links)
      return links
    }),
  changePassword: (b: { current_password: string; new_password: string }) => post<Ok>('/auth/password', b),

  devices: () => get<Device[]>('/devices'),
  device: (id: string) => get<Device>(`/devices/${id}`),
  updateDevice: (id: string, b: { name?: string; room_id?: string | null; icon?: string | null }) =>
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
  energyHistory: (range: 'day' | 'week' | 'month', deviceId?: string) =>
    get<EnergyPoint[]>(`/energy/history?range=${range}${deviceId ? `&device_id=${deviceId}` : ''}`),
  airHistory: (range: 'day' | 'week' | 'month') => get<AirPoint[]>(`/air/history?range=${range}`),
  energySettings: () => get<ElectricitySettings>('/energy/settings'),
  saveEnergySettings: (b: ElectricitySettings) => put<ElectricitySettings>('/energy/settings', b),

  notifications: () => get<{ items: Notification[]; unread: number }>('/notifications'),
  readNotification: (id: string) => post<Ok>(`/notifications/${id}/read`),
  readAll: () => post<Ok>('/notifications/read-all'),
  removeNotification: (id: string) => del<Ok>(`/notifications/${id}`),
  clearNotifications: () => del<Ok>('/notifications'),

  users: () => get<User[]>('/users'),
  createUser: (b: { username: string; email: string; password: string; role: string; avatar?: string; all_rooms: boolean } & Grants) =>
    post<User>('/users', b),
  updateUser: (id: string, b: Partial<{ email: string; role: string; password: string; avatar: string; all_rooms: boolean } & Grants>) =>
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

