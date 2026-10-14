export interface ConfigAuth {
  /** Valeur exacte attendue dans la revendication `iss` (adresse de Keycloak VUE PAR LE NAVIGATEUR). */
  readonly issuer: string;
  /** Adresse où le BACKEND lit les clés publiques (peut différer de l'émetteur, ex. réseau Docker). */
  readonly jwksUrl: string;
  /** Client Keycloak pour lequel le jeton doit avoir été émis (revendication `azp`). */
  readonly clientId: string;
}

/**
 * Lit la configuration depuis l'environnement. Renvoie `null` si l'émetteur n'est pas configuré :
 * le backend refuse alors toute route protégée (échec fermé, 503) au lieu d'accepter des jetons.
 * Aucun secret : le client `shiku-web` est public.
 */
export function lireConfigAuth(env: NodeJS.ProcessEnv): ConfigAuth | null {
  const issuer = env.KEYCLOAK_ISSUER?.trim().replace(/\/+$/, '');
  if (!issuer) return null;
  new URL(issuer); // échoue au démarrage si l'adresse est malformée
  const jwksUrl = env.KEYCLOAK_JWKS_URL?.trim() || `${issuer}/protocol/openid-connect/certs`;
  new URL(jwksUrl);
  return { issuer, jwksUrl, clientId: env.AUTH_CLIENT_ID?.trim() || 'shiku-web' };
}
