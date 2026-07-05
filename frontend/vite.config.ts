import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/memeapp/',
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
});
