import type { Role } from '../habilitation/roles.js';

/** Identité établie à partir d'un jeton dont la signature et les revendications ont été vérifiées. */
export interface Identite {
  readonly sub: string;
  readonly identifiant: string | null;
  readonly nom: string | null;
  readonly email: string | null;
  /** Rôles SHIKU reconnus uniquement ; tout autre rôle du jeton est ignoré. */
  readonly roles: readonly Role[];
}

/** Forme minimale de la requête HTTP utilisée par les gardes (indépendante d'Express). */
export interface RequeteAuthentifiee {
  headers: Record<string, string | string[] | undefined>;
  identite?: Identite;
}
