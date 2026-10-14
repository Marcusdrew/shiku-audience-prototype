import { appeler } from './client';

// Contrat réel : backend/src/sante/sante.controller.ts
// GET /sante -> 200 { statut: 'ok', base: 'ok' } ; 503 { statut: 'ko', base: 'injoignable' }
export interface Sante {
  statut: string;
  base: string;
}

export const lireSante = (signal?: AbortSignal) => appeler<Sante>('/sante', { signal });
