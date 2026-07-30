/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
  build: {
    rollupOptions: {
      output: {
        // Funkcijska oblika, ne objektna. Objektna oblika (react: ['react', ...])
        // je razvrscala po VSTOPNEM modulu, dejanska koda React-a pa zivi v
        // react/cjs/react.production.min.js — ta je pristal v router chunku,
        // chunk "react" pa je meril 30 bajtov. Tu razvrscamo po poti modula,
        // zato zajamemo tudi cjs datoteke in scheduler.
        //
        // Vrstni red pogojev je pomemben: "react-router" vsebuje "react", zato
        // mora biti preverjen prvi.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          const p = id.replace(/\\/g, '/')
          if (p.includes('/react-router')) return 'router'
          if (p.includes('/react-dom/') || p.includes('/react/') || p.includes('/scheduler/')) return 'react'
          if (p.includes('/@supabase/')) return 'supabase'
          if (p.includes('/@tanstack/')) return 'query'
          if (p.includes('/date-fns/')) return 'datefns'
        },
      },
    },
  },
})
