import { env } from '../config/env';

export class ApiError extends Error {
  readonly statut: number | null;
  /** Détail par champ renvoyé par le serveur pour une validation refusée (400). */
  readonly details: string[];
  /** Corps JSON de la réponse refusée, pour les cas structurés (ex. doublon de visiteur, 409). */
  readonly corps: unknown;
  constructor(
    message: string,
    statut: number | null,
    details: string[] = [],
    corps: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statut = statut;
    this.details = details;
    this.corps = corps;
  }
}

export interface OptionsRequete {
  methode?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  corps?: unknown;
  /** Jeton d'accès à transmettre (Authorization: Bearer). À fournir seulement si la route l'exige. */
  jeton?: string | null;
  signal?: AbortSignal;
}

function messageHttp(statut: number): string {
  if (statut === 401) return 'Session non reconnue par le serveur (401).';
  if (statut === 403) return 'Action refusée : droit insuffisant (403).';
  if (statut === 404) return 'Ressource introuvable (404).';
  if (statut === 503) return 'Service indisponible (503).';
  if (statut >= 500) return `Erreur du serveur (${statut}).`;
  return `Requête refusée (${statut}).`;
}

/** Appel JSON vers l'API. Toute erreur réseau ou HTTP devient une ApiError. */
export async function appeler<T>(chemin: string, options: OptionsRequete = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.corps !== undefined) headers['Content-Type'] = 'application/json';
  if (options.jeton) headers.Authorization = `Bearer ${options.jeton}`;

  let reponse: Response;
  try {
    reponse = await fetch(`${env.apiBaseUrl}${chemin}`, {
      method: options.methode ?? 'GET',
      headers,
      body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
      signal: options.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError('API injoignable (réseau ou serveur arrêté).', null);
  }

  if (!reponse.ok) {
    // Le backend renvoie un message métier lisible pour 400, 403 et 409 : on l'affiche tel quel.
    const corps: unknown = await reponse.json().catch(() => null);
    const message =
      corps && typeof corps === 'object' && 'message' in corps && typeof corps.message === 'string'
        ? corps.message
        : null;
    const erreurs =
      corps && typeof corps === 'object' && 'erreurs' in corps && Array.isArray(corps.erreurs)
        ? (corps.erreurs as { champ?: unknown; message?: unknown }[]).map(
            (e) => `${String(e.champ)} : ${String(e.message)}`,
          )
        : [];
    const lisible = [400, 403, 409].includes(reponse.status) && message;
    throw new ApiError(
      lisible ? message : messageHttp(reponse.status),
      reponse.status,
      erreurs,
      corps,
    );
  }
  if (reponse.status === 204) return undefined as T;
  try {
    return (await reponse.json()) as T;
  } catch {
    throw new ApiError('Réponse du serveur illisible (JSON attendu).', reponse.status);
  }
}
