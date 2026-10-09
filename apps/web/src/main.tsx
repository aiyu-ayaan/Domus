import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import App from './App'
import { AuthProvider } from '@/lib/auth'
import { ToastProvider } from '@/lib/toast'
import { Toaster } from '@/components/Toaster'
import { applyStoredTheme } from '@/lib/theme'
import './index.css'

applyStoredTheme()

const queryClient = new QueryClient({
  defaultOptions: {
    // Live updates arrive over the WebSocket, so polling is not needed.
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {/* "user" honours prefers-reduced-motion for every animation. */}
        <MotionConfig reducedMotion="user">
          <AuthProvider>
            <App />
          </AuthProvider>
          <Toaster />
        </MotionConfig>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
