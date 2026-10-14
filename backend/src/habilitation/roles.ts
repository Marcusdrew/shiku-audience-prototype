// Les quatre rôles du realm Keycloak `shiku` (infra/keycloak/realm-shiku.json).
// Le Protocole n'est PAS un rôle : c'est un profil de délégation (D04-24), absent du jeton.
export const ROLES = ['reception', 'assistant', 'authority', 'administrator'] as const;
export type Role = (typeof ROLES)[number];

export function estRole(valeur: unknown): valeur is Role {
  return typeof valeur === 'string' && (ROLES as readonly string[]).includes(valeur);
}
