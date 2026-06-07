/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bocce: {
          green: '#1a2b5c',
          'green-light': '#2d4480',
          'green-dark': '#0d1635',
          gold: '#6ab820',
          'gold-light': '#82d42a',
          lime: '#6ab820',
          'lime-light': '#82d42a',
          clay: '#1a2b5c',
        },
      },
    },
  },
  plugins: [],
}
