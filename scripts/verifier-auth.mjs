// Vérifie, contre un VRAI Keycloak et le VRAI backend lancés, que le backend :
//  - laisse /sante publique, refuse /moi sans jeton valide, accepte les vrais jetons ;
//  - renvoie l'identité et les rôles issus du jeton vérifié (et seulement eux) ;
//  - rejette un jeton falsifié, un id_token, un refresh_token.
// Usage : node --env-file=.env scripts/verifier-auth.mjs   (après `docker compose up --build -d`)
// NON couvert ici (couvert seulement par les tests automatisés avec de fausses clés) :
// jeton expiré, mauvais client, refus par défaut d'une route non déclarée.
import { API, comptes, connecter, echanger, lire } from './lib/pkce.mjs';

let echec = false;
const verdict = (ok, texte) => {
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${texte}`);
  if (!ok) echec = true;
};
const api = (chemin, jeton) =>
  fetch(`${API}${chemin}`, { headers: jeton ? { authorization: `Bearer ${jeton}` } : {} });

const s = await api('/sante');
verdict(s.status !== 401 && s.status !== 403, `/sante est public (HTTP ${s.status}, 200 ou 503 selon la base)`);
verdict((await api('/moi')).status === 401, '/moi sans jeton : 401');
verdict((await api('/moi', 'n-importe-quoi')).status === 401, '/moi avec un jeton illisible : 401');

let reception = null;
for (const [nom, [variable, roleAttendu]] of Object.entries(comptes)) {
  const mdp = process.env[variable];
  if (!mdp) {
    verdict(false, `${nom} : variable ${variable} absente (lancez bash scripts/init-local.sh)`);
    continue;
  }
  const c = await connecter(nom, mdp);
  const t = c.code ? await echanger(c.code, c.verifier) : { statut: 0, corps: {} };
  if (t.statut !== 200) {
    verdict(false, `${nom} : jeton non obtenu`);
    continue;
  }
  const at = t.corps.access_token;
  const r = await api('/moi', at);
  const corps = r.status === 200 ? await r.json() : {};
  verdict(
    r.status === 200 &&
      corps.sub === lire(at).sub &&
      corps.roles?.length === 1 &&
      corps.roles[0] === roleAttendu,
    `${nom} : /moi 200, sub identique au jeton, rôle ${roleAttendu} (HTTP ${r.status})`,
  );
  if (nom === 'reception.test') reception = t.corps;
}

if (reception) {
  const [h, p, sig] = reception.access_token.split('.');
  const charge = lire(reception.access_token);
  charge.realm_access = { roles: ['administrator'] };
  const falsifie = `${h}.${Buffer.from(JSON.stringify(charge)).toString('base64url')}.${sig}`;
  verdict((await api('/moi', falsifie)).status === 401, 'jeton dont les rôles ont été falsifiés : 401');
  verdict((await api('/moi', reception.id_token)).status === 401, 'id_token utilisé comme jeton d\'accès : 401');
  if (reception.refresh_token) {
    verdict((await api('/moi', reception.refresh_token)).status === 401, 'refresh_token utilisé comme jeton d\'accès : 401');
  }
}

console.log(echec ? 'RESULTAT : ECHEC' : 'RESULTAT : TOUT OK');
process.exit(echec ? 1 : 0);
