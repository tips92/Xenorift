import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Sert art/kai.glb en dev seulement : le fichier ne part pas dans l'APK. */
function serveKaiGlb(): Plugin {
  const file = path.resolve('art/kai.glb');
  return {
    name: 'kai-glb',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/art/kai.glb') {
          next();
          return;
        }
        fs.stat(file, (err, stat) => {
          if (err) {
            res.statusCode = 404;
            res.end('kai.glb absent');
            return;
          }
          res.setHeader('Content-Type', 'model/gltf-binary');
          res.setHeader('Content-Length', String(stat.size));
          fs.createReadStream(file).pipe(res);
        });
      });
    },
  };
}

export default defineConfig({
  // Chemins relatifs : nécessaire pour la WebView Capacitor (Android / iOS).
  base: './',
  plugins: [serveKaiGlb()],
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
