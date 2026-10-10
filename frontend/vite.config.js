import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The URL path the app is served from. "/CDIMS/" for the XAMPP setup; use "/" for a domain or sub-domain root on cPanel.
// Override at build time:  VITE_BASE=/ npm run build   (see scripts/build-release.mjs)
const BASE = (process.env.VITE_BASE || '/CDIMS/').replace(/\/?$/, '/');

// In development, send "/" and "/CDIMS" to "/CDIMS/" (Vite only serves the app under its base path).
const redirectToBase = () => ({
  name: 'redirect-to-base',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = (req.url || '').split('?')[0];
      if (BASE !== '/' && (path === '/' || path === BASE.slice(0, -1))) {
        res.statusCode = 302;
        res.setHeader('Location', BASE);
        res.end();
        return;
      }
      next();
    });
  },
});

// Hot-reloading one module while the app is open can leave two copies of the sign-in state in the page, which then looks
// signed out until a hard refresh. A full reload on every change keeps the page consistent.
const fullReloadOnChange = () => ({
  name: 'full-reload-on-change',
  handleHotUpdate({ server }) {
    server.ws.send({ type: 'full-reload' });
    return [];
  },
});

// Built output goes to ../dist. `npm run dev` proxies the API to the XAMPP Apache server.
export default defineConfig({
  base: BASE,
  plugins: [react(), redirectToBase(), fullReloadOnChange()],
  build: {
    outDir: process.env.VITE_OUTDIR || '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: { manualChunks: { charts: ['recharts'], react: ['react', 'react-dom', 'react-router-dom'] } },
    },
  },
  server: {
    port: 5173,
    proxy: { [`${BASE}api`]: { target: 'http://localhost', changeOrigin: true } },
  },
});
