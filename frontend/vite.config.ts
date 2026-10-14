/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Port 5173 imposé : c'est le seul `redirectUris` déclaré dans infra/keycloak/realm-shiku.json.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const cible = env.DEV_API_TARGET ?? 'http://localhost:3000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      // Le backend n'active pas CORS (backend/src/main.ts) : en développement, le navigateur
      // appelle /api sur l'origine du frontend et Vite relaie vers l'API sans toucher au backend.
      proxy: {
        '/api': { target: cible, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
