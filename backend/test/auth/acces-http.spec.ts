import 'reflect-metadata';
import { Controller, Get, Global, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createRemoteJWKSet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../../src/auth/auth.module.js';
import { PG_POOL } from '../../src/db/db.module.js';
import {
  AuthentifieSeulement,
  ExigeDroit,
  Public,
} from '../../src/habilitation/acces.decorators.js';
import { SanteController } from '../../src/sante/sante.controller.js';
import {
  CLIENT,
  ISSUER,
  creerCles,
  jetonHS256,
  jetonSansSignature,
  revendications,
  signer,
  type Cles,
} from './outils.js';

// Contrôleur d'essai (réservé à ce fichier de test) : une route par régime d'accès.
@Controller('essai')
class EssaiController {
  @Get('public') @Public() publique() {
    return { ok: true };
  }
  @Get('authentifie') @AuthentifieSeulement() authentifie() {
    return { ok: true };
  }
  @Get('non-declaree') nonDeclaree() {
    return { ok: true };
  }
  @Get('depot') @ExigeDroit('demande.creer') depot() {
    return { ok: true };
  }
  @Post('decision') @ExigeDroit('decision.valider_rejeter') decision() {
    return { ok: true };
  }
  @Get('cloture') @ExigeDroit('audience.cloturer') cloture() {
    return { ok: true };
  }
  @Get('inconnue') @ExigeDroit('action.inexistante') inconnue() {
    return { ok: true };
  }
}

// Base factice : un compte applicatif actif existe toujours (le test porte sur l'accès, pas sur la base ;
// l'absence de compte est testée sur une vraie base dans test/db/api-metier.spec.ts).
const BASE_DONNEES = {
  provide: PG_POOL,
  useValue: {
    query: async () => ({ rows: [{ id: 'u-test', organisation_id: 'o-test', actif: true }] }),
  },
};

// Comme DbModule en production : fournisseur GLOBAL, visible par AuthModule (ContexteGuard).
@Global()
@Module({ providers: [BASE_DONNEES], exports: [PG_POOL] })
class BaseFactice {}

async function demarrer(auth: Parameters<typeof AuthModule.register>[0]) {
  @Module({
    imports: [BaseFactice, AuthModule.register(auth)],
    controllers: [SanteController, EssaiController],
  })
  class ModuleEssai {}
  const app = await NestFactory.create(ModuleEssai, { logger: false });
  await app.listen(0, '127.0.0.1');
  return { app, url: await app.getUrl() };
}

const appel = (url: string, chemin: string, jeton?: string, init: RequestInit = {}) =>
  fetch(`${url}${chemin}`, {
    ...init,
    headers: { ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}), ...init.headers },
  });

