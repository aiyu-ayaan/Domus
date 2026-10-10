import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { errorMessage, useToast } from './toast'
import type { Device, DeviceCommand } from './types'
import { useIsAdmin } from './auth'

export const keys = {
  devices: ['devices'] as const,
  rooms: ['rooms'] as const,
  groups: ['groups'] as const,
  discovered: (status: string) => ['discovered', status] as const,
  discoverySettings: ['discovery-settings'] as const,
  integrations: ['integrations'] as const,
  automations: ['automations'] as const,
  scenes: ['scenes'] as const,
  energy: ['energy'] as const,
  energyHistory: (range: string, device?: string) => ['energy', 'history', range, device ?? 'all'] as const,
  airHistory: (range: string) => ['air', 'history', range] as const,
  notifications: ['notifications'] as const,
  users: ['users'] as const,
  serverLinks: ['server-links'] as const,
}

export const useDevices = () => useQuery({ queryKey: keys.devices, queryFn: api.devices })
export const useRooms = () => useQuery({ queryKey: keys.rooms, queryFn: api.rooms })
export const useGroups = () => useQuery({ queryKey: keys.groups, queryFn: api.groups })
export const useScenes = () => useQuery({ queryKey: keys.scenes, queryFn: api.scenes })
export const useAutomations = () => useQuery({ queryKey: keys.automations, queryFn: api.automations })
export const useIntegrations = () => useQuery({ queryKey: keys.integrations, queryFn: api.integrations })
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: api.notifications })
export const useServerLinks = () => useQuery({ queryKey: keys.serverLinks, queryFn: api.serverLinks })
export const useEnergy = () =>
  useQuery({ queryKey: keys.energy, queryFn: api.energyOverview, refetchInterval: 5_000 })

export function useDiscovered(status: 'pending' | 'ignored' = 'pending') {
  const admin = useIsAdmin()
  return useQuery({ queryKey: keys.discovered(status), queryFn: () => api.discovered(status), enabled: admin })
}

/** Send a command with an optimistic update; the live stream confirms it. */
export function useCommand() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, cmd }: { id: string; cmd: DeviceCommand }) => api.command(id, cmd),
    onMutate: async ({ id, cmd }) => {
      await qc.cancelQueries({ queryKey: keys.devices })
      const prev = qc.getQueryData<Device[]>(keys.devices)
      qc.setQueryData<Device[]>(keys.devices, (list) =>
        list?.map((d) => (d.id === id ? { ...d, state: { ...d.state, ...stripRaw(cmd) } } : d)),
      )
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.devices, ctx.prev)
      toast.push({ tone: 'error', title: 'Command failed', message: errorMessage(e) })
    },
  })
}

const stripRaw = ({ raw: _raw, ...rest }: DeviceCommand) => rest
