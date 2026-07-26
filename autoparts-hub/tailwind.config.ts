import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#10131A',   // page background - graphite/near-black with a blue cast
          panel: '#181D26',     // card / panel surface
          raised: '#212834',    // raised surface (hover, modals)
          line: '#2A3240',      // hairline borders
        },
        paper: '#EDEFF2',       // primary text on dark
        mute: '#8C96A6',        // secondary text
        signal: {
          DEFAULT: '#FF6A1A',   // safety-orange accent — hazard-tape / workshop signage
          dim: '#B84E14',
          soft: '#FFE4D2',
        },
        stock: {
          DEFAULT: '#2E9E8B',   // in-stock / success teal
          dim: '#1E6B5D',
        },
        alert: '#E5484D',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      backgroundImage: {
        'diagonal-hatch':
          'repeating-linear-gradient(135deg, rgba(255,106,26,0.06) 0px, rgba(255,106,26,0.06) 2px, transparent 2px, transparent 10px)',
      },
      borderRadius: {
        plate: '3px',
      },
    },
  },
  plugins: [],
};

export default config;
