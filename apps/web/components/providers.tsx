'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { RealtimeProvider } from '@/providers/realtime-provider';

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 60 * 1000,
                        refetchOnWindowFocus: false,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
                <RealtimeProvider>
                    {children}
                    <Toaster position="top-right" closeButton theme="dark" richColors />
                </RealtimeProvider>
            </ThemeProvider>
        </QueryClientProvider>
    );
}
