import { t } from '@/lib/i18n'
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
        title={pending ? t('confirmSwitch.turnTitle', { count: pending.names.length, name: pending.names[0], state: t(pending.on ? 'confirmSwitch.state.on' : 'confirmSwitch.state.off') }) : ''}
        message={pending && (pending.names.length === 1 ? t('confirmSwitch.warnedOne') : t('confirmSwitch.warnedMany', { names: pending.names.join(', ') }))}
        confirmLabel={t(pending?.on ? 'confirmSwitch.turnOn' : 'confirmSwitch.turnOff')}
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
      title={t('confirmSwitch.switchTitle', { count: names.length, name: names[0] })}
      message={t('confirmSwitch.includes', { count: names.length, names: names.join(', ') })}
      confirmLabel={t('confirmSwitch.switch')}
      tone="neutral"
    />
  )
}
