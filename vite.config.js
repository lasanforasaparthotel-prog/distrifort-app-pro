import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // --- INICIO DEL AJUSTE SOLICITADO ---
  build: {
    // Silencia la advertencia del tamaño del fragmento (chunk) y aumenta el límite a 1000 kB (1 MB)
    // El valor predeterminado es 500 kB.
    chunkSizeWarningLimit: 1000, 
    
    rollupOptions: {
      output: {
        // Usa la importación dinámica para mejorar la fragmentación de la aplicación (optimización)
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Separa las dependencias grandes de node_modules en un fragmento 'vendor'
            return 'vendor';
          }
        },
      },
    },
  },
  // --- FIN DEL AJUSTE SOLICITADO ---
})
