import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Skeleton } from '@/components/ui/Card'
import { AuthScreen, ChangePasswordScreen } from '@/features/auth/AuthScreen'
import { OverviewView } from '@/features/overview/OverviewView'
import { useAuth, useIsAdmin } from '@/lib/auth'

const DevicesView = lazy(() => import('@/features/devices/DevicesView').then((m) => ({ default: m.DevicesView })))
const RoomsView = lazy(() => import('@/features/rooms/RoomsView').then((m) => ({ default: m.RoomsView })))
const RoomDetailView = lazy(() => import('@/features/rooms/RoomsView').then((m) => ({ default: m.RoomDetailView })))
const AutomationsView = lazy(() => import('@/features/automations/AutomationsView').then((m) => ({ default: m.AutomationsView })))
const EnergyView = lazy(() => import('@/features/energy/EnergyView').then((m) => ({ default: m.EnergyView })))
const AirQualityView = lazy(() => import('@/features/airquality/AirQualityView').then((m) => ({ default: m.AirQualityView })))
const IntegrationsView = lazy(() => import('@/features/integrations/IntegrationsView').then((m) => ({ default: m.IntegrationsView })))
const UpdatesView = lazy(() => import('@/features/settings/UpdatesView').then((m) => ({ default: m.UpdatesView })))
const AboutView = lazy(() => import('@/features/settings/AboutView').then((m) => ({ default: m.AboutView })))
const AcknowledgementsView = lazy(() => import('@/features/settings/AboutView').then((m) => ({ default: m.AcknowledgementsView })))
const SettingsView = lazy(() => import('@/features/settings/SettingsView').then((m) => ({ default: m.SettingsView })))

function AdminOnly({ children }: { children: JSX.Element }) {
  return useIsAdmin() ? children : <Navigate to="/" replace />
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-dvh" aria-busy="true" />
  if (!user) return <AuthScreen />
  if (user.must_change_password) return <ChangePasswordScreen />
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<OverviewView />} />
          <Route path="devices" element={<Lazy><DevicesView /></Lazy>} />
          <Route path="devices/:id" element={<Navigate to="/devices" replace />} />
          <Route path="rooms" element={<Lazy><RoomsView /></Lazy>} />
          <Route path="rooms/:id" element={<Lazy><RoomDetailView /></Lazy>} />
          <Route path="automations" element={<Lazy><AutomationsView /></Lazy>} />
          <Route path="energy" element={<Lazy><EnergyView /></Lazy>} />
          <Route path="air-quality" element={<Lazy><AirQualityView /></Lazy>} />
          <Route path="plugins" element={<AdminOnly><Lazy><IntegrationsView /></Lazy></AdminOnly>} />
          <Route path="settings" element={<Lazy><SettingsView /></Lazy>} />
          <Route path="updates" element={<Lazy><UpdatesView /></Lazy>} />
          <Route path="about" element={<Lazy><AboutView /></Lazy>} />
          <Route path="about/acknowledgements" element={<Lazy><AcknowledgementsView /></Lazy>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function Lazy({ children }: { children: JSX.Element }) {
  return <Suspense fallback={<Skeleton className="h-64" />}>{children}</Suspense>
}
