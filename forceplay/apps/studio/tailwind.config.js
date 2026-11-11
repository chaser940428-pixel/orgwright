/** @type {import('tailwindcss').Config} */
export default {
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
      }
    },
  },
  plugins: [],
}
