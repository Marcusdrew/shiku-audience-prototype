import { describe, expect, it } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { SanteController } from '../src/sante/sante.controller.js';

describe('page de santé (T0-39)', () => {
  it('répond ok quand la base répond', async () => {
    const c = new SanteController({ query: async () => ({}) } as never);
    await expect(c.verifier()).resolves.toEqual({ statut: 'ok', base: 'ok' });
  });
  it('répond 503 quand la base est injoignable', async () => {
    const c = new SanteController({
      query: async () => {
        throw new Error('down');
      },
    } as never);
    await expect(c.verifier()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
