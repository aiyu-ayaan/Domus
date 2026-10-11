import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Monitor, StopCircle } from '@phosphor-icons/react'
import { sceneSyncUrl } from '@/lib/api'
import { keys } from '@/lib/queries'
import { useToast } from '@/lib/toast'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import type { Scene, ScreenSyncConfig } from '@/lib/types'

/** Defaults mirror `ScreenSyncConfig::default()` on the server. */
export const SCREEN_SYNC_DEFAULTS: ScreenSyncConfig = {
  device_ids: [],
  group_ids: [],
  style: 'vivid',
  region: 'full',
  follow_brightness: true,
  min_brightness: 10,
  max_brightness: 100,
  smoothing: 40,
  fps: 10,
  restore_on_stop: true,
}

export const screenSyncConfig = (scene: Scene): ScreenSyncConfig => ({ ...SCREEN_SYNC_DEFAULTS, ...scene.config })

export const isScreenSyncSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia

type Status = 'idle' | 'starting' | 'live' | 'reconnecting'

interface SyncDevice {
  id: string
  name: string
  interval_ms: number
}

export interface ScreenSyncState {
  status: Status
  scene: Scene | null
  color: string | null
  brightness: number | null
  devices: SyncDevice[]
  skipped: { id: string; name: string; reason: string }[]
  deviceErrors: Record<string, string>
}

const IDLE: ScreenSyncState = { status: 'idle', scene: null, color: null, brightness: null, devices: [], skipped: [], deviceErrors: {} }

interface Ctx {
  state: ScreenSyncState
  start: (scene: Scene) => Promise<void>
  stop: () => void
  isRunning: (sceneId: string) => boolean
}

const ScreenSyncContext = createContext<Ctx | null>(null)

// MediaStreamTrackProcessor (Chromium/Electron) is not in the TS DOM lib yet.
type TrackProcessorCtor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> }

const MAX_RECONNECTS = 5
const FALLBACK_W = 64
const FALLBACK_H = 36

/**
 * Owns the one live Screen Sync session of this window. Lives above the router
 * so syncing continues while the user moves around the app.
 *
 * Pipeline: getDisplayMedia → worker (sample + colour extraction) → WebSocket →
 * server fans out to each light at the rate it can handle.
 */
