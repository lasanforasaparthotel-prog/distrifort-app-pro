import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Si NO usas un backend proxy, puedes eliminar el bloque 'server'.
  // Si usas un backend para la IA, DEBE ir así:
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001', // Asumiendo que tu backend/proxy está aquí
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
