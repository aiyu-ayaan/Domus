import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  ChartLine,
  DotsThree,
  Door,
  Gear,
  House,
  Lightning,
  PlugsConnected,
  SignOut,
  SquaresFour,
  Wind,
  type Icon,
} from '@phosphor-icons/react'
import { useAuth, useIsAdmin } from '@/lib/auth'
import { useLiveEvents } from '@/lib/live'
import { keys, useDevices, useDiscovered, useEnergy, useNotifications } from '@/lib/queries'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/format'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'

interface NavItem {
  to: string
  label: string
  icon: Icon
  admin?: boolean
}


function Mark() {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="h-6 w-6" />
      <span className="text-title font-semibold tracking-[-0.01em]">Docus</span>
    </span>
  )
}

function Count({ n, label }: { n: number; label: string }) {
  if (!n) return null
  return (
    <span className="ml-auto rounded bg-raised px-1.5 text-caption font-medium text-fg tabular" aria-label={`${n} ${label}`}>
      {n > 99 ? '99+' : n}
    </span>
  )
}

function Sidebar({ items, pending, unread, onNotifications }: { items: NavItem[]; pending: number; unread: number; onNotifications: () => void }) {
  const { user, signOut } = useAuth()
  const linkCls = (active: boolean) =>
    cn(
      'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-body transition-colors duration-fast',
      active ? 'bg-raised font-medium text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg',
    )
  return (
    <aside className="fixed inset-y-0 left-0 z-nav hidden w-[232px] flex-col border-r border-border bg-panel lg:flex">
      <div className="app-drag flex h-14 items-center px-4">
        <Mark />
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => linkCls(isActive)}>
            {({ isActive }) => (
              <>
                <item.icon size={18} weight={isActive ? 'fill' : 'regular'} aria-hidden />
                {item.label}
                {item.to === '/devices' && <Count n={pending} label="new devices found" />}
              </>
            )}
          </NavLink>
        ))}
        <button onClick={onNotifications} className={cn(linkCls(false), 'mt-2 cursor-pointer')}>
          <Bell size={18} aria-hidden />
          Notifications
          <Count n={unread} label="unread" />
        </button>
      </nav>
      <div className="flex items-center gap-2.5 border-t border-border p-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-raised text-caption font-semibold uppercase">{user?.username.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-label font-medium">{user?.username}</p>
          <p className="text-caption capitalize text-subtle">{user?.role}</p>
        </div>
        <Button variant="ghost" size="sm" aria-label="Sign out" icon={<SignOut size={16} />} onClick={signOut} />
      </div>
    </aside>
  )
}

function TabBar({ items, onMore, pending }: { items: NavItem[]; onMore: () => void; pending: number }) {
  const location = useLocation()
  const primary = items.slice(0, 4)
  const moreActive = items.slice(4).some((m) => location.pathname.startsWith(m.to))
  const cls = (active: boolean) => cn('relative flex flex-1 flex-col items-center justify-center gap-0.5 text-caption', active ? 'text-fg' : 'text-subtle')
  return (
    <nav aria-label="Main" className="chrome fixed inset-x-0 bottom-0 z-nav flex h-14 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ height: 'calc(56px + env(safe-area-inset-bottom))' }}>
      {primary.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => cls(isActive)}>
          {({ isActive }) => (
            <>
              <span className="relative">
                <item.icon size={20} weight={isActive ? 'fill' : 'regular'} aria-hidden />
                {item.to === '/devices' && pending > 0 && <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-on" aria-label={`${pending} new devices`} />}
              </span>
              {item.label}
            </>
          )}
        </NavLink>
      ))}
      <button onClick={onMore} className={cn(cls(moreActive), 'cursor-pointer')} aria-haspopup="dialog">
        <DotsThree size={20} weight="bold" aria-hidden />
        More
      </button>
    </nav>
  )
}

