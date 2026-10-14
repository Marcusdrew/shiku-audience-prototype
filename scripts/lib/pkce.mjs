// Aide commune aux scripts de vérification : connexion « code d'autorisation + PKCE (S256) » contre le
// Keycloak local, sans navigateur. Ne prouve PAS qu'un vrai navigateur sait le faire.
import { createHash, randomBytes } from 'node:crypto';

export const API = `http://localhost:${process.env.APP_PORT ?? '3000'}`;
export const lire = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

const port = process.env.KEYCLOAK_PORT ?? '8080';
const BASE = `http://localhost:${port}/realms/shiku`;
const CLIENT = 'shiku-web';
const REDIR = 'http://localhost:5173/callback';

export const comptes = {
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

export async function connecter(utilisateur, motDePasse, { pkce = true } = {}) {
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

export async function echanger(code, verifier) {
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


