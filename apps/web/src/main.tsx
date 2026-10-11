import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AuthProvider } from '@/lib/auth'
import { ToastProvider } from '@/lib/toast'
import { Toaster } from '@/components/ui/Toaster'
import { applyStoredTheme } from '@/lib/theme'
import { applyFlavorHead } from '@/lib/flavor'
import { desktop } from '@/lib/api'
import { ScreenSyncProvider } from '@/features/screensync/ScreenSync'
// Bundled, so the page paints without the internet and nothing blocks on another host.
import '@fontsource-variable/inter/wght.css'
import './index.css'

applyStoredTheme()
applyFlavorHead()
if (desktop) document.documentElement.classList.add('desktop')

// Live changes arrive over the WebSocket, so queries do not poll.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <ScreenSyncProvider>
            <App />
          </ScreenSyncProvider>
        </AuthProvider>
        <Toaster />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
