// Les quatre rôles du realm Keycloak `shiku` (infra/keycloak/realm-shiku.json).
// Le Protocole n'est PAS un rôle : c'est un profil de délégation (D04-24), absent du jeton.
export const ROLES = ['reception', 'assistant', 'authority', 'administrator'] as const;
export type Role = (typeof ROLES)[number];

// Arbitrage de M. Jordan du 19/10/2026 (point 2) : l'Administrateur n'attribue QUE ces rôles.
// Autorité, Administrateur et profil de délégation passent par l'autorisation de l'Autorité (non développé).
export const ROLES_ATTRIBUABLES_PAR_ADMINISTRATEUR = ['reception', 'assistant'] as const;

export function estRole(valeur: unknown): valeur is Role {
  return typeof valeur === 'string' && (ROLES as readonly string[]).includes(valeur);
}

// Profils qui n'ont un droit que par délégation (colonne « D » de la matrice). Le Protocole n'est
// jamais un rôle du jeton (D04-24) ; l'Assistant et l'Administrateur peuvent l'être ou le recevoir.
export const PROFILS_DELEGUES = ['assistant', 'protocole', 'administrator'] as const;
export type ProfilDelegue = (typeof PROFILS_DELEGUES)[number];
