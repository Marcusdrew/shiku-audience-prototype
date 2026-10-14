import { defineConfig } from 'vitest/config';
// Tests unitaires : aucune base requise. Les tests de base de données sont dans test/db
// et se lancent par `pnpm test:db` (voir vitest.db.config.ts).
export default defineConfig({
  test: { include: ['test/**/*.spec.ts'], exclude: ['test/db/**', 'node_modules/**'] },
});
