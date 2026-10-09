import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { wsUrl } from './api'
import { keys } from './queries'
import { useToast } from './toast'
import type { Device, LiveEvent } from './types'

/** Keeps the query cache in sync with the server's event stream. */
export function useLiveEvents(enabled: boolean) {
  const qc = useQueryClient()
  const { push } = useToast()

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
          case 'device_state_changed':
            qc.setQueryData<Device[]>(keys.devices, (list) =>
              list?.map((d) => (d.id === ev.device_id ? { ...d, state: ev.state, is_online: ev.is_online } : d)),
            )
            break
          case 'device_added':
          case 'device_updated':
          case 'device_removed':
            qc.invalidateQueries({ queryKey: keys.devices })
            qc.invalidateQueries({ queryKey: ['discovered'] })
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
