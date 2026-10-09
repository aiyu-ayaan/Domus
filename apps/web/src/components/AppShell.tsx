import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  ChartLineUp,
  DotsThreeOutline,
  Door,
  GearSix,
  House,
  Lightning,
  PuzzlePiece,
  SignOut,
  SquaresFour,
  type Icon,
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth'
import { useLiveEvents } from '@/lib/live'
import { keys, useDiscovered, useNotifications } from '@/lib/queries'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { page, spring } from '@/lib/motion'
import { timeAgo } from '@/lib/format'
import { Sheet } from './Sheet'
import { IconButton } from './Button'

interface NavItem {
  to: string
  label: string
  icon: Icon
}

const nav: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/devices', label: 'Devices', icon: SquaresFour },
  { to: '/rooms', label: 'Rooms', icon: Door },
  { to: '/automations', label: 'Automations', icon: Lightning },
  { to: '/energy', label: 'Energy', icon: ChartLineUp },
  { to: '/plugins', label: 'Plugins', icon: PuzzlePiece },
  { to: '/settings', label: 'Settings', icon: GearSix },
]
// Bottom bar keeps to five destinations; the rest live under "More".
const primaryMobile = nav.slice(0, 4)
const moreMobile = nav.slice(4)

function Logo() {
  return (
    <div className="flex items-center gap-3 px-2">
      <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-2xl" />
      <span className="text-xl font-extrabold tracking-tight">Docus</span>
    </div>
  )
}

function Sidebar({ pending }: { pending: number }) {
  const { user, signOut } = useAuth()
  return (
    <aside className="glass fixed inset-y-4 left-4 z-nav hidden w-64 flex-col rounded-4xl p-4 lg:flex">
      <Logo />
      <nav aria-label="Main" className="mt-8 flex flex-1 flex-col gap-1">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'relative flex h-12 items-center gap-3 rounded-2xl px-4 font-semibold transition-colors duration-200',
                isActive ? 'text-fg' : 'text-muted hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={spring.default}
                    className="absolute inset-0 rounded-2xl bg-line/[0.1] shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]"
                  />
                )}
                <item.icon size={22} weight={isActive ? 'fill' : 'regular'} className="relative" aria-hidden />
                <span className="relative flex-1">{item.label}</span>
                {item.to === '/devices' && pending > 0 && (
                  <span className="relative rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">
                    {pending}
                    <span className="sr-only"> new devices found</span>
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-4 flex items-center gap-3 rounded-3xl bg-line/[0.05] p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/20 font-bold uppercase text-accent">
          {user?.username.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{user?.username}</p>
          <p className="text-xs capitalize text-muted">{user?.role}</p>
        </div>
        <IconButton label="Sign out" onClick={signOut}>
          <SignOut size={20} />
        </IconButton>
      </div>
    </aside>
  )
}

function TabBar({ onMore, pending }: { onMore: () => void; pending: number }) {
  const location = useLocation()
  const moreActive = moreMobile.some((m) => location.pathname.startsWith(m.to))
  return (
    <nav
      aria-label="Main"
      className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-nav flex h-[68px] items-stretch rounded-4xl px-2 lg:hidden"
    >
      {primaryMobile.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} className="relative flex flex-1 flex-col items-center justify-center gap-0.5">
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="tab-pill"
                  transition={spring.default}
                  className="absolute inset-x-1 inset-y-2 rounded-3xl bg-line/[0.1]"
                />
              )}
              <span className="relative">
                <item.icon size={24} weight={isActive ? 'fill' : 'regular'} className={isActive ? 'text-fg' : 'text-muted'} aria-hidden />
                {item.to === '/devices' && pending > 0 && (
                  <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-bg" aria-label={`${pending} new devices`} />
                )}
              </span>
              <span className={cn('relative text-[11px] font-semibold', isActive ? 'text-fg' : 'text-muted')}>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
      <button onClick={onMore} className="relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5" aria-haspopup="dialog">
        {moreActive && <span className="absolute inset-x-1 inset-y-2 rounded-3xl bg-line/[0.1]" />}
        <DotsThreeOutline size={24} weight={moreActive ? 'fill' : 'regular'} className={cn('relative', moreActive ? 'text-fg' : 'text-muted')} aria-hidden />
        <span className={cn('relative text-[11px] font-semibold', moreActive ? 'text-fg' : 'text-muted')}>More</span>
      </button>
    </nav>
  )
}

function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useNotifications()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const readAll = useMutation({
    mutationFn: api.readAll,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  })
  const tone = { info: 'bg-info', success: 'bg-power', warning: 'bg-warn', error: 'bg-danger' }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Notifications"
      footer={
        data?.unread ? (
          <button onClick={() => readAll.mutate()} className="h-11 cursor-pointer rounded-2xl px-4 font-semibold text-accent">
            Mark all as read
          </button>
        ) : undefined
      }
    >
      {!data?.items.length ? (
        <p className="py-10 text-center text-muted">You're all caught up.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
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
                className="flex w-full cursor-pointer gap-3 rounded-2xl p-3 text-left hover:bg-line/[0.05]"
              >
                <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : tone[n.level])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block font-semibold', n.is_read && 'text-muted')}>{n.title}</span>
                  <span className="block text-sm text-muted [overflow-wrap:anywhere]">{n.message}</span>
                  <span className="mt-1 block text-xs text-subtle">{timeAgo(n.created_at)}</span>
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
  useLiveEvents(!!user)
  const location = useLocation()
  const [notifOpen, setNotifOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const { data: notifications } = useNotifications()
  const { data: pending = [] } = useDiscovered('pending')
  const unread = notifications?.unread ?? 0
  const pendingCount = pending.length

  return (
    <div className="min-h-dvh">
      <div className="ambient" aria-hidden />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent">
        Skip to content
      </a>
      <Sidebar pending={pendingCount} />

      <div className="lg:pl-72">
      <header className="app-drag sticky top-0 z-nav mx-auto flex max-w-6xl items-center justify-end gap-2 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <div className="mr-auto lg:hidden">
          <Logo />
        </div>
        <div className="glass-thin flex items-center gap-1 rounded-3xl p-1">
          <IconButton label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={() => setNotifOpen(true)}>
            <Bell size={22} weight={unread ? 'fill' : 'regular'} />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white" aria-hidden>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </IconButton>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-32 pt-2 focus:outline-none sm:px-6 lg:pb-12">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={location.pathname.split('/')[1]} {...page}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      </div>

      <TabBar onMore={() => setMoreOpen(true)} pending={pendingCount} />
      <NotificationsSheet open={notifOpen} onClose={() => setNotifOpen(false)} />
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="flex flex-col gap-1">
          {moreMobile.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                cn('flex h-14 items-center gap-4 rounded-2xl px-4 font-semibold', isActive ? 'bg-line/10' : 'hover:bg-line/[0.05]')
              }
            >
              <item.icon size={24} aria-hidden />
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={signOut}
            className="mt-4 flex h-14 cursor-pointer items-center gap-4 rounded-2xl px-4 font-semibold text-danger hover:bg-danger/10"
          >
            <SignOut size={24} aria-hidden /> Sign out
          </button>
        </div>
      </Sheet>
    </div>
  )
}