function Notifications({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useNotifications()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const readAll = useMutation({ mutationFn: api.readAll, onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }) })
  const tone = { info: 'bg-info', success: 'bg-on', warning: 'bg-warn', error: 'bg-danger' }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Notifications"
      footer={data?.unread ? <Button variant="ghost" size="sm" onClick={() => readAll.mutate()}>Mark all as read</Button> : undefined}
    >
      {!data?.items.length ? (
        <p className="py-10 text-center text-muted">No notifications.</p>
      ) : (
        <ul className="-mx-5 divide-y divide-border">
          {data.items.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => {
                  if (!n.is_read) api.readNotification(n.id).then(() => qc.invalidateQueries({ queryKey: keys.notifications }))
                  if (n.link) {
                    navigate(n.link)
                    onClose()
                  }
                }}
                className="flex w-full cursor-pointer gap-3 px-5 py-3 text-left hover:bg-raised/60"
              >
                <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : tone[n.level])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-body font-medium', n.is_read && 'text-muted')}>{n.title}</span>
                  <span className="block text-label text-muted [overflow-wrap:anywhere]">{n.message}</span>
                  <span className="mt-0.5 block text-caption text-subtle">{timeAgo(n.created_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

export function AppShell() {
  const { user, signOut } = useAuth()
  const admin = useIsAdmin()
  useLiveEvents(!!user)
  const location = useLocation()
  const [notifOpen, setNotifOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const { data: notifications } = useNotifications()
  const { data: pending = [] } = useDiscovered('pending')
  const { data: devices = [] } = useDevices()
  const { data: energy } = useEnergy()

  const hasEnergy =
    devices.some((d) => d.state.current_power_watts != null || d.state.today_energy_kwh != null) ||
    Boolean(energy?.devices && energy.devices.length > 0) ||
    Boolean(energy?.cycle_kwh && energy.cycle_kwh > 0)

  const hasAirQuality = devices.some(
    (d) => d.device_type === 'air_purifier' || d.state.air_quality_pm25 != null,
  )

  const items = useMemo(() => {
    return [
      { to: '/', label: 'Overview', icon: House },
      { to: '/devices', label: 'Devices', icon: SquaresFour },
      { to: '/rooms', label: 'Rooms', icon: Door },
      { to: '/automations', label: 'Automations', icon: Lightning },
      ...(hasAirQuality ? [{ to: '/air-quality', label: 'Air quality', icon: Wind }] : []),
      ...(hasEnergy ? [{ to: '/energy', label: 'Energy', icon: ChartLine }] : []),
      ...(admin ? [{ to: '/plugins', label: 'Integrations', icon: PlugsConnected, admin: true }] : []),
      { to: '/settings', label: 'Settings', icon: Gear },
    ]
  }, [hasAirQuality, hasEnergy, admin])
  const unread = notifications?.unread ?? 0

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-toast focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary">
        Skip to content
      </a>
      <Sidebar items={items} pending={pending.length} unread={unread} onNotifications={() => setNotifOpen(true)} />

      <header className="chrome app-drag sticky top-0 z-nav flex h-14 items-center justify-between border-b border-border px-4 pt-[env(safe-area-inset-top)] lg:hidden">
        <Mark />
        <Button variant="ghost" size="sm" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={() => setNotifOpen(true)} className="relative" icon={<Bell size={18} />}>
          {unread > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />}
        </Button>
      </header>

      <main id="main" tabIndex={-1} className="pb-24 focus:outline-none lg:pb-12 lg:pl-[232px]">
        <div key={location.pathname.split('/')[1]} className="anim-enter mx-auto max-w-[1360px] px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>

      <TabBar items={items} onMore={() => setMoreOpen(true)} pending={pending.length} />
      <Notifications open={notifOpen} onClose={() => setNotifOpen(false)} />
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="-mx-2 flex flex-col">
          {items.slice(4).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) => cn('flex h-11 items-center gap-3 rounded-md px-2 text-body', isActive ? 'bg-raised font-medium' : 'hover:bg-raised/60')}
            >
              <item.icon size={18} aria-hidden />
              {item.label}
            </NavLink>
          ))}
          <button onClick={signOut} className="mt-2 flex h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-body text-danger hover:bg-danger/10">
            <SignOut size={18} aria-hidden /> Sign out
          </button>
        </div>
      </Sheet>
    </div>
  )
}
