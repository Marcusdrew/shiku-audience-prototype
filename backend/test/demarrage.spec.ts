import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';

// T0-38 : le serveur démarre. Aucune base n'est requise à ce stade.
describe('démarrage du serveur (T0-38)', () => {
  it("l'application Nest s'initialise puis s'arrête proprement", async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    await expect(app.close()).resolves.toBeUndefined();
  });
});
