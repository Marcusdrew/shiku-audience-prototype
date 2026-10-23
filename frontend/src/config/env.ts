// Configuration lue au démarrage. Aucune de ces valeurs n'est secrète : le client Keycloak
// `shiku-web` est public (pas de secret, PKCE). Voir frontend/.env.example.
function lire(nom: string, defaut: string): string {
  const valeur = (import.meta.env[nom] as string | undefined)?.trim();
  return valeur ? valeur : defaut;
}

const keycloakUrl = lire('VITE_KEYCLOAK_URL', 'http://localhost:8080').replace(/\/+$/, '');
const realm = lire('VITE_KEYCLOAK_REALM', 'shiku');

export const env = {
  keycloakUrl,
  realm,
  authority: `${keycloakUrl}/realms/${realm}`,
  clientId: lire('VITE_KEYCLOAK_CLIENT_ID', 'shiku-web'),
  apiBaseUrl: lire('VITE_API_BASE_URL', '/api').replace(/\/+$/, ''),
  production: import.meta.env.PROD,
} as const;
