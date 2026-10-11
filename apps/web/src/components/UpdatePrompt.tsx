import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { desktop } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { Button } from './ui/Button'

/** The desktop app's own update: what it found, the install and the download's progress (0..1, null when idle). */
export function useDesktopUpdate() {
  const toast = useToast()
  const updates = desktop?.updates
  const { data: info } = useQuery({ queryKey: ['desktop-update-info'], queryFn: () => updates!.info(), enabled: !!updates })
  const check = useQuery({ queryKey: ['desktop-update', info?.channel], queryFn: () => updates!.check(), enabled: !!info, retry: false })
  const [progress, setProgress] = useState<number | null>(null)
  // The app reports to every listener, so Settings and the prompt show the same download.
  useEffect(() => updates?.onProgress?.(setProgress), [updates])
  const install = useMutation({
    mutationFn: () => updates!.install(),
    onSuccess: (failed) => failed && toast.push({ tone: 'error', title: 'Update failed', message: failed }),
  })
  return { updates, info, check, install, progress, busy: install.isPending || progress !== null }
}

export function UpdateProgress({ value }: { value: number }) {
  const percent = Math.round(value * 100)
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 rounded-full bg-raised" role="progressbar" aria-label="Downloading update" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-fg/70 transition-[width] duration-fast" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-9 text-right text-label tabular text-muted">{percent}%</span>
    </div>
  )
}

/** Desktop only: offers a new release once at start. "Later" is remembered for that version. */
export function UpdatePrompt() {
  const { updates, info, check, install, progress, busy } = useDesktopUpdate()
  const [closed, setClosed] = useState(false)
  const found = check.data
  const open = !!found && !!info && !closed && found.version !== info.skipped
  useEffect(() => {
    if (!open || busy) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setClosed(true)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy])
  if (!open) return null
  const title = `Domus ${found.version} is available`
  return createPortal(
    <div className="fixed inset-0 top-[var(--titlebar)] z-sheet flex items-center justify-center p-4">
      <div className="anim-fade absolute inset-0 bg-black/50" aria-hidden />
      <div role="alertdialog" aria-modal="true" aria-label={title} className="anim-enter relative w-full max-w-sm rounded-lg border border-border bg-panel p-5" style={{ boxShadow: 'var(--overlay-shadow)' }}>
        <h2 className="text-title font-semibold">{title}</h2>
        <p className="mt-2 text-body text-muted">
          You have {info.version}. {info.selfInstall ? 'Domus restarts when the download is done.' : 'The installer opens when the download is done.'}
        </p>
        {busy && (
          <div className="mt-4">
            <UpdateProgress value={progress ?? 0} />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              updates?.skip?.()
              setClosed(true)
            }}
          >
            Later
          </Button>
          <Button variant="primary" autoFocus loading={busy} onClick={() => install.mutate(undefined, { onSettled: () => setClosed(true) })}>
            {info.selfInstall ? 'Update and restart' : 'Download'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
