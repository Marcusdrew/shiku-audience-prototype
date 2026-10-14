import { defineConfig } from 'vitest/config';
// Tests qui exigent PostgreSQL migré (rôles + migrations). Un seul fichier à la fois, en série.
export default defineConfig({
  test: {
    include: ['test/db/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
