import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';

/**
 * Faux Keycloak MINIMAL pour tester le CLIENT du compte de service (jetons, appels, compensation).
 * Ce n'est PAS une preuve de compatibilité avec Keycloak : celle-ci est faite par
 * scripts/verifier-parcours.mjs contre un vrai Keycloak. Il imite seulement les routes utilisées.
 */
export const SECRET_ESSAI = 'secret-de-test-pas-un-vrai-secret';
export const ROLES_KC = ['reception', 'assistant', 'authority', 'administrator'];

export interface FauxKeycloak {
  url: string; // fixée après l'écoute du serveur (port attribué par le système)
  readonly utilisateurs: Map<string, { courriel: string; roles: string[] }>;
  readonly appels: { methode: string; chemin: string; autorisation: string | undefined }[];
  readonly jetonsEmis: Set<string>;
  /** Impose le `sub` du prochain compte créé (pour provoquer un conflit côté base). */
  prochainSub: string | null;
  indisponible: boolean;
  fermer(): Promise<void>;
}

const corps = async (req: IncomingMessage): Promise<string> => {
  const morceaux: Buffer[] = [];
  for await (const m of req) morceaux.push(m as Buffer);
  return Buffer.concat(morceaux).toString('utf8');
};

export async function demarrerFauxKeycloak(): Promise<FauxKeycloak> {
  const etat: FauxKeycloak = {
    url: '',
    utilisateurs: new Map(),
    appels: [],
    jetonsEmis: new Set(),
    prochainSub: null,
    indisponible: false,
    fermer: async () => undefined,
  };
  const serveur: Server = createServer((req, res) => {
    void (async () => {
      const chemin = (req.url ?? '').split('?')[0]!;
      const methode = req.method ?? 'GET';
      const autorisation = req.headers.authorization;
      etat.appels.push({ methode, chemin, autorisation });
      const json = (statut: number, valeur?: unknown, entetes: Record<string, string> = {}) => {
        res.writeHead(statut, { 'content-type': 'application/json', ...entetes });
        res.end(valeur === undefined ? undefined : JSON.stringify(valeur));
      };
      if (etat.indisponible) return json(503, { error: 'panne simulée' });
      const texte = await corps(req);

      if (chemin === '/realms/shiku/protocol/openid-connect/token') {
        const p = new URLSearchParams(texte);
        if (
          p.get('grant_type') !== 'client_credentials' ||
          p.get('client_id') !== 'shiku-service' ||
          p.get('client_secret') !== SECRET_ESSAI
        )
          return json(401, { error: 'unauthorized_client' });
        const jeton = `jeton-service-${randomUUID()}`;
        etat.jetonsEmis.add(jeton);
        return json(200, { access_token: jeton, expires_in: 300 });
      }
      const jeton = autorisation?.replace(/^Bearer /, '');
      if (!jeton || !etat.jetonsEmis.has(jeton)) return json(401, { error: 'jeton inconnu' });

      const base = '/admin/realms/shiku';
      if (methode === 'POST' && chemin === `${base}/users`) {
        const u = JSON.parse(texte) as { email: string };
        for (const x of etat.utilisateurs.values()) if (x.courriel === u.email) return json(409);
        const sub = etat.prochainSub ?? randomUUID();
        etat.prochainSub = null;
        etat.utilisateurs.set(sub, { courriel: u.email, roles: [] });
        return json(201, undefined, { location: `${etat.url}${base}/users/${sub}` });
      }
      const m = chemin.match(/^\/admin\/realms\/shiku\/users\/([^/]+)(\/.*)?$/);
      if (m) {
        const sub = m[1]!;
        const u = etat.utilisateurs.get(sub);
        const reste = m[2] ?? '';
        if (methode === 'GET' && reste === '') return u ? json(200, { id: sub }) : json(404);
        if (methode === 'DELETE' && reste === '') {
          etat.utilisateurs.delete(sub);
          return json(204);
        }
        if (!u) return json(404);
        if (methode === 'GET' && reste === '/role-mappings/realm/available')
          return json(
            200,
            ROLES_KC.map((name) => ({ id: randomUUID(), name })),
          );
        if (methode === 'POST' && reste === '/role-mappings/realm') {
          for (const r of JSON.parse(texte) as { name: string }[]) u.roles.push(r.name);
          return json(204);
        }
      }
      return json(404, { error: `route non prévue : ${methode} ${chemin}` });
    })();
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  const adresse = serveur.address();
  etat.url = `http://127.0.0.1:${typeof adresse === 'object' && adresse ? adresse.port : 0}`;
  etat.fermer = () => new Promise<void>((ok) => serveur.close(() => ok()));
  return etat;
}
