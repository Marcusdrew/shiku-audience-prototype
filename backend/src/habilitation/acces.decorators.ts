import { SetMetadata } from '@nestjs/common';

// Chaque route DOIT déclarer son régime d'accès. Une route sans déclaration est refusée (403).
export const ACCES = 'shiku:acces';

export type Acces =
  { type: 'public' } | { type: 'authentifie' } | { type: 'droit'; action: string };

/** Accessible sans jeton. À réserver aux routes techniques (ex. /sante). */
export const Public = () => SetMetadata(ACCES, { type: 'public' } satisfies Acces);

/**
 * Jeton vérifié requis, AUCUN droit métier accordé. Réservé aux routes qui ne renvoient que
 * l'identité vérifiée de l'appelant (ex. GET /moi).
 */
export const AuthentifieSeulement = () =>
  SetMetadata(ACCES, { type: 'authentifie' } satisfies Acces);

/** Jeton vérifié requis ET droit sur l'action, évalué côté serveur à chaque appel. */
export const ExigeDroit = (action: string) =>
  SetMetadata(ACCES, { type: 'droit', action } satisfies Acces);
