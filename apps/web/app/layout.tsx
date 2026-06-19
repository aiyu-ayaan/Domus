import type { Metadata } from 'next';
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/app-shell';
import { Providers } from '@/components/providers';
import type { ReactNode } from 'react';

const sans = IBM_Plex_Sans({ subsets: ['latin'], variable: '--font-sans', weight: ['300', '400', '500', '600', '700'] });
const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display' });

export const metadata: Metadata = {
    title: 'Domus',
    description: 'Your Home. Unified.'
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={`${sans.variable} ${display.variable} bg-background font-sans text-foreground`}>
                <Providers>
                    <AppShell>{children}</AppShell>
                </Providers>
            </body>
        </html>
    );
}
