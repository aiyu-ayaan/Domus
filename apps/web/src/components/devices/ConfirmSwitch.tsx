import { useEffect, useState, type ReactNode } from 'react'
import { Confirm } from '@/components/ui/Sheet'
import { setConfirmHandler } from '@/lib/api'
import type { Device } from '@/lib/types'

/**
 * "Ask before switching": runs `run` straight away, unless one of `devices` has the option on
 * (set per device, kept on the server so it is the same on every app). Then the person is asked first.
 * Put `dialog` once in the component's output.
 */
export function useConfirmSwitch(): { ask: (devices: Device[], on: boolean, run: () => void) => void; dialog: ReactNode } {
  const [pending, setPending] = useState<{ names: string[]; on: boolean; run: () => void } | null>(null)
  const ask = (devices: Device[], on: boolean, run: () => void) => {
    const guarded = devices.filter((d) => d.confirm_changes)
    if (guarded.length) setPending({ names: guarded.map((d) => d.name), on, run })
    else run()
  }
  const close = () => setPending(null)
  return {
    ask,
    dialog: (
      <Confirm
        open={!!pending}
        onClose={close}
        onConfirm={() => {
          pending?.run()
          close()
        }}
        title={pending ? `Turn ${pending.names.length === 1 ? pending.names[0] : `${pending.names.length} devices`} ${pending.on ? 'on' : 'off'}?` : ''}
        message={pending && (pending.names.length === 1 ? 'You asked to be warned before this device is switched.' : `You asked to be warned before switching ${pending.names.join(', ')}.`)}
        confirmLabel={pending?.on ? 'Turn on' : 'Turn off'}
        tone="neutral"
      />
    ),
  }
}

/**
 * Answers the server when a group, scene or automation would switch devices that ask first: shows who,
 * and the request goes on only after a yes. Mounted once, next to the toasts.
 */
export function ConfirmHost() {
  const [asking, setAsking] = useState<{ names: string[]; answer: (yes: boolean) => void } | null>(null)
  useEffect(() => {
    setConfirmHandler((names) => new Promise<boolean>((answer) => setAsking({ names, answer })))
    return () => setConfirmHandler(null)
  }, [])
  const close = (yes: boolean) => {
    asking?.answer(yes)
    setAsking(null)
  }
  const names = asking?.names ?? []
  return (
    <Confirm
      open={!!asking}
      onClose={() => close(false)}
      onConfirm={() => close(true)}
      title={names.length === 1 ? `Switch ${names[0]}?` : `Switch ${names.length} devices?`}
      message={`This includes ${names.join(', ')}, which ${names.length === 1 ? 'asks' : 'ask'} before switching. Switching ${names.length === 1 ? 'it' : 'them'} can cut power to whatever is connected.`}
      confirmLabel="Switch"
      tone="neutral"
    />
  )
}
