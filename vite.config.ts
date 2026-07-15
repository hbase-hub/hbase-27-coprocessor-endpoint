import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/hbase-27-coprocessor-endpoint/',
  server: {
    port: 54327,
  },
})
