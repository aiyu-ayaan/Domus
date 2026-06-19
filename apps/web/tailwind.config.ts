import type { Config } from 'tailwindcss';

const config: Config = {
    darkMode: ['class'],
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                border: 'hsl(var(--border))',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                card: 'hsl(var(--card))',
                muted: 'hsl(var(--muted))',
                accent: 'hsl(var(--accent))',
                primary: 'hsl(var(--primary))'
            },
            boxShadow: {
                glow: '0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px rgba(2,6,23,0.35)'
            }
        }
    },
    plugins: []
};

export default config;
