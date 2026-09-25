import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Em desenvolvimento a API é servida pela mesma origem via proxy, como
// acontecerá atrás do Traefik: o cookie de sessão fica restrito a um só site.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
