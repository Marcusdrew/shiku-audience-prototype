import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { env } from '../config/env';

// Authorization Code + PKCE (S256) : oidc-client-ts génère le code_challenge pour tout client public.
// Aucun client_secret. Les jetons restent en sessionStorage (vidés à la fermeture de l'onglet).
export const userManager = new UserManager({
  authority: env.authority,
  client_id: env.clientId,
  redirect_uri: `${window.location.origin}/callback`,
  post_logout_redirect_uri: `${window.location.origin}/`,
  response_type: 'code',
  scope: 'openid profile email',
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: true,
  // Pas de iframe : le renouvellement passe par le jeton de rafraîchissement.
  silent_redirect_uri: undefined,
});
