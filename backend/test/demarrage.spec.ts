import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';

// T0-38 : le serveur démarre. Aucune base n'est jointe (le pool est paresseux), mais l'URL doit être
// bien formée : sans elle l'application refuse de démarrer (voir test/db-config.spec.ts).
describe('démarrage du serveur (T0-38)', () => {
  it("l'application Nest s'initialise puis s'arrête proprement", async () => {
    const avant = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://essai:essai@127.0.0.1:9/essai'; // jamais contactée
    try {
      const app = await NestFactory.create(AppModule, { logger: false });
      await app.init();
      await expect(app.close()).resolves.toBeUndefined();
    } finally {
      if (avant === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = avant;
    }
  }, 15_000); // délai élargi (démarrage lent constaté sous Windows, modification du 20/10)
});