describe('accès HTTP avec jetons vérifiés', () => {
  let cles: Cles;
  let serveur: Awaited<ReturnType<typeof demarrer>>;
  const config = { issuer: ISSUER, jwksUrl: 'http://inutilise.invalid/certs', clientId: CLIENT };
  const jeton = (roles: string[]) => signer(cles, revendications(roles));

  beforeAll(async () => {
    cles = await creerCles();
    serveur = await demarrer({ config, resolveurCles: cles.resolveur });
  });
  afterAll(() => serveur.app.close());

  describe('/sante reste publique', () => {
    it('200 sans jeton', async () => {
      const r = await appel(serveur.url, '/sante');
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ statut: 'ok', base: 'ok' });
    });
    it('200 même avec un jeton invalide (route publique : le jeton n’est pas examiné)', async () => {
      expect((await appel(serveur.url, '/sante', 'n-importe-quoi')).status).toBe(200);
    });
  });

  describe('GET /moi', () => {
    it('401 sans en-tête Authorization', async () => {
      const r = await appel(serveur.url, '/moi');
      expect(r.status).toBe(401);
    });
    it.each([
      ['schéma Basic', 'Basic dXNlcjpwYXNz'],
      ['jeton absent', 'Bearer'],
      ['deux jetons', 'Bearer a b'],
      ['jeton géant', `Bearer ${'a'.repeat(9000)}`],
      ['jeton mal formé', 'Bearer pas.un.jeton'],
    ])('401 : %s', async (_n, en_tete) => {
      const r = await fetch(`${serveur.url}/moi`, { headers: { Authorization: en_tete } });
      expect(r.status).toBe(401);
    });

    it('401 : jeton expiré', async () => {
      const m = Math.floor(Date.now() / 1000);
      const j = await signer(cles, revendications(), { iat: m - 7200, exp: m - 3600 });
      expect((await appel(serveur.url, '/moi', j)).status).toBe(401);
    });
    it('401 : émetteur incorrect', async () => {
      const j = await signer(cles, revendications(), { iss: 'http://pirate.example/realms/shiku' });
      expect((await appel(serveur.url, '/moi', j)).status).toBe(401);
    });
    it('401 : jeton émis pour un autre client', async () => {
      const j = await signer(cles, { ...revendications(), azp: 'autre-client' });
      expect((await appel(serveur.url, '/moi', j)).status).toBe(401);
    });
    it('401 : signature d’une autre clé', async () => {
      const j = await signer(await creerCles(), revendications());
      expect((await appel(serveur.url, '/moi', j)).status).toBe(401);
    });
    it('401 : alg none et confusion HS256', async () => {
      expect((await appel(serveur.url, '/moi', jetonSansSignature())).status).toBe(401);
      expect((await appel(serveur.url, '/moi', await jetonHS256(cles.jwk))).status).toBe(401);
    });
    it('le message de refus ne révèle pas la cause', async () => {
      const j = await signer(cles, { ...revendications(), azp: 'autre-client' });
      const corps = JSON.stringify(await (await appel(serveur.url, '/moi', j)).json());
      expect(corps).not.toMatch(/azp|signature|issuer|typ\b|sub\b/i);
    });

    it('200 : identité et rôles du jeton vérifié, sans aucun droit supplémentaire', async () => {
      const r = await appel(serveur.url, '/moi', await jeton(['assistant']));
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(await r.json()).toEqual({
        sub: 'utilisateur-test-1',
        identifiant: 'authority.test',
        nom: 'Test Authority',
        email: 'authority.test@example.test',
        roles: ['assistant'],
      });
    });
    it('200 avec un jeton sans rôle SHIKU : identité seule, roles vide', async () => {
      const r = await appel(serveur.url, '/moi', await jeton([]));
      expect(r.status).toBe(200);
      expect((await r.json()).roles).toEqual([]);
    });
  });

  describe('refus par défaut', () => {
    it('route non déclarée : 401 sans jeton, 403 avec jeton valide (même Administrateur)', async () => {
      expect((await appel(serveur.url, '/essai/non-declaree')).status).toBe(401);
      for (const role of ['reception', 'assistant', 'authority', 'administrator'])
        expect((await appel(serveur.url, '/essai/non-declaree', await jeton([role]))).status).toBe(
          403,
        );
    });

    it('route @Public : accessible sans jeton', async () => {
      expect((await appel(serveur.url, '/essai/public')).status).toBe(200);
    });
    it('route @AuthentifieSeulement : 401 sans jeton, 200 avec', async () => {
      expect((await appel(serveur.url, '/essai/authentifie')).status).toBe(401);
      expect((await appel(serveur.url, '/essai/authentifie', await jeton([]))).status).toBe(200);
    });

    it('route à droit : seul le rôle listé passe', async () => {
      expect((await appel(serveur.url, '/essai/depot')).status).toBe(401);
      expect((await appel(serveur.url, '/essai/depot', await jeton(['reception']))).status).toBe(
        200,
      );
      for (const role of ['assistant', 'authority', 'administrator'])
        expect((await appel(serveur.url, '/essai/depot', await jeton([role]))).status).toBe(403);
      expect((await appel(serveur.url, '/essai/depot', await jeton([]))).status).toBe(403);
    });

    it('la Réception ne peut pas décider, même en prétendant être Autorité par en-tête ou corps', async () => {
      const r = await appel(serveur.url, '/essai/decision', await jeton(['reception']), {
        method: 'POST',
        headers: {
          'x-role': 'authority',
          'x-roles': 'authority',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ roles: ['authority'], role: 'authority' }),
      });
      expect(r.status).toBe(403);
      const ok = await appel(serveur.url, '/essai/decision', await jeton(['authority']), {
        method: 'POST',
      });
      expect(ok.status).toBe(201);
    });

    it('clôture : refusée à tous les rôles tant que le responsable n’est pas désigné (H4)', async () => {
      for (const role of ['reception', 'assistant', 'authority', 'administrator'])
        expect((await appel(serveur.url, '/essai/cloture', await jeton([role]))).status).toBe(403);
    });

    it('action absente de la matrice : refusée à tous', async () => {
      for (const role of ['reception', 'assistant', 'authority', 'administrator'])
        expect((await appel(serveur.url, '/essai/inconnue', await jeton([role]))).status).toBe(403);
    });
  });
});

describe('échecs fermés', () => {
  it('sans configuration : /moi 503, route à droit 503, mais /sante reste 200', async () => {
    const s = await demarrer({ config: null });
    try {
      const cles = await creerCles();
      const j = await signer(cles, revendications());
      expect((await appel(s.url, '/moi', j)).status).toBe(503);
      expect((await appel(s.url, '/essai/depot', j)).status).toBe(503);
      expect((await appel(s.url, '/sante')).status).toBe(200);
      expect((await appel(s.url, '/moi')).status).toBe(401);
    } finally {
      await s.app.close();
    }
  });

  it('clés Keycloak injoignables : 503 (jamais 200), /sante reste 200', async () => {
    const cles = await creerCles();
    const s = await demarrer({
      config: { issuer: ISSUER, jwksUrl: 'http://127.0.0.1:9/certs', clientId: CLIENT },
      resolveurCles: createRemoteJWKSet(new URL('http://127.0.0.1:9/certs'), {
        timeoutDuration: 500,
      }),
    });
    try {
      const j = await signer(cles, revendications());
      expect((await appel(s.url, '/moi', j)).status).toBe(503);
      expect((await appel(s.url, '/sante')).status).toBe(200);
    } finally {
      await s.app.close();
    }
  });
});
