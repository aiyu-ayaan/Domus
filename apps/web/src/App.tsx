import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { AuthScreen } from '@/features/auth/AuthScreen'
import { DashboardView } from '@/features/dashboard/DashboardView'
import { useAuth, useIsAdmin } from '@/lib/auth'
import { Skeleton } from '@/components/Layout'

// Secondary screens are split out to keep the first load small.
const DevicesView = lazy(() => import('@/features/devices/DevicesView').then((m) => ({ default: m.DevicesView })))
const RoomsView = lazy(() => import('@/features/rooms/RoomsView').then((m) => ({ default: m.RoomsView })))
const RoomDetailView = lazy(() => import('@/features/rooms/RoomsView').then((m) => ({ default: m.RoomDetailView })))
const AutomationsView = lazy(() => import('@/features/automations/AutomationsView').then((m) => ({ default: m.AutomationsView })))
const EnergyView = lazy(() => import('@/features/energy/EnergyView').then((m) => ({ default: m.EnergyView })))
const PluginsView = lazy(() => import('@/features/plugins/PluginsView').then((m) => ({ default: m.PluginsView })))
const SettingsView = lazy(() => import('@/features/settings/SettingsView').then((m) => ({ default: m.SettingsView })))

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="ambient" aria-hidden />
      <img src="/favicon.svg" alt="Loading Docus" className="h-16 w-16 animate-pulse rounded-3xl motion-reduce:animate-none" />
    </div>
  )
}

function AdminOnly({ children }: { children: JSX.Element }) {
  return useIsAdmin() ? children : <Navigate to="/" replace />
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (!user) return <AuthScreen />
  return (
    <BrowserRouter>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardView />} />
            <Route path="devices" element={<DevicesView />} />
            <Route path="devices/:id" element={<Navigate to="/devices" replace />} />
            <Route path="rooms" element={<RoomsView />} />
            <Route path="rooms/:id" element={<RoomDetailView />} />
            <Route path="automations" element={<AutomationsView />} />
            <Route path="energy" element={<EnergyView />} />
            <Route path="plugins" element={<AdminOnly><PluginsView /></AdminOnly>} />
            <Route path="settings" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