export function ScreenSyncProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [state, setState] = useState<ScreenSyncState>(IDLE)

  const stream = useRef<MediaStream | null>(null)
  const worker = useRef<Worker | null>(null)
  const ws = useRef<WebSocket | null>(null)
  const fallback = useRef<{ timer: number; video: HTMLVideoElement } | null>(null)
  const lastFrame = useRef<string | null>(null)
  const active = useRef(false)
  const attempts = useRef(0)
  const reported = useRef(new Set<string>())
  const lastUi = useRef(0)

  const teardown = useCallback(() => {
    active.current = false
    const socket = ws.current
    ws.current = null
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000, 'stopped')
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    if (worker.current) {
      worker.current.postMessage({ type: 'stop' })
      worker.current.terminate()
      worker.current = null
    }
    if (fallback.current) {
      clearInterval(fallback.current.timer)
      fallback.current.video.srcObject = null
      fallback.current = null
    }
    lastFrame.current = null
    reported.current.clear()
  }, [])

  const stop = useCallback(() => {
    if (!active.current && !stream.current) return
    teardown()
    setState(IDLE)
    // The server restores the lights after the socket closes; let lists catch up.
    setTimeout(() => {
      qc.invalidateQueries({ queryKey: keys.scenes })
      qc.invalidateQueries({ queryKey: keys.devices })
    }, 800)
  }, [qc, teardown])

  const connect = useCallback(
    (scene: Scene) => {
      const socket = new WebSocket(sceneSyncUrl(scene.id))
      ws.current = socket
      let fatal = false
      socket.onopen = () => {
        if (lastFrame.current) socket.send(lastFrame.current)
      }
      socket.onmessage = (e) => {
        let m: { type: string; [k: string]: unknown }
        try {
          m = JSON.parse(e.data)
        } catch {
          return
        }
        if (m.type === 'ready') {
          attempts.current = 0
          const skipped = (m.skipped as ScreenSyncState['skipped']) ?? []
          setState((s) => ({ ...s, status: 'live', devices: (m.devices as SyncDevice[]) ?? [], skipped }))
          qc.invalidateQueries({ queryKey: keys.scenes })
          if (skipped.length) {
            toast.push({ tone: 'warning', title: t('screenSync.someSkipped'), message: skipped.map((x) => `${x.name} (${x.reason})`).join(', ') })
          }
        } else if (m.type === 'device_error') {
          const id = String(m.device_id)
          const message = String(m.message)
          setState((s) => ({ ...s, deviceErrors: { ...s.deviceErrors, [id]: message } }))
          if (!reported.current.has(id)) {
            reported.current.add(id)
            const name = scene.name
            toast.push({ tone: 'warning', title: t('screenSync.notKeepingUp', { name }), message })
          }
        } else if (m.type === 'error') {
          fatal = true
          toast.push({ tone: 'error', title: t('screenSync.startFailed'), message: String(m.message) })
          stop()
        } else if (m.type === 'stopped') {
          fatal = true
          toast.push({ tone: 'info', title: t('screenSync.sceneStopped', { name: scene.name }) })
          stop()
        }
      }
      socket.onclose = () => {
        if (!active.current || fatal || ws.current !== socket) return
        if (attempts.current >= MAX_RECONNECTS) {
          toast.push({ tone: 'error', title: t('screenSync.lostConnection'), message: t('screenSync.stopped') })
          stop()
          return
        }
        const delay = 500 * 2 ** attempts.current++
        setState((s) => ({ ...s, status: 'reconnecting' }))
        setTimeout(() => active.current && ws.current === socket && connect(scene), delay)
      }
    },
    [qc, stop, toast],
  )

  const start = useCallback(
    async (scene: Scene) => {
      if (!isScreenSyncSupported()) {
        toast.push({ tone: 'error', title: t('screenSync.notAvailable'), message: t('screenSync.notAvailableHint') })
        return
      }
      if (active.current || stream.current) stop()
      const cfg = screenSyncConfig(scene)
      setState({ ...IDLE, status: 'starting', scene })

      let media: MediaStream
      try {
        // Must be the first await so it still counts as a user gesture.
        media = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: cfg.fps, max: Math.max(cfg.fps, 15) }, width: { max: 1280 }, height: { max: 720 } },
          audio: false,
          // Chromium hints: offer whole screens first and never the Domus tab itself.
          ...({ selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include' } as object),
        })
      } catch (e) {
        setState(IDLE)
        const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')
        if (!denied) toast.push({ tone: 'error', title: t('screenSync.shareFailed'), message: e instanceof Error ? e.message : undefined })
        return
      }

      stream.current = media
      active.current = true
      attempts.current = 0
      const track = media.getVideoTracks()[0]
      // The browser's own "Stop sharing" button ends the session too.
      track.addEventListener('ended', () => stop())

      const w = new Worker(new URL('./screenSync.worker.ts', import.meta.url), { type: 'module' })
      worker.current = w
      w.postMessage({ type: 'config', config: cfg })
      w.onmessage = (e: MessageEvent<{ type: string; hex?: string; brightness?: number | null }>) => {
        const m = e.data
        if (m.type === 'ended') return stop()
        if (m.type !== 'color' || !m.hex) return
        const frame = JSON.stringify(m.brightness != null ? { c: m.hex, b: m.brightness } : { c: m.hex })
        lastFrame.current = frame
        if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(frame)
        // Repaint the preview at most ~8×/s; it does not need every frame.
        const now = performance.now()
        if (now - lastUi.current > 120) {
          lastUi.current = now
          setState((s) => (s.color === m.hex && s.brightness === m.brightness ? s : { ...s, color: m.hex!, brightness: m.brightness ?? null }))
        }
      }

      const Processor = (window as unknown as { MediaStreamTrackProcessor?: TrackProcessorCtor }).MediaStreamTrackProcessor
      if (Processor) {
        const { readable } = new Processor({ track })
        w.postMessage({ type: 'stream', readable }, [readable as unknown as Transferable])
      } else {
        // Fallback: sample a hidden <video> on the main thread and hand pixels to the worker.
        const video = document.createElement('video')
        video.muted = true
        video.playsInline = true
        video.srcObject = media
        void video.play().catch(() => undefined)
        const canvas = document.createElement('canvas')
        canvas.width = FALLBACK_W
        canvas.height = FALLBACK_H
        const c2d = canvas.getContext('2d', { willReadFrequently: true })!
        const timer = window.setInterval(() => {
          if (video.readyState < 2) return
          c2d.drawImage(video, 0, 0, FALLBACK_W, FALLBACK_H)
          const data = c2d.getImageData(0, 0, FALLBACK_W, FALLBACK_H).data
          w.postMessage({ type: 'pixels', data, width: FALLBACK_W, height: FALLBACK_H }, [data.buffer])
        }, 1000 / cfg.fps)
        fallback.current = { timer, video }
      }

      connect(scene)
    },
    [connect, stop, toast],
  )

  // Leaving the app (logout, reload) ends sharing cleanly.
  useEffect(() => teardown, [teardown])

  const value = useMemo<Ctx>(
    () => ({ state, start, stop, isRunning: (id) => state.status !== 'idle' && state.scene?.id === id }),
    [state, start, stop],
  )
  return (
    <ScreenSyncContext.Provider value={value}>
      {children}
      <ScreenSyncPill />
    </ScreenSyncContext.Provider>
  )
}

