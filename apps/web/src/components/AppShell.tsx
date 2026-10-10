import { useEffect, useMemo, useRef, useState } from 'react'
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
import { keys, useDevices, useDiscovered, useEnergy, useNotifications, useServerLinks } from '@/lib/queries'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/format'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { ThemeToggle } from './ui/ThemeToggle'

interface NavItem {
  to: string
  label: string
  icon: Icon
  admin?: boolean
}


function Mark({ collapsed }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 overflow-hidden">
      <img src="/favicon.svg" alt="Docus" className="h-6 w-6 shrink-0" />
      <span
        className={cn(
          'text-title font-semibold tracking-[-0.01em] transition-all duration-base whitespace-nowrap',
          collapsed ? 'opacity-0 w-0' : 'opacity-100',
        )}
      >
        Docus
      </span>
    </span>
  )
}

function Count({ n, label, active, tone = 'default' }: { n: number; label: string; active?: boolean; tone?: 'default' | 'danger' }) {
  if (!n) return null
  return (
    <span
      className={cn(
        'ml-auto rounded-full px-2 py-0.5 text-caption font-semibold tabular',
        tone === 'danger'
          ? 'bg-danger/20 text-danger'
          : active
            ? 'bg-on-primary-container/20 text-on-primary-container'
            : 'bg-raised text-fg',
      )}
      aria-label={`${n} ${label}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}

function Sidebar({ items, pending, unread, onNotifications }: { items: NavItem[]; pending: number; unread: number; onNotifications: () => void }) {
  const { user, signOut } = useAuth()
  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef<number | null>(null)

  const handleMouseEnter = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    setHovered(true)
  }

  const handleMouseLeave = () => {
    leaveTimer.current = window.setTimeout(() => {
      setHovered(false)
    }, 150)
  }

  useEffect(() => {
    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
    }
  }, [])

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'fixed left-3.5 top-1/2 -translate-y-1/2 z-nav hidden flex-col lg:flex',
        'h-auto max-h-[calc(100dvh-32px)] rounded-[32px] border border-border/80 bg-panel shadow-xl select-none',
        'transition-[width,box-shadow] duration-200 ease-std overflow-hidden p-2.5',
        hovered ? 'w-[240px] shadow-2xl' : 'w-[72px]',
      )}
    >
      <div className={cn('app-drag flex h-10 shrink-0 items-center overflow-hidden mb-1', hovered ? 'px-2' : 'justify-center px-0')}>
        <Mark collapsed={!hovered} />
      </div>

      <nav aria-label="Main" className="flex flex-col gap-1 w-full overflow-y-auto scrollbar-none py-1">
        {items.map((item) => (
          <div key={item.to} className="w-full flex justify-center">
            {hovered ? (
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex h-10 w-full items-center rounded-full px-3 my-0.5 transition-all duration-base text-body',
                    isActive
                      ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                      : 'text-muted hover:text-fg hover:bg-raised/70 font-medium',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <item.icon size={19} weight={isActive ? 'fill' : 'regular'} aria-hidden />
                    </span>
                    <span className="ml-3 truncate whitespace-nowrap">{item.label}</span>
                    {item.to === '/devices' && <Count n={pending} label="new devices found" active={isActive} />}
                  </>
                )}
              </NavLink>
            ) : (
              <NavLink
                to={item.to}
                end={item.to === '/'}
                title={item.label}
                className={({ isActive }) =>
                  cn(
                    'relative my-0.5 flex h-9 w-13 items-center justify-center rounded-full transition-all duration-base',
                    isActive
                      ? 'bg-primary-container text-on-primary-container shadow-sm'
                      : 'text-muted hover:text-fg hover:bg-raised/70',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon size={19} weight={isActive ? 'fill' : 'regular'} aria-hidden />
                    {item.to === '/devices' && pending > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-on ring-2 ring-panel" aria-label={`${pending} new devices`} />
                    )}
                  </>
                )}
              </NavLink>
            )}
          </div>
        ))}

        <div className="w-full flex justify-center mt-1 pt-1 border-t border-border/40">
          {hovered ? (
            <button
              onClick={onNotifications}
              className="flex h-10 w-full items-center rounded-full px-3 my-0.5 transition-all duration-base text-body text-muted hover:text-fg hover:bg-raised/70 font-medium cursor-pointer"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <Bell size={19} aria-hidden />
              </span>
              <span className="ml-3 truncate whitespace-nowrap">Notifications</span>
              <Count n={unread} label="unread" tone="danger" />
            </button>
          ) : (
            <button
              onClick={onNotifications}
              title={unread ? `Notifications (${unread} unread)` : 'Notifications'}
              className="relative my-0.5 flex h-9 w-13 items-center justify-center rounded-full text-muted hover:text-fg hover:bg-raised/70 cursor-pointer transition-all duration-base"
            >
              <Bell size={19} aria-hidden />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger ring-2 ring-panel" aria-label={`${unread} unread notifications`} />
              )}
            </button>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border/60 pt-2 mt-1 shrink-0 w-full">
        {hovered ? (
          <div className="flex items-center gap-2 rounded-full bg-raised/50 p-1 border border-border/50 anim-fade">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-caption font-bold text-on-primary-container uppercase shadow-sm">
              {user?.username.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-label font-medium leading-tight">{user?.username}</p>
              <p className="truncate text-caption capitalize text-subtle leading-tight">{user?.role}</p>
            </div>
            <ThemeToggle size="sm" className="rounded-full h-8 w-8" />
            <Button variant="ghost" size="sm" aria-label="Sign out" title="Sign out" className="rounded-full h-8 w-8" icon={<SignOut size={16} />} onClick={signOut} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <ThemeToggle size="sm" className="rounded-full h-9 w-9 bg-raised/40 hover:bg-raised" />
            <span
              title={`${user?.username} (${user?.role})`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-caption font-bold text-on-primary-container uppercase shadow-sm cursor-default"
            >
              {user?.username.slice(0, 1)}
            </span>
          </div>
        )}
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
  useServerLinks() // fetched on every launch so the desktop app follows address changes made elsewhere

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

      <header className="chrome app-drag sticky top-[var(--titlebar)] z-nav flex h-14 items-center justify-between border-b border-border px-4 pt-[env(safe-area-inset-top)] lg:hidden">
        <Mark />
        <div className="flex items-center gap-1.5">
          <ThemeToggle size="sm" />
          <Button variant="ghost" size="sm" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={() => setNotifOpen(true)} className="relative" icon={<Bell size={18} />}>
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />}
          </Button>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="pb-24 focus:outline-none lg:pb-12 lg:pl-[96px]">
        <div key={location.pathname.split('/')[1]} className="anim-enter mx-auto max-w-[1360px] px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>

      <TabBar items={items} onMore={() => setMoreOpen(true)} pending={pending.length} />
      <Notifications open={notifOpen} onClose={() => setNotifOpen(false)} />
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="-mx-2 flex flex-col gap-1">
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
          <div className="flex h-11 items-center justify-between rounded-md px-2 text-body">
            <span className="text-muted">Theme</span>
            <ThemeToggle size="sm" showLabel />
          </div>
          <button onClick={signOut} className="mt-2 flex h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-body text-danger hover:bg-danger/10">
            <SignOut size={18} aria-hidden /> Sign out
          </button>
        </div>
      </Sheet>
    </div>
  )
}
