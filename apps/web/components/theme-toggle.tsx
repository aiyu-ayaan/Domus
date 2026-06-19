'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <div className="h-10 w-full animate-pulse-slow rounded-xl border border-border bg-muted/30" />
        );
    }

    const isDark = resolvedTheme === 'dark';

    return (
        <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="flex items-center gap-3 rounded-xl border border-border bg-background/50 px-4 py-2.5 text-left text-sm font-medium transition hover:border-accent hover:bg-accent/30 cursor-pointer w-full text-foreground/80 hover:text-foreground"
        >
            {isDark ? (
                <>
                    <Sun className="h-4 w-4 text-amber-500 animate-spin-slow" />
                    <span>Light Mode</span>
                </>
            ) : (
                <>
                    <Moon className="h-4 w-4 text-indigo-500" />
                    <span>Dark Mode</span>
                </>
            )}
        </button>
    );
}