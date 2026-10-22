import { describe, expect, it } from 'vitest';
import { ConfigurationBaseInvalideError, lireUrlBase } from '../src/db/config-base.js';

describe('configuration de la base au démarrage', () => {
  it('accepte une URL PostgreSQL complète', () => {
    const u = 'postgres://shiku_app:secret@db:5432/shiku';
    expect(lireUrlBase({ DATABASE_URL: u })).toBe(u);
  });

  it.each([
    ['absente', {}],
    ['vide', { DATABASE_URL: '   ' }],
    ['non URL', { DATABASE_URL: 'pas une url' }],
    ['mauvais protocole', { DATABASE_URL: 'mysql://u:p@h:3306/b' }],
    ['rôle manquant', { DATABASE_URL: 'postgres://h:5432/shiku' }],
    ['base manquante', { DATABASE_URL: 'postgres://u:p@h:5432' }],
  ])('refuse : %s', (_nom, env) => {
    expect(() => lireUrlBase(env)).toThrow(ConfigurationBaseInvalideError);
  });

  it('ne recopie jamais le mot de passe dans le message', () => {
    try {
      lireUrlBase({ DATABASE_URL: 'mysql://u:motdepasse-secret@h/b' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain('motdepasse-secret');
    }
  });
});
