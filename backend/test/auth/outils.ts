import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

// Outils de test : de VRAIES signatures RS256, produites avec une paire de clés générée pour le test.
// Aucun secret, aucune donnée réelle. Ne simule pas Keycloak : voir scripts/verifier-auth.mjs pour
// le test contre un vrai Keycloak.
export const ISSUER = 'http://localhost:8080/realms/shiku';
export const CLIENT = 'shiku-web';

export interface Cles {
  privateKey: CryptoKey;
  resolveur: JWTVerifyGetKey;
  jwk: Record<string, unknown>;
}

export async function creerCles(kid = 'cle-test-1'): Promise<Cles> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { privateKey, jwk, resolveur: createLocalJWKSet({ keys: [jwk] }) };
}

export interface OptionsJeton {
  kid?: string;
  iss?: string;
  /** Secondes depuis l'époque, ou durée jose (« 5m »). */
  exp?: number | string;
  iat?: number;
  nbf?: number | string;
  sans?: ('exp' | 'iat' | 'sub')[];
  /** Sujet du jeton (défaut : utilisateur-test-1). */
  sub?: string;
}

export function revendications(roles: string[] = ['authority']): JWTPayload {
  return {
    typ: 'Bearer',
    azp: CLIENT,
    preferred_username: 'authority.test',
    name: 'Test Authority',
    email: 'authority.test@example.test',
    realm_access: { roles: [...roles, 'offline_access', 'default-roles-shiku'] },
  };
}

export async function signer(
  cles: Pick<Cles, 'privateKey'>,
  payload: JWTPayload = revendications(),
  o: OptionsJeton = {},
): Promise<string> {
  let jwt = new SignJWT({ ...payload }).setProtectedHeader({
    alg: 'RS256',
    kid: o.kid ?? 'cle-test-1',
    typ: 'JWT',
  });
  jwt = jwt.setIssuer(o.iss ?? ISSUER);
  if (!o.sans?.includes('sub')) jwt = jwt.setSubject(o.sub ?? 'utilisateur-test-1');
  if (!o.sans?.includes('iat')) jwt = jwt.setIssuedAt(o.iat);
  if (!o.sans?.includes('exp')) jwt = jwt.setExpirationTime(o.exp ?? '5m');
  if (o.nbf !== undefined) jwt = jwt.setNotBefore(o.nbf);
  return jwt.sign(cles.privateKey);
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Jeton « alg: none », sans signature : doit toujours être refusé. */
export function jetonSansSignature(payload: JWTPayload = revendications()): string {
  const maintenant = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    ...payload,
    iss: ISSUER,
    sub: 'x',
    iat: maintenant,
    exp: maintenant + 300,
  })}.`;
}

/** Attaque par confusion d'algorithme : HS256 signé avec la clé publique comme secret. */
export async function jetonHS256(jwk: Record<string, unknown>): Promise<string> {
  return new SignJWT({ ...revendications() })
    .setProtectedHeader({ alg: 'HS256', kid: 'cle-test-1' })
    .setIssuer(ISSUER)
    .setSubject('x')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(JSON.stringify(jwk)));
}

/** Copie des revendications sans le champ indiqué. */
export function sansChamp(payload: JWTPayload, champ: string): JWTPayload {
  return Object.fromEntries(Object.entries(payload).filter(([k]) => k !== champ));
}
