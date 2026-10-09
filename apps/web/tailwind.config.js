/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        fg: token('fg'),
        muted: token('muted'),
        subtle: token('subtle'),
        surface: token('surface'),
        line: token('line'),
        accent: token('accent'),
        'on-accent': token('on-accent'),
        danger: token('danger'),
        warn: token('warn'),
        info: token('info'),
        light: token('light'),
        air: token('air'),
        power: token('power'),
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      transitionTimingFunction: {
        // Material 3 expressive: emphasized decelerate / standard
        emphasized: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
      },
      zIndex: { nav: '30', sheet: '50', toast: '60' },
    },
  },
  plugins: [],
}
