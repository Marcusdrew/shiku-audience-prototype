import { Inject, Injectable, Optional } from '@nestjs/common';
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { estRole } from '../habilitation/roles.js';
import type { ConfigAuth } from './auth.config.js';
import type { Identite } from './identite.js';

export const AUTH_CONFIG = 'AUTH_CONFIG';
export const JWKS_RESOLVER = 'JWKS_RESOLVER';

/** L'authentification n'est pas configurée (KEYCLOAK_ISSUER absent) : échec fermé. */
export class AuthNonConfigureeError extends Error {}
/** Les clés de Keycloak sont injoignables : on ne peut ni accepter ni rejeter le jeton avec certitude. */
export class IdentiteIndisponibleError extends Error {}
/** Le jeton est refusé (signature, expiration, émetteur, client, type…). */
export class JetonInvalideError extends Error {}

@Injectable()
export class TokenVerifierService {
  private readonly cles: JWTVerifyGetKey | null;

  constructor(
    @Inject(AUTH_CONFIG) private readonly config: ConfigAuth | null,
    @Optional() @Inject(JWKS_RESOLVER) resolveur?: JWTVerifyGetKey,
  ) {
    this.cles =
      resolveur ??
      (config
        ? createRemoteJWKSet(new URL(config.jwksUrl), {
            timeoutDuration: 5000,
            cooldownDuration: 30000,
          })
        : null);
  }

  async verifier(jeton: string): Promise<Identite> {
    if (!this.config || !this.cles) throw new AuthNonConfigureeError();

    let payload;
    try {
      ({ payload } = await jwtVerify(jeton, this.cles, {
        issuer: this.config.issuer,
        // Algorithme imposé : refuse « none » et la confusion RS256 → HS256.
        algorithms: ['RS256'],
        clockTolerance: 5,
        requiredClaims: ['exp', 'iat', 'sub'],
      }));
    } catch (e) {
      // Toute erreur de jose sauf l'expiration du délai réseau = jeton refusé.
      if (e instanceof errors.JOSEError && !(e instanceof errors.JWKSTimeout))
        throw new JetonInvalideError(e.code);
      throw new IdentiteIndisponibleError('Clés Keycloak injoignables');
    }

    // Le jeton d'accès Keycloak porte typ = « Bearer » : on refuse jeton d'identité et de rafraîchissement.
    if (payload.typ !== 'Bearer') throw new JetonInvalideError('typ');
    // Jeton émis pour un autre client que le frontend SHIKU : refusé.
    if (payload.azp !== this.config.clientId) throw new JetonInvalideError('azp');
    if (typeof payload.sub !== 'string' || payload.sub === '') throw new JetonInvalideError('sub');

    const brut = (payload.realm_access as { roles?: unknown } | undefined)?.roles;
    const roles = Array.isArray(brut) ? [...new Set(brut.filter(estRole))] : [];
    const texte = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
    return {
      sub: payload.sub,
      identifiant: texte(payload.preferred_username),
      nom: texte(payload.name),
      email: texte(payload.email),
      roles,
    };
  }
}
