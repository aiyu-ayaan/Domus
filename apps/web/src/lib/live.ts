import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { wsUrl } from './api'
import { useAuth } from './auth'
import { keys } from './queries'
import { useToast } from './toast'
import type { Device, LiveEvent } from './types'

/** Keeps the query cache in sync with the server's event stream. */
export function useLiveEvents(enabled: boolean) {
  const qc = useQueryClient()
  const { push } = useToast()
  const { user, updateUser } = useAuth()
  const userRef = useRef(user)
  userRef.current = user
  const updateUserRef = useRef(updateUser)
  updateUserRef.current = updateUser

  useEffect(() => {
    if (!enabled) return
    let ws: WebSocket | null = null
    let retry = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let closed = false

    const connect = () => {
      ws = new WebSocket(wsUrl())
      ws.onopen = () => {
        if (retry > 0) qc.invalidateQueries()
        retry = 0
      }
      ws.onmessage = (msg) => {
        let ev: LiveEvent
        try {
          ev = JSON.parse(msg.data)
        } catch {
          return
        }
        switch (ev.type) {
          case 'user_updated': {
            const currentMe = userRef.current
            if (currentMe && ev.user_id === currentMe.id) {
              updateUserRef.current({
                ...currentMe,
                username: ev.username || currentMe.username,
                role: (ev.role as any) || currentMe.role,
                avatar: ev.avatar ?? currentMe.avatar,
              })
            }
            qc.invalidateQueries({ queryKey: keys.users })
            break
          }
          case 'users_changed':
            qc.invalidateQueries({ queryKey: keys.users })
            break
          case 'device_state_changed': {
            const list = qc.getQueryData<Device[]>(keys.devices)
            if (list && !list.some((d) => d.id === ev.device_id)) qc.invalidateQueries({ queryKey: keys.devices })
            else
              qc.setQueryData<Device[]>(keys.devices, (l) =>
                l?.map((d) => (d.id === ev.device_id ? { ...d, state: ev.state, is_online: ev.is_online } : d)),
              )
            break
          }
          case 'device_added':
          case 'device_updated':
          case 'device_removed':
            // Rooms, groups, energy and integration cards all count devices.
            for (const k of [keys.devices, keys.rooms, keys.groups, keys.energy, keys.integrations, ['discovered']])
              qc.invalidateQueries({ queryKey: k })
            break
          case 'device_discovered':
            qc.invalidateQueries({ queryKey: ['discovered'] })
            break
          case 'discovery_finished':
            qc.invalidateQueries({ queryKey: ['discovered'] })
            qc.invalidateQueries({ queryKey: keys.integrations })
            break
          case 'notification':
            qc.invalidateQueries({ queryKey: keys.notifications })
            push({ tone: ev.level, title: ev.title, message: ev.message })
            break
          case 'notifications_changed':
            qc.invalidateQueries({ queryKey: keys.notifications })
            break
          case 'integrations_changed':
            qc.invalidateQueries({ queryKey: keys.integrations })
            break
          case 'rooms_changed':
            qc.invalidateQueries({ queryKey: keys.rooms })
            break
          case 'automation_triggered':
            qc.invalidateQueries({ queryKey: keys.automations })
            break
          case 'resync':
            qc.invalidateQueries()
            break
        }
      }
      ws.onclose = () => {
        if (closed) return
        retry = Math.min(retry + 1, 6)
        timer = setTimeout(connect, 500 * 2 ** retry)
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(timer)
      ws?.close()
    }
  }, [enabled, qc, push])
}