export function useScreenSync() {
  const ctx = useContext(ScreenSyncContext)
  if (!ctx) throw new Error('useScreenSync outside ScreenSyncProvider')
  return ctx
}

/** Floating live indicator with the colour being sent, visible on every page while syncing. */
function ScreenSyncPill() {
  const { state, stop } = useContext(ScreenSyncContext)!
  if (state.status === 'idle' || !state.scene) return null
  const color = state.color ?? '#9ca3af'
  const n = state.devices.length
  const failing = Object.keys(state.deviceErrors).length
  const lights = t('automations.sync.lights', { count: n })
  const label =
    state.status === 'starting'
      ? t('screenSync.chooseScreen')
      : state.status === 'reconnecting'
        ? t('screenSync.reconnecting')
        : failing && state.brightness != null
          ? t('screenSync.pill.liveLaggingBrightness', { lights, failing, brightness: state.brightness })
          : failing
            ? t('screenSync.pill.liveLagging', { lights, failing })
            : state.brightness != null
              ? t('screenSync.pill.liveBrightness', { lights, brightness: state.brightness })
              : t('screenSync.pill.live', { lights })
  return (
    <div
      role="status"
      aria-live="polite"
      className="anim-enter fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-4 z-toast flex items-center gap-3 rounded-full border border-border bg-panel/75 py-1.5 pl-1.5 pr-2 shadow-lg backdrop-blur-xl backdrop-saturate-150 lg:bottom-6 lg:right-6"
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden>
        <span
          className={cn('absolute inset-0 rounded-full blur-md transition-colors duration-300', state.status === 'live' && 'animate-pulse')}
          style={{ backgroundColor: color, opacity: 0.7 }}
        />
        <span
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/40 transition-colors duration-300"
          style={{ backgroundColor: color, boxShadow: `inset 0 1px 6px rgb(255 255 255 / 0.45), 0 0 18px ${color}` }}
        >
          <Monitor size={16} weight="bold" className="text-white mix-blend-difference" />
        </span>
      </span>
      <span className="min-w-0">
        <span className="block max-w-[44vw] truncate text-label font-medium sm:max-w-[240px]">{state.scene.name}</span>
        <span className="block text-caption text-muted tabular">{label}</span>
      </span>
      <button
        type="button"
        onClick={stop}
        className="ml-1 flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-raised px-3 text-label font-medium transition-colors hover:bg-danger hover:text-white"
      >
        <StopCircle size={16} weight="fill" />
        {t('overview.stop')}
      </button>
    </div>
  )
}
