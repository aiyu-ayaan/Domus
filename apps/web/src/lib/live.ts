import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, wsUrl } from './api'
import { useAuth } from './auth'
import { tOr } from './i18n'
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
            // Someone's access may have changed, and with it every list this user is shown.
            qc.invalidateQueries()
            // An administrator may have just reset this account's password: the app then gives way to the password change.
            api.me().then((me) => updateUserRef.current(me)).catch(() => {})
            break
          case 'device_state_changed': {
            const list = qc.getQueryData<Device[]>(keys.devices)
            if (list && !list.some((d) => d.id === ev.device_id)) qc.invalidateQueries({ queryKey: keys.devices })
            else
              qc.setQueryData<Device[]>(keys.devices, (l) =>
                l?.map((d) => (d.id === ev.device_id ? { ...d, state: ev.state, is_online: ev.is_online } : d)),
              )
            // The logbook is written from the same event: give it a moment before reading it back.
            setTimeout(() => qc.invalidateQueries({ queryKey: keys.logbook(ev.device_id) }), 800)
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
            push({
              tone: ev.level,
              title: tOr(ev.code && `${ev.code}.title`, ev.params, ev.title),
              message: tOr(ev.code, ev.params, ev.message),
            })
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
          case 'weather_changed':
            qc.setQueryData(keys.weather, ev.weather)
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
