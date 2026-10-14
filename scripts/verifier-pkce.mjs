// Vérifie le flux « code d'autorisation + PKCE (S256) » contre le Keycloak local, sans navigateur.
// Usage : node --env-file=.env scripts/verifier-pkce.mjs
// Ce script joue le rôle d'un client web : il ne prouve PAS qu'un vrai frontend sait le faire
// (le frontend n'existe pas encore, DEC-28) ni que le backend valide les jetons (stories suivantes).
import { createHash, randomBytes } from 'node:crypto';

const port = process.env.KEYCLOAK_PORT ?? '8080';
const BASE = `http://localhost:${port}/realms/shiku`;
const CLIENT = 'shiku-web';
const REDIR = 'http://localhost:5173/callback';

const comptes = {
  'reception.test': ['KC_PASSWORD_RECEPTION', 'reception'],
  'assistant1.test': ['KC_PASSWORD_ASSISTANT1', 'assistant'],
  'assistant2.test': ['KC_PASSWORD_ASSISTANT2', 'assistant'],
  'authority.test': ['KC_PASSWORD_AUTHORITY', 'authority'],
  'admin.test': ['KC_PASSWORD_ADMIN', 'administrator'],
};

const b64url = (buf) => buf.toString('base64url');

/** Session HTTP minimale : garde les cookies à la main et ne suit pas les redirections. */
function session() {
  const cookies = new Map();
  return async (url, init = {}) => {
    const headers = { ...(init.headers ?? {}) };
    if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const r = await fetch(url, { ...init, headers, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) {
      const [kv] = sc.split(';');
      const i = kv.indexOf('=');
      cookies.set(kv.slice(0, i), kv.slice(i + 1));
    }
    return r;
  };
}

const formulaire = (obj) => new URLSearchParams(obj).toString();
const form = { 'content-type': 'application/x-www-form-urlencoded' };

async function connecter(utilisateur, motDePasse, { pkce = true } = {}) {
  const http = session();
  const verifier = b64url(randomBytes(48));
  const q = {
    client_id: CLIENT,
    redirect_uri: REDIR,
    response_type: 'code',
    scope: 'openid',
    state: 'etat',
    nonce: 'nonce',
  };
  if (pkce) {
    q.code_challenge = b64url(createHash('sha256').update(verifier).digest());
    q.code_challenge_method = 'S256';
  }
  const r1 = await http(`${BASE}/protocol/openid-connect/auth?${formulaire(q)}`);
  if (r1.status !== 200) return { etape: 'auth', statut: r1.status };
  const action = (await r1.text()).match(/action="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
  if (!action) return { etape: 'formulaire' };
  const r2 = await http(action, {
    method: 'POST',
    headers: form,
    body: formulaire({ username: utilisateur, password: motDePasse }),
  });
  const loc = r2.headers.get('location') ?? '';
  if (!loc.startsWith(REDIR)) return { etape: 'connexion', statut: r2.status };
  return { code: new URL(loc).searchParams.get('code'), verifier };
}

async function echanger(code, verifier) {
  const r = await fetch(`${BASE}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: form,
    body: formulaire({
      grant_type: 'authorization_code',
      client_id: CLIENT,
      code,
      redirect_uri: REDIR,
      code_verifier: verifier,
    }),
  });
  return { statut: r.status, corps: await r.json() };
}

const lire = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
let echec = false;
const verdict = (ok, texte) => {
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${texte}`);
  if (!ok) echec = true;
};

for (const [nom, [variable, roleAttendu]] of Object.entries(comptes)) {
  const mdp = process.env[variable];
  if (!mdp) {
    verdict(false, `${nom} : variable ${variable} absente (lancez bash scripts/init-local.sh)`);
    continue;
  }
  const c = await connecter(nom, mdp);
  if (!c.code) {
    verdict(false, `${nom} : connexion refusée à l'étape ${c.etape}`);
    continue;
  }
  const t = await echanger(c.code, c.verifier);
  const roles = t.statut === 200 ? (lire(t.corps.access_token).realm_access?.roles ?? []) : [];
  verdict(t.statut === 200 && roles.includes(roleAttendu), `${nom} : jeton obtenu, rôle ${roleAttendu}`);
}

const mdpR = process.env.KC_PASSWORD_RECEPTION ?? '';
const mauvais = await connecter('reception.test', 'mot-de-passe-faux');
verdict(mauvais.etape === 'connexion', 'un mauvais mot de passe est refusé');

const bon = await connecter('reception.test', mdpR);
const t2 = bon.code ? await echanger(bon.code, 'verifier-incorrect-'.padEnd(60, 'x')) : { statut: 0 };
verdict(t2.statut === 400, `un mauvais code_verifier est refusé (HTTP ${t2.statut})`);

const sans = await connecter('reception.test', mdpR, { pkce: false });
verdict(sans.etape === 'auth' || sans.statut === 302, 'une requête sans PKCE est refusée');

const direct = await fetch(`${BASE}/protocol/openid-connect/token`, {
  method: 'POST',
  headers: form,
  body: formulaire({ grant_type: 'password', client_id: CLIENT, username: 'reception.test', password: mdpR }),
});
verdict(direct.status >= 400, `le flux « mot de passe direct » est refusé (HTTP ${direct.status})`);

console.log(echec ? 'RESULTAT : ECHEC' : 'RESULTAT : TOUT OK');
process.exit(echec ? 1 : 0);
