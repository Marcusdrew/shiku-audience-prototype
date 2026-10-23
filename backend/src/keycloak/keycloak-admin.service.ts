import { Injectable } from '@nestjs/common';

export const KEYCLOAK_ADMIN = 'KEYCLOAK_ADMIN';

/**
 * Compte de service Keycloak, réservé à l'application (décision de M. Jordan, 16/10/2026) :
 *  - un client confidentiel dédié, jamais utilisé pour se connecter ;
 *  - droits minimaux : gestion des utilisateurs et attribution des rôles, rien sur le realm ;
 *  - appelé SEULEMENT après que le serveur a vérifié le droit de l'Administrateur avec SON jeton ;
 *  - aucune action métier ne se fait sous cette identité : le journal garde l'Administrateur comme
 *    auteur, avec « via compte de service » en contexte.
 * Le secret vient de l'environnement, jamais du dépôt.
 */
export interface ConfigServiceKeycloak {
  readonly urlBase: string; // ex. http://keycloak:8080
  readonly realm: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

/** `null` si la configuration est absente ou incomplète : la gestion des comptes est alors refusée (503). */
export function lireConfigService(
  env: NodeJS.ProcessEnv = process.env,
): ConfigServiceKeycloak | null {
  const urlBase = env.KEYCLOAK_ADMIN_URL?.trim().replace(/\/+$/, '');
  const realm = env.KEYCLOAK_REALM?.trim();
  const clientId = env.KEYCLOAK_SERVICE_CLIENT_ID?.trim();
  const clientSecret = env.KEYCLOAK_SERVICE_CLIENT_SECRET?.trim();
  if (!urlBase || !realm || !clientId || !clientSecret) return null;
  return { urlBase, realm, clientId, clientSecret };
}

/** Keycloak injoignable, token refusé ou réponse inattendue : 503 côté API, sans détail interne. */
export class KeycloakIndisponibleError extends Error {
  constructor(message = 'Keycloak indisponible.') {
    super(message);
    this.name = 'KeycloakIndisponibleError';
  }
}
/** Le courriel ou l'identifiant existe déjà dans Keycloak. */
export class KeycloakConflitError extends Error {
  constructor() {
    super('Ce courriel est déjà utilisé dans Keycloak.');
    this.name = 'KeycloakConflitError';
  }
}

export interface NouvelUtilisateurKeycloak {
  readonly courriel: string;
  readonly prenom: string;
  readonly nom: string;
  readonly role: string;
}

const DELAI_MS = 5000;

@Injectable()
export class KeycloakAdminService {
  private jeton: { valeur: string; expireA: number } | null = null;

  constructor(private readonly config: ConfigServiceKeycloak | null) {}

  get configure(): boolean {
    return this.config !== null;
  }

  private exiger(): ConfigServiceKeycloak {
    if (!this.config)
      throw new KeycloakIndisponibleError('Compte de service Keycloak non configuré.');
    return this.config;
  }

  private async appeler(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(DELAI_MS) });
    } catch {
      throw new KeycloakIndisponibleError();
    }
  }

  private async obtenirJeton(): Promise<string> {
    const c = this.exiger();
    if (this.jeton && this.jeton.expireA > Date.now() + 30_000) return this.jeton.valeur;
    const r = await this.appeler(
      `${c.urlBase}/realms/${encodeURIComponent(c.realm)}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: c.clientId,
          client_secret: c.clientSecret,
        }),
      },
    );
    if (!r.ok) throw new KeycloakIndisponibleError('Compte de service Keycloak refusé.');
    const j = (await r.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof j.access_token !== 'string') throw new KeycloakIndisponibleError();
    const duree = typeof j.expires_in === 'number' ? j.expires_in : 60;
    this.jeton = { valeur: j.access_token, expireA: Date.now() + duree * 1000 };
    return j.access_token;
  }

  private async admin(chemin: string, init: RequestInit = {}): Promise<Response> {
    const c = this.exiger();
    const jeton = await this.obtenirJeton();
    return this.appeler(`${c.urlBase}/admin/realms/${encodeURIComponent(c.realm)}${chemin}`, {
      ...init,
      headers: {
        authorization: `Bearer ${jeton}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  }

  /** Le compte Keycloak existe-t-il ? (vérification du rattachement : le sub n'est jamais saisi à l'aveugle.) */
  async existe(sub: string): Promise<boolean> {
    const r = await this.admin(`/users/${encodeURIComponent(sub)}`);
    if (r.status === 200) return true;
    if (r.status === 404) return false;
    throw new KeycloakIndisponibleError();
  }

  /** Crée la personne dans Keycloak, sans mot de passe, et lui attribue UN rôle du realm. Retourne son `sub`. */
  async creerUtilisateur(u: NouvelUtilisateurKeycloak): Promise<string> {
    const r = await this.admin('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: u.courriel,
        email: u.courriel,
        firstName: u.prenom,
        lastName: u.nom,
        enabled: true,
        emailVerified: false,
        requiredActions: ['UPDATE_PASSWORD'],
      }),
    });
    if (r.status === 409) throw new KeycloakConflitError();
    if (r.status !== 201) throw new KeycloakIndisponibleError();
    const sub = r.headers.get('location')?.split('/').pop();
    if (!sub) throw new KeycloakIndisponibleError();
    try {
      // « disponibles » plutôt que GET /roles/{nom} : ce dernier exige view-realm, que le compte de
      // service n'a volontairement pas (aucun accès aux réglages du realm).
      const dispo = await this.admin(
        `/users/${encodeURIComponent(sub)}/role-mappings/realm/available`,
      );
      if (dispo.status !== 200) throw new KeycloakIndisponibleError();
      const liste = (await dispo.json()) as { name?: unknown }[];
      const rep = liste.find((x) => x.name === u.role);
      if (!rep) throw new KeycloakIndisponibleError(`Rôle Keycloak « ${u.role} » introuvable.`);
      const m = await this.admin(`/users/${encodeURIComponent(sub)}/role-mappings/realm`, {
        method: 'POST',
        body: JSON.stringify([rep]),
      });
      if (m.status !== 204) throw new KeycloakIndisponibleError();
    } catch (e) {
      await this.supprimer(sub); // pas de compte à moitié créé : sans rôle, il serait inutilisable
      throw e;
    }
    return sub;
  }

  /** Compensation : retire un compte créé par cette application quand l'enregistrement local échoue. */
  async supprimer(sub: string): Promise<void> {
    try {
      await this.admin(`/users/${encodeURIComponent(sub)}`, { method: 'DELETE' });
    } catch {
      /* au mieux : l'échec est déjà signalé à l'appelant */
    }
  }
}
