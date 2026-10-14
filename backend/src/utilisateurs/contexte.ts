import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Identite } from '../auth/identite.js';

/** Compte applicatif résolu pour la requête (jamais déduit du seul jeton). */
export interface Contexte {
  readonly utilisateurId: string;
  readonly organisationId: string;
  readonly identite: Identite;
}

export interface RequeteContexte {
  identite?: Identite;
  contexte?: Contexte;
}

export const ContexteCourant = createParamDecorator((_d: unknown, ec: ExecutionContext) => {
  const c = ec.switchToHttp().getRequest<RequeteContexte>().contexte;
  // Ne peut arriver que si une route a été déclarée sans passer par ContexteGuard : on échoue fermé.
  if (!c) throw new Error('Contexte applicatif absent : route non protégée par ContexteGuard.');
  return c;
});
