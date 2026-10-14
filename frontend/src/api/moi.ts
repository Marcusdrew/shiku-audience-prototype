import { appeler } from './client';

// Contrat réel : backend/src/auth/moi.controller.ts (GET /moi, jeton Bearer obligatoire).
// Identité et rôles issus d'un jeton VÉRIFIÉ par le backend. Cela ne vaut PAS droit métier.
export interface Moi {
  sub: string;
  identifiant: string | null;
  nom: string | null;
  email: string | null;
  roles: string[];
}

export const lireMoi = (jeton: string | null, signal?: AbortSignal) =>
  appeler<Moi>('/moi', { jeton, signal });
