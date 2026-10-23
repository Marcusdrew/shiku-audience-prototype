// Rôles du realm `shiku` (infra/keycloak/realm-shiku.json). Le Protocole n'est PAS un rôle du
// realm : c'est un profil de délégation (D04-24), non porté par le jeton à ce stade.
export const ROLES = ['reception', 'assistant', 'authority', 'administrator'] as const;
export type Role = (typeof ROLES)[number];

export const LIBELLES_ROLES: Record<Role, string> = {
  reception: 'Réception',
  assistant: 'Assistant',
  authority: 'Autorité',
  administrator: 'Administrateur',
};

function estRole(valeur: unknown): valeur is Role {
  return typeof valeur === 'string' && (ROLES as readonly string[]).includes(valeur);
}

/**
 * Lit les rôles dans le jeton d'accès SANS vérifier sa signature. Usage strictement limité à
 * l'affichage (menu, libellés). Ce n'est PAS un contrôle d'accès : le backend doit valider le jeton
 * et décider (CONTRIBUTING § 4.1) ; il ne le fait pas encore.
 */
export function rolesDepuisJeton(jeton: string | undefined): Role[] {
  if (!jeton) return [];
  try {
    const charge = jeton.split('.')[1];
    if (!charge) return [];
    const base64 = charge.replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) =>
        c.charCodeAt(0),
      ),
    );
    const donnees = JSON.parse(json) as { realm_access?: { roles?: unknown } };
    const roles = donnees.realm_access?.roles;
    return Array.isArray(roles) ? roles.filter(estRole) : [];
  } catch {
    return [];
  }
}
