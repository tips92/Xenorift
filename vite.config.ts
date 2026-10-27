import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : nécessaire pour la WebView Capacitor (Android / iOS).
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'], three: ['three'] },
      },
    },
  },
});
