"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { RealtimeProvider } from "@/providers/realtime-provider";

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  // Register the PWA service worker for installability + offline shell.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <RealtimeProvider>
          {children}
          <Toaster position="top-right" closeButton theme="dark" richColors />
        </RealtimeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
