/** @type {import('tailwindcss').Config} */

// Semantic tokens: values live as RGB channels in src/index.css (:root and .dark)
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace']
      },
      colors: {
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          soft: token('primary-soft'),
          fg: token('primary-fg')
        },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        danger: { DEFAULT: token('danger'), hover: token('danger-hover'), soft: token('danger-soft') },
        muted: token('muted'),
        border: token('border'),
        surface: { DEFAULT: token('surface'), raised: token('surface-raised'), sunken: token('surface-sunken') },
        fg: token('fg'),
        env: {
          prod: token('env-prod'),
          sandbox: token('env-sandbox'),
          dev: token('env-dev'),
          none: token('env-none')
        },
        sf: {
          blue: '#0176D3',
          dark: '#0B5CAB',
          cloud: '#1589EE',
          surface: '#F3F3F3',
          border: '#DDDBDA',
          text: '#080707',
          success: '#2E844A',
          warning: '#FE9339',
          error: '#EA001E'
        }
      },
      zIndex: {
        overlay: '90',
        modal: '100',
        toast: '120'
      }
    },
  },
  plugins: [],
}
