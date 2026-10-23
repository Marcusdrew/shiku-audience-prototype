import { estRole, PROFILS_DELEGUES, type ProfilDelegue, type Role } from './roles.js';

// Matrice « action → rôles autorisés ». Données de configuration versionnées, jamais de logique.
//
// STATUT : `OFFICIELLE` exige de citer le document source dans `reference` (matrice Gate 02A).
// `HYPOTHESE` reste possible pour les matrices d'essai des tests.

export interface DefinitionAction {
  /** Rôles autorisés (P ou L). Liste vide = personne (action non attribuée, donc refusée à tous). */
  readonly roles: readonly Role[];
  /** Profils qui n'ont l'action que PAR DÉLÉGATION (D). Jamais autorisés tant qu'aucune délégation n'existe. */
  readonly delegues?: readonly ProfilDelegue[];
  /** Ce que signifie le « L » (accès limité) ou la condition de la matrice. */
  readonly limites?: string;
  /** Renseigné si l'action ne figure PAS dans la matrice officielle : identifiant de l'hypothèse. */
  readonly hypothese?: string;
  /** Une route du backend exécute-t-elle cette action ? (false : prévue par la matrice, non développée) */
  readonly implementee?: boolean;
  /** D'où vient la règle (story, décision, document). Obligatoire : aucune règle sans source. */
  readonly source: string;
  readonly remarque?: string;
}

export interface Matrice {
  readonly statut: 'HYPOTHESE' | 'OFFICIELLE';
  readonly reference: string;
  readonly actions: Readonly<Record<string, DefinitionAction>>;
}

export class MatriceInvalideError extends Error {
  constructor(message: string) {
    super(`Matrice d'habilitation invalide : ${message}`);
    this.name = 'MatriceInvalideError';
  }
}

const NOM_ACTION = /^[a-z][a-z_]*\.[a-z][a-z_]*$/;

/** Valide la structure au démarrage : une matrice malformée empêche le démarrage (échec fermé). */
export function validerMatrice(brut: unknown): Matrice {
  if (typeof brut !== 'object' || brut === null) throw new MatriceInvalideError('objet attendu');
  const m = brut as Record<string, unknown>;
  if (m.statut !== 'HYPOTHESE' && m.statut !== 'OFFICIELLE')
    throw new MatriceInvalideError('statut doit valoir HYPOTHESE ou OFFICIELLE');
  if (typeof m.reference !== 'string' || m.reference.trim() === '')
    throw new MatriceInvalideError('reference manquante');
  if (m.statut === 'OFFICIELLE' && /hypoth/i.test(m.reference))
    throw new MatriceInvalideError('une matrice OFFICIELLE doit citer son document source');
  if (typeof m.actions !== 'object' || m.actions === null || Array.isArray(m.actions))
    throw new MatriceInvalideError('actions manquantes');

  for (const [nom, def] of Object.entries(m.actions)) {
    if (!NOM_ACTION.test(nom))
      throw new MatriceInvalideError(`nom d'action « ${nom} » invalide (attendu : objet.verbe)`);
    const d = def as Record<string, unknown> | null;
    if (typeof d !== 'object' || d === null)
      throw new MatriceInvalideError(`action « ${nom} » : définition manquante`);
    if (!Array.isArray(d.roles))
      throw new MatriceInvalideError(`action « ${nom} » : roles manquants`);
    for (const r of d.roles)
      if (!estRole(r))
        throw new MatriceInvalideError(`action « ${nom} » : rôle inconnu « ${String(r)} »`);
    if (new Set(d.roles).size !== d.roles.length)
      throw new MatriceInvalideError(`action « ${nom} » : rôle en double`);
    if (d.delegues !== undefined) {
      if (!Array.isArray(d.delegues))
        throw new MatriceInvalideError(`action « ${nom} » : delegues doit être une liste`);
      for (const p of d.delegues)
        if (!(PROFILS_DELEGUES as readonly unknown[]).includes(p))
          throw new MatriceInvalideError(
            `action « ${nom} » : profil délégué inconnu « ${String(p)} »`,
          );
      for (const p of d.delegues)
        if ((d.roles as unknown[]).includes(p))
          throw new MatriceInvalideError(
            `action « ${nom} » : « ${String(p)} » ne peut être à la fois permis (P) et délégué (D)`,
          );
    }
    if (typeof d.source !== 'string' || d.source.trim() === '')
      throw new MatriceInvalideError(`action « ${nom} » : source manquante`);
  }
  return brut as Matrice;
}
