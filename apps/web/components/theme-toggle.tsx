'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle() {
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');

    useEffect(() => {
        const storedTheme = window.localStorage.getItem('domus-theme');
        const initialTheme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
        setTheme(initialTheme);
        document.documentElement.classList.toggle('dark', initialTheme === 'dark');
    }, []);

    function toggleTheme() {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        window.localStorage.setItem('domus-theme', nextTheme);
        document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    }

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-left text-sm font-medium transition hover:bg-accent/60"
        >
            {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        </button>
    );
}