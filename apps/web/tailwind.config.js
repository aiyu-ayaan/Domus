/** @type {import('tailwindcss').Config} */
// Tokens mirror design-system/docus/MASTER.md.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        panel: token('panel'),
        raised: token('raised'),
        border: token('border'),
        'border-strong': token('border-strong'),
        fg: token('fg'),
        muted: token('muted'),
        subtle: token('subtle'),
        primary: token('primary'),
        'on-primary': token('on-primary'),
        on: token('on'),
        warn: token('warn'),
        danger: token('danger'),
        info: token('info'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        caption: ['12px', '16px'],
        label: ['13px', '18px'],
        body: ['14px', '20px'],
        title: ['16px', '22px'],
        page: ['20px', '28px'],
        metric: ['28px', '34px'],
      },
      borderRadius: {
        DEFAULT: '6px',
        md: '6px',
        lg: '10px',
      },
      transitionTimingFunction: { std: 'cubic-bezier(0.2, 0, 0, 1)' },
      transitionDuration: { fast: '120ms', base: '150ms', slow: '200ms' },
      zIndex: { nav: '30', sheet: '50', toast: '60' },
    },
  },
  plugins: [],
}
