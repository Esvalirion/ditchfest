import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // server/ (Express) runs separately in dev — see server/README or
      // `npm run dev` in server/. In production the same Express app also
      // serves this client's build output, so no proxy is needed there.
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
    },
  },
})
