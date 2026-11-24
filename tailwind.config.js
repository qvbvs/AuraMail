/** @type {import('tailwindcss').Config} */
const v = (name) => `var(--${name})`

module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        panel: v('panel'),
        raised: v('raised'),
        sunken: v('sunken'),
        hover: v('hover'),
        selected: v('selected'),
        line: v('line'),
        'line-strong': v('line-strong'),
        ink: v('ink'),
        'ink-2': v('ink-2'),
        'ink-3': v('ink-3'),
        accent: v('accent'),
        'accent-hover': v('accent-hover'),
        'accent-soft': v('accent-soft'),
        'accent-ink': v('accent-ink'),
        'on-accent': v('on-accent'),
        danger: v('danger'),
        'danger-soft': v('danger-soft'),
        warn: v('warn'),
        'warn-soft': v('warn-soft'),
        flag: v('flag'),
        'flag-hover': v('flag-hover'),
        'on-flag': v('on-flag'),
        ok: v('ok'),
        'ok-soft': v('ok-soft')
      },
      fontFamily: {
        sans: v('font-sans'),
        mono: v('font-mono')
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        md: ['14px', { lineHeight: '20px' }],
        base: ['15px', { lineHeight: '24px' }],
        lg: ['16px', { lineHeight: '22px' }],
        xl: ['21px', { lineHeight: '26px', letterSpacing: '-0.02em' }],
        '2xl': ['28px', { lineHeight: '32px', letterSpacing: '-0.025em' }]
      },
      borderRadius: {
        sm: v('r-1'),
        DEFAULT: v('r-2'),
        md: v('r-2'),
        lg: v('r-3'),
        xl: v('r-4')
      },
      boxShadow: {
        1: v('shadow-1'),
        2: v('shadow-2'),
        3: v('shadow-3')
      },
      transitionDuration: {
        DEFAULT: '110ms'
      }
    }
  },
  plugins: []
}
