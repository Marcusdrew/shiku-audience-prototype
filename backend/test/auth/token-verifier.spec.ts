import { beforeAll, describe, expect, it } from 'vitest';
import { lireConfigAuth } from '../../src/auth/auth.config.js';
import {
  AuthNonConfigureeError,
  JetonInvalideError,
  TokenVerifierService,
} from '../../src/auth/token-verifier.service.js';
import {
  CLIENT,
  ISSUER,
  creerCles,
  jetonHS256,
  jetonSansSignature,
  revendications,
  sansChamp,
  signer,
  type Cles,
} from './outils.js';

let cles: Cles;
let v: TokenVerifierService;
const maintenant = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  cles = await creerCles();
  v = new TokenVerifierService(
    { issuer: ISSUER, jwksUrl: `${ISSUER}/protocol/openid-connect/certs`, clientId: CLIENT },
    cles.resolveur,
  );
});

describe('jeton valide', () => {
  it("renvoie l'identité et ne garde que les rôles SHIKU", async () => {
    const id = await v.verifier(await signer(cles, revendications(['authority', 'assistant'])));
    expect(id).toEqual({
      sub: 'utilisateur-test-1',
      identifiant: 'authority.test',
      nom: 'Test Authority',
      email: 'authority.test@example.test',
      roles: ['authority', 'assistant'],
    });
  });

  it('ignore les rôles inconnus (offline_access, protocole…) et les doublons', async () => {
    const id = await v.verifier(
      await signer(cles, {
        ...revendications([]),
        realm_access: { roles: ['protocole', 'reception', 'reception', 42, 'administrateur'] },
      }),
    );
    expect(id.roles).toEqual(['reception']);
  });

  it('accepte un jeton sans rôle (identité sans aucun droit)', async () => {
    const id = await v.verifier(await signer(cles, sansChamp(revendications(), 'realm_access')));
    expect(id.roles).toEqual([]);
  });
});

describe('jetons refusés', () => {
  const refuse = async (jeton: string, raison?: string) => {
    const e = await v.verifier(jeton).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(JetonInvalideError);
    if (raison) expect((e as Error).message).toBe(raison);
  };

  it('expiré', async () =>
    refuse(
      await signer(cles, revendications(), { iat: maintenant() - 7200, exp: maintenant() - 3600 }),
    ));
  it('pas encore valide (nbf dans le futur)', async () =>
    refuse(await signer(cles, revendications(), { nbf: '1h' })));
  it('émetteur différent', async () =>
    refuse(await signer(cles, revendications(), { iss: 'http://pirate.example/realms/shiku' })));
  it('émis pour un autre client (azp)', async () =>
    refuse(await signer(cles, { ...revendications(), azp: 'autre-client' }), 'azp'));
  it('sans azp', async () => {
    await refuse(await signer(cles, sansChamp(revendications(), 'azp')), 'azp');
  });
  it("jeton d'identité (typ ID) au lieu d'un jeton d'accès", async () =>
    refuse(await signer(cles, { ...revendications(), typ: 'ID' }), 'typ'));
  it('jeton de rafraîchissement (typ Refresh)', async () =>
    refuse(await signer(cles, { ...revendications(), typ: 'Refresh' }), 'typ'));
  it('sans typ', async () => {
    await refuse(await signer(cles, sansChamp(revendications(), 'typ')), 'typ');
  });
  it('sans date d’expiration', async () =>
    refuse(await signer(cles, revendications(), { sans: ['exp'] })));
  it('sans sujet', async () => refuse(await signer(cles, revendications(), { sans: ['sub'] })));
  it('signé par une autre clé (même kid)', async () => {
    const autre = await creerCles();
    await refuse(await signer(autre, revendications()));
  });
  it('kid inconnu', async () => refuse(await signer(cles, revendications(), { kid: 'inconnue' })));
  it('alg none (sans signature)', async () => refuse(jetonSansSignature()));
  it('confusion RS256 → HS256', async () => refuse(await jetonHS256(cles.jwk)));
  it('contenu altéré après signature', async () => {
    const [h, , s] = (await signer(cles, revendications(['reception']))).split('.');
    const p = Buffer.from(
      JSON.stringify({
        ...revendications(['administrator']),
        iss: ISSUER,
        sub: 'x',
        exp: maintenant() + 300,
        iat: maintenant(),
      }),
    ).toString('base64url');
    await refuse(`${h}.${p}.${s}`);
  });
  it.each(['', 'abc', 'a.b.c', 'a.b', '....'])('mal formé : « %s »', async (j) => refuse(j));
});

describe('configuration', () => {
  it("échoue fermé sans configuration (aucun jeton n'est accepté)", async () => {
    const sans = new TokenVerifierService(null);
    await expect(sans.verifier(await signer(cles))).rejects.toBeInstanceOf(AuthNonConfigureeError);
  });

  it('lireConfigAuth : null sans KEYCLOAK_ISSUER', () => {
    expect(lireConfigAuth({})).toBeNull();
    expect(lireConfigAuth({ KEYCLOAK_ISSUER: '  ' })).toBeNull();
  });

  it('lireConfigAuth : adresse des clés par défaut déduite de l’émetteur, client par défaut', () => {
    expect(lireConfigAuth({ KEYCLOAK_ISSUER: `${ISSUER}/` })).toEqual({
      issuer: ISSUER,
      jwksUrl: `${ISSUER}/protocol/openid-connect/certs`,
      clientId: 'shiku-web',
    });
  });

  it('lireConfigAuth : émetteur et adresse des clés distincts (réseau Docker)', () => {
    const c = lireConfigAuth({
      KEYCLOAK_ISSUER: ISSUER,
      KEYCLOAK_JWKS_URL: 'http://keycloak:8080/realms/shiku/protocol/openid-connect/certs',
    });
    expect(c?.issuer).toBe(ISSUER);
    expect(c?.jwksUrl).toContain('keycloak:8080');
  });

  it('lireConfigAuth : adresse malformée → erreur au démarrage', () => {
    expect(() => lireConfigAuth({ KEYCLOAK_ISSUER: 'pas une url' })).toThrow();
  });
});
