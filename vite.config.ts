import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',          // ✅ 关键修改：从 '/' 改成 './'
  server: {
    host: '::',
    port: 5173,
  },
})
