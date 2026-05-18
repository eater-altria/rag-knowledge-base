/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand
        primary: '#000000',
        'primary-active': '#1a1a1a',
        'text-link': '#0d74ce',
        'text-link-secondary': '#476cff',
        'accent-link-bright': '#47c2ff',

        // Text
        ink: '#171717',
        body: '#60646c',
        'body-strong': '#171717',
        muted: '#999999',
        'muted-soft': '#cccccc',
        'on-primary': '#ffffff',
        'on-dark': '#ffffff',
        'on-dark-soft': '#b0b4ba',

        // Surfaces
        canvas: '#ffffff',
        'canvas-soft': '#fafafa',
        'surface-card': '#ffffff',
        'surface-strong': '#f0f0f3',
        'surface-dark': '#171717',
        'surface-dark-elevated': '#1a1a1a',

        // Hairlines
        hairline: '#f0f0f3',
        'hairline-soft': '#f5f5f7',
        'hairline-strong': '#dcdee0',

        // Atmospheric
        'sky-light': '#cfe7ff',
        'sky-mid': '#a8c8e8',

        // Semantic
        warning: '#ab6400',
        preview: '#8145b5',
        success: '#16a34a',
        error: '#eb8e90',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        'display-mega': ['64px', { lineHeight: '1.05', letterSpacing: '-1.92px', fontWeight: '600' }],
        'display-xl': ['48px', { lineHeight: '1.1', letterSpacing: '-1.44px', fontWeight: '600' }],
        'display-lg': ['36px', { lineHeight: '1.15', letterSpacing: '-1.08px', fontWeight: '600' }],
        'display-md': ['28px', { lineHeight: '1.2', letterSpacing: '-0.84px', fontWeight: '600' }],
        'display-sm': ['22px', { lineHeight: '1.25', letterSpacing: '-0.5px', fontWeight: '600' }],
        'title-md': ['18px', { lineHeight: '1.4', fontWeight: '600' }],
        'title-sm': ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        'body-md': ['16px', { lineHeight: '1.5' }],
        'body-sm': ['14px', { lineHeight: '1.5' }],
        caption: ['13px', { lineHeight: '1.4' }],
        'caption-uppercase': ['11px', { lineHeight: '1.4', letterSpacing: '0.88px', fontWeight: '600' }],
        code: ['13px', { lineHeight: '1.5' }],
        button: ['14px', { lineHeight: '1', fontWeight: '500' }],
        'nav-link': ['14px', { lineHeight: '1.4', fontWeight: '500' }],
      },
      borderRadius: {
        none: '0px',
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
        pill: '9999px',
        full: '9999px',
      },
      spacing: {
        xxs: '4px',
        xs: '8px',
        sm: '12px',
        base: '16px',
        md: '20px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
        section: '96px',
      },
      boxShadow: {
        drop: '0 4px 12px rgba(0, 0, 0, 0.04)',
      },
      backgroundImage: {
        'hero-sky': 'radial-gradient(ellipse 80% 60% at 50% 0%, #cfe7ff 0%, #a8c8e8 35%, #ffffff 80%)',
      },
    },
  },
  plugins: [],
};
