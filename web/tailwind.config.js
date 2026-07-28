/** @type {import('tailwindcss').Config} */
// Mirrors the Next app's theme so both frontends render the same design.
module.exports = {
  content: ['./src/**/*.{html,ts}'],
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
          DEFAULT: '#FF6A1A',   // safety-orange accent
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
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        plate: '3px',
      },
    },
  },
  plugins: [],
};
