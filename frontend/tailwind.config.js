/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        soft: 'var(--soft)',
        line: 'var(--line)',
        hover: 'var(--hover)',
        accent: '#d97757',
        'accent-dark': '#c96846',
        faint: 'var(--faint)',
        surface: 'var(--surface)',
        edge: 'var(--edge)',
        'hover-2': 'var(--hover-2)',
        warm: 'var(--warm)',
        'warm-border': 'var(--warm-border)',
        'warm-bg': 'var(--warm-bg)',
        avatar: 'var(--avatar)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", 'ui-monospace', 'Menlo', 'monospace'],
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        popIn: {
          from: { opacity: '0', transform: 'scale(.96) translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        toastIn: {
          from: { opacity: '0', transform: 'translate(-50%,14px)' },
          to: { opacity: '1', transform: 'translate(-50%,0)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn .18s ease',
        'pop-in': 'popIn .22s ease',
        'toast-in': 'toastIn .22s ease',
      },
    },
  },
  plugins: [],
}
