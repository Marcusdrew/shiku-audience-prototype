// Parcours métier COMPLET contre le vrai Keycloak, le vrai backend et la vraie base :
// connexion PKCE de 4 comptes de test → agenda → visiteur → demande → qualification → décision →
// planification → démarrage → fin → clôture (refusée, H4) → chaîne et journal.
// Usage : node --env-file=.env scripts/verifier-parcours.mjs
// Prérequis : `docker compose up --build -d`, puis `node --env-file=.env scripts/amorcer-donnees-test.mjs`.
// Crée des données FICTIVES (préfixe « PARCOURS ») qui restent en base : le journal est en ajout seul.
import { API, comptes, connecter, echanger } from './lib/pkce.mjs';

let echec = false;
const verdict = (ok, texte) => {
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${texte}`);
  if (!ok) echec = true;
};

const jetons = {};
for (const [nom, [variable, role]] of Object.entries(comptes)) {
  const c = await connecter(nom, process.env[variable] ?? '');
  const t = c.code ? await echanger(c.code, c.verifier) : { statut: 0, corps: {} };
  if (t.statut !== 200) {
    verdict(false, `${nom} : connexion impossible`);
    process.exit(1);
  }
  jetons[role] = t.corps.access_token; // le dernier compte d'un même rôle l'emporte (assistant2)
}

async function appel(qui, methode, chemin, corps) {
  const r = await fetch(`${API}${chemin}`, {
    method: methode,
    headers: {
      authorization: `Bearer ${jetons[qui]}`,
      ...(corps === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const t = await r.text();
  return { statut: r.status, corps: t ? JSON.parse(t) : {} };
}
const attendre = (ok, texte, r) => verdict(ok, `${texte} (HTTP ${r.statut})`);
const refuse = async (promesse, texte) => {
  const r = await promesse;
  attendre(r.statut === 403, texte, r);
};

const moi = await appel('reception', 'GET', '/moi');
attendre(moi.statut === 200, '/moi : identité vérifiée', moi);

const agendas = await appel('reception', 'GET', '/agendas');
attendre(agendas.statut === 200 && agendas.corps.elements?.length > 0, 'la réception liste les agendas (amorçage fait)', agendas);
if (agendas.statut !== 200 || !agendas.corps.elements?.length) {
  console.log('Lancez d’abord : node --env-file=.env scripts/amorcer-donnees-test.mjs');
  process.exit(1);
}
const agendaId = agendas.corps.elements[0].id;

const nom = `PARCOURS ${new Date().toISOString()}`;
const v = await appel('assistant', 'POST', '/visiteurs', { nom_complet: nom, contact: 'parcours@exemple.invalid' });
attendre(v.statut === 201, 'l’assistant crée un visiteur fictif', v);
await refuse(appel('reception', 'POST', '/visiteurs', { nom_complet: 'x' }), 'la réception ne peut pas créer de visiteur (DEC-19 ouverte)');

const d = await appel('reception', 'POST', '/demandes', { visiteur_id: v.corps.id, agenda_id: agendaId, objet: 'Parcours de vérification (fictif)', contact: 'parcours@exemple.invalid' });
attendre(d.statut === 201 && /^DEM-\d{4}-\d{6}$/.test(d.corps.reference ?? ''), `la réception crée la demande ${d.corps.reference}`, d);
const id = d.corps.id;
await refuse(appel('assistant', 'POST', '/demandes', {}), 'l’assistant ne crée pas de demande (403)');

const q = await appel('reception', 'POST', `/demandes/${id}/qualification`, { qualification: 'Recevable (fictif)' });
attendre(q.statut === 200 && q.corps.statut === 'qualifiee', 'la réception qualifie la demande', q);
await refuse(appel('reception', 'POST', `/demandes/${id}/decision`, { type: 'valider', motif: 'non' }), 'la réception ne peut pas décider (403)');

const f = await appel('authority', 'GET', '/decisions/file');
attendre(f.statut === 200 && f.corps.elements.some((e) => e.id === id), 'l’autorité voit la demande dans la file de décisions', f);
const dec = await appel('authority', 'POST', `/demandes/${id}/decision`, { type: 'valider', motif: 'Accord de principe (fictif)' });
attendre(dec.statut === 201 && dec.corps.statut_demande === 'validee', 'l’autorité valide', dec);

const a = await appel('assistant', 'POST', '/audiences', { demande_id: id, debut_prevu: '2026-12-01T09:00:00Z', duree_prevue_minutes: 30 });
attendre(a.statut === 201 && a.corps.statut === 'planifiee', 'l’assistant planifie l’audience', a);
const aid = a.corps.id;
const dm = await appel('assistant', 'POST', `/audiences/${aid}/demarrer`);
attendre(dm.statut === 200 && dm.corps.statut === 'en_cours', 'l’assistant démarre l’audience', dm);
const tm = await appel('assistant', 'POST', `/audiences/${aid}/terminer`, { resultat: 'Entretien tenu (fictif)' });
attendre(tm.statut === 200 && tm.corps.statut === 'terminee', 'l’assistant termine l’audience et enregistre le résultat', tm);
for (const qui of ['reception', 'assistant', 'authority', 'administrator']) {
  const c = await appel(qui, 'POST', `/audiences/${aid}/cloturer`);
  attendre(c.statut === 403, `clôture refusée à ${qui} (H4 : responsable non désigné)`, c);
}

const det = await appel('authority', 'GET', `/demandes/${id}`);
attendre(det.statut === 200 && det.corps.decisions?.length === 1 && det.corps.audience?.id === aid, 'la chaîne demande → décision → audience est restituée', det);
const j = await appel('authority', 'GET', `/journal?objet_type=demande&objet_id=${id}`);
const actions = (j.corps.elements ?? []).map((e) => e.action).reverse();
attendre(j.statut === 200 && actions.join() === 'demande.creer,demande.qualifier_initialement,decision.valider', `le journal retrace les actes : ${actions.join(' → ')}`, j);
await refuse(appel('assistant', 'GET', '/journal'), 'l’assistant ne lit pas le journal (H9)');

console.log(echec ? 'RESULTAT : ECHEC' : 'RESULTAT : TOUT OK');
process.exit(echec ? 1 : 0);
