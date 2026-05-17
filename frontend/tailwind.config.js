/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#1F1F1E',
        card: '#262624',
        cardHover: '#2E2E2C',
        border: '#3A3A37',
        accent: '#D97757',
        accentHover: '#C76A4D',
        text: '#F5F5F2',
        muted: '#8C8C87',
        danger: '#D9534F',
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};
