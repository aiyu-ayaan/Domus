import { useEffect, useRef } from 'react'
import { desktop } from '@/lib/api'
import { useCanControl } from '@/lib/auth'
import { airQuality } from '@/lib/format'
import { t } from '@/lib/i18n'
import { useCommand, useDevices } from '@/lib/queries'

/**
 * Keeps the desktop app's tray menu current: the worst PM2.5 in the home and a power switch per air purifier.
 * The window stays loaded while hidden, so this keeps running with the tray as the only thing on screen.
 */
export function useDesktopTray() {
  const tray = desktop?.tray
  const { data: devices = [] } = useDevices()
  const command = useCommand()
  const control = useCanControl()
  const pm = devices.flatMap((d) => (d.is_online && d.state.air_quality_pm25 != null ? [d.state.air_quality_pm25] : []))
  const worst = pm.length ? Math.round(Math.max(...pm)) : null
  // Native menus get plain text: no direction marks from formatNumber.
  const state = {
    heading: t('air.airPurifiers'),
    title: worst != null ? `${worst} µg/m³` : '',
    summary: worst != null ? t('tray.summary', { value: worst, label: airQuality(worst)!.label }) : '',
    devices: devices
      .filter((d) => d.device_type === 'air_purifier')
      .map((d) => ({
        id: d.id,
        label: !d.is_online
          ? t('tray.deviceOffline', { name: d.name })
          : d.state.air_quality_pm25 != null
            ? t('tray.deviceReading', { name: d.name, value: Math.round(d.state.air_quality_pm25) })
            : d.name,
        on: Boolean(d.is_online && d.state.is_on),
        enabled: d.is_online && control && d.can_control,
      })),
  }
  const sent = JSON.stringify(state)
  useEffect(() => tray?.update(JSON.parse(sent)), [tray, sent])
  // Signed out: the menu forgets the home.
  useEffect(() => () => tray?.update(null), [tray])

  const latest = useRef(devices)
  latest.current = devices
  useEffect(
    () =>
      tray?.onToggle((id, on) => {
        const d = latest.current.find((x) => x.id === id)
        if (!d) return
        // Its "ask before switching" question is asked in the window.
        if (d.confirm_changes) tray.show()
        command.mutate({ id, cmd: { is_on: on } })
      }),
    // `command.mutate` is stable, so one listener lasts.
    [tray],
  )
}
