/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0d1117',
        surface: 'rgba(255, 255, 255, 0.05)',
        'surface-hover': 'rgba(255, 255, 255, 0.09)',
        'surface-active': 'rgba(255, 255, 255, 0.12)',
        'glass-border': 'rgba(255, 255, 255, 0.14)',
        'glass-border-light': 'rgba(255, 255, 255, 0.25)',
        brand: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        accent: {
          cyan: '#06b6d4',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
          violet: '#8b5cf6',
        }
      },
      backdropBlur: {
        xs: '2px',
        glass: '16px',
        deep: '24px',
      },
      boxShadow: {
        'glass-card': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-inner': 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)',
        'glow-cyan': '0 0 20px -5px rgba(6, 182, 212, 0.5)',
        'glow-emerald': '0 0 20px -5px rgba(16, 185, 129, 0.5)',
      },
      transitionTimingFunction: {
        'liquid-bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'material-expressive': 'cubic-bezier(0.2, 0.0, 0, 1.0)',
      }
    },
  },
  plugins: [],
}
