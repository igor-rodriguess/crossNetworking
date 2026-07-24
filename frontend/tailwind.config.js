/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0B',
        paper: '#FFFFFF',
        carbon: '#17171A',
        graphite: '#26262B',
        stone: '#5B5B63', // escurecido de #6B6B73 → ~5:1 sobre off/paper (AA em texto pequeno)
        mist: '#C9C9CE',
        cloud: '#EDEDEF',
        off: '#F7F5F1',
        // Base preto e branco com dourado champagne como único acento
        accent: {
          DEFAULT: '#B98E4A',
          deep: '#8A6832',
          soft: '#F5EEDF',
        },
        status: {
          pos: '#1B7F5C',
          possoft: '#E6F3ED',
          warn: '#96690F',
          warnsoft: '#F7EFDC',
          neg: '#B3372F',
          negsoft: '#F9E9E7',
        },
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(10, 10, 11, 0.04), 0 4px 16px rgba(10, 10, 11, 0.04)',
        pop: '0 4px 12px rgba(10, 10, 11, 0.08), 0 12px 40px rgba(10, 10, 11, 0.12)',
      },
    },
  },
  plugins: [],
};
