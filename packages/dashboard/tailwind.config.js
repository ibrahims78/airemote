/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // R6 — رموز دلالية تُقرأ من متغيّرات CSS في index.css.
        // السمة الافتراضية داكنة، وhtml.light يبدّل القيم فقط.
        canvas:    'rgb(var(--bg) / <alpha-value>)',
        surface:   'rgb(var(--surface) / <alpha-value>)',
        surface2:  'rgb(var(--surface-2) / <alpha-value>)',
        line:      'rgb(var(--line) / <alpha-value>)',
        ink:       'rgb(var(--ink) / <alpha-value>)',
        muted:     'rgb(var(--muted) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          fg:      'rgb(var(--primary-fg) / <alpha-value>)'
        },
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger:  'rgb(var(--danger) / <alpha-value>)',
        info:    'rgb(var(--info) / <alpha-value>)',
        navy: {
          900: '#0F172A',
          800: '#1E293B',
          700: '#1a2744',
          600: '#243352'
        },
        brand: {
          blue: '#3B82F6',
          teal: '#14B8A6',
          purple: '#8B5CF6'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.18)',
        pop:  '0 12px 40px rgba(0,0,0,.35)'
      },
      transitionDuration: {
        fast: '120ms'
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.18)',
        pop:  '0 12px 40px rgba(0,0,0,.35)'
      },
      transitionDuration: {
        fast: '120ms'
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: []
}
