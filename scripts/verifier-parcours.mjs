// Parcours métier COMPLET contre le vrai Keycloak, le vrai backend et la vraie base :
// connexion PKCE de 4 comptes de test → agenda → visiteur → demande → qualification → décision →
// planification (Autorité) → démarrage → fin → clôture (Assistant) → chaîne et journal,
// puis création d'un compte par l'Administrateur via le compte de service Keycloak.
// Usage : node --env-file=.env scripts/verifier-parcours.mjs
// Prérequis : `docker compose up --build -d`, puis `node --env-file=.env scripts/amorcer-donnees-test.mjs`.
// Crée des données FICTIVES (préfixe « PARCOURS ») qui restent en base : le journal est en ajout seul.
import { API, comptes, connecter, echanger } from "./lib/pkce.mjs";

let echec = false;
const verdict = (ok, texte) => {
  console.log(`${ok ? "OK  " : "ECHEC"} ${texte}`);
  if (!ok) echec = true;
};

const jetons = {};
for (const [nom, [variable, role]] of Object.entries(comptes)) {
  if (!process.env[variable]) {
    verdict(false, `${nom} : variable ${variable} absente ou vide dans .env`);
    process.exit(1);
  }
  const c = await connecter(nom, process.env[variable]);
  const t = c.code
    ? await echanger(c.code, c.verifier)
    : { statut: 0, corps: {} };
  if (t.statut !== 200) {
    const detail =
      c.motif ??
      `étape « ${c.etape ?? "échange du code"} »${c.statut ? `, HTTP ${c.statut}` : ""}`;
    verdict(false, `${nom} : connexion impossible : ${detail}`);
    if (c.motif?.startsWith("identifiant"))
      console.log(
        "Diagnostic : node --env-file=.env scripts/aligner-comptes-test.mjs (simulation ; ne lance pas ce parcours en boucle : le realm bloque après plusieurs échecs).",
      );
    process.exit(1);
  }
  jetons[role] = t.corps.access_token; // le dernier compte d'un même rôle l'emporte (assistant2)
}

async function appel(qui, methode, chemin, corps) {
  const r = await fetch(`${API}${chemin}`, {
    method: methode,
    headers: {
      authorization: `Bearer ${jetons[qui]}`,
      ...(corps === undefined ? {} : { "content-type": "application/json" }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const t = await r.text();
  return { statut: r.status, corps: t ? JSON.parse(t) : {} };
}
const attendre = (ok, texte, r) => verdict(ok, `${texte} (HTTP ${r.statut})`);
const refuse = async (promesse, texte, statut = 403) => {
  const r = await promesse;
  attendre(r.statut === statut, texte, r);
};

const moi = await appel("reception", "GET", "/moi");
attendre(moi.statut === 200, "/moi : identité vérifiée", moi);

const agendas = await appel("reception", "GET", "/agendas");
attendre(
  agendas.statut === 200 && agendas.corps.elements?.length > 0,
  "la réception liste les agendas (amorçage fait)",
  agendas,
);
if (agendas.statut !== 200 || !agendas.corps.elements?.length) {
  console.log(
    "Lancez d’abord : node --env-file=.env scripts/amorcer-donnees-test.mjs",
  );
  process.exit(1);
}
// DEC-32 : l'agenda du parcours doit être rattaché (et en vigueur) à l'Autorité de test.
const agendasAutorite = await appel("authority", "GET", "/agendas");
const rattache = agendasAutorite.corps.elements?.find((a) =>
  a.rattachements?.some((r) => r.est_moi && r.en_vigueur),
);
attendre(
  Boolean(rattache),
  "un agenda est rattaché à l’Autorité de test (DEC-32, amorçage fait)",
  agendasAutorite,
);
if (!rattache) {
  console.log(
    "Relancez : node --env-file=.env scripts/amorcer-donnees-test.mjs (rattachement initial)",
  );
  process.exit(1);
}
const agendaId = rattache.id;
const autoriteId = rattache.rattachements.find((r) => r.est_moi).autorite_id;

const horodatage = new Date().toISOString();
const nom = `PARCOURS ${horodatage}`;
// Contacts propres à chaque lancement : le serveur refuse un contact déjà connu (doublon, DEC-36).
const suffixe = horodatage.replace(/\D/g, "");
const contactAssistant = `parcours.${suffixe}@exemple.invalid`;
const v = await appel("assistant", "POST", "/visiteurs", {
  prenom: "PARCOURS",
  nom: horodatage,
  contact: contactAssistant,
});
attendre(v.statut === 201, "l’assistant crée un visiteur fictif", v);
// DEC-19 tranchée le 19/10 : la Réception crée une fiche minimale (identité, contact), sans qualification.
const vr = await appel("reception", "POST", "/visiteurs", {
  prenom: "PARCOURS",
  nom: `${horodatage} (réception)`,
  contact: `reception.${suffixe}@exemple.invalid`,
});
attendre(
  vr.statut === 201,
  "la réception crée une fiche visiteur minimale",
  vr,
);
const vq = await appel("reception", "POST", "/visiteurs", {
  prenom: "PARCOURS",
  nom: `${horodatage} (réception qualifiée)`,
  contact: `qualifiee.${suffixe}@exemple.invalid`,
  qualite: "Titre fictif",
});
attendre(
  vq.statut === 400,
  "la qualification du visiteur est refusée à la réception",
  vq,
);
// DEC-36 (22/10) : la Réception ne reçoit que le nom et un contact masqué.
const vrech = await appel(
  "reception",
  "GET",
  `/visiteurs?q=${encodeURIComponent(horodatage)}`,
);
const vu = vrech.corps?.elements?.find((x) => x.id === v.corps?.id);
attendre(
  vrech.statut === 200 &&
    vu?.contact_masque === "p***@e***.invalid" &&
    !("contact" in (vu ?? {})) &&
    !JSON.stringify(vrech.corps).includes(contactAssistant),
  "la réception voit le visiteur avec un contact masqué, jamais le contact complet",
  vrech,
);
const vdoublon = await appel("reception", "POST", "/visiteurs", {
  prenom: "Autre",
  nom: `PARCOURS ${suffixe}`,
  contact: contactAssistant.toUpperCase(),
});
attendre(
  vdoublon.statut === 409 &&
    vdoublon.corps?.code === "doublon_contact" &&
    !JSON.stringify(vdoublon.corps).includes(contactAssistant),
  "même contact : doublon signalé (409), fiche existante masquée",
  vdoublon,
);
const vmod = await appel("assistant", "PATCH", `/visiteurs/${v.corps?.id}`, {
  qualite: "Délégué fictif",
});
const vmodr = await appel("reception", "PATCH", `/visiteurs/${v.corps?.id}`, {
  qualite: "Tentative",
});
attendre(
  vmod.statut === 200 && vmodr.statut === 403,
  `l’assistant modifie la fiche ; la réception ne la modifie pas (réception : HTTP ${vmodr.statut})`,
  vmod,
);

const d = await appel("reception", "POST", "/demandes", {
  visiteur_id: v.corps.id,
  agenda_id: agendaId,
  objet: "Parcours de vérification (fictif)",
  contact: "parcours@exemple.invalid",
});
attendre(
  d.statut === 201 && /^DEM-\d{4}-\d{6}$/.test(d.corps.reference ?? ""),
  `la réception crée la demande ${d.corps.reference}`,
  d,
);
const id = d.corps.id;
await refuse(
  appel("administrator", "POST", "/demandes", {}),
  "l’administrateur ne crée pas de demande (403, matrice : « — »)",
);

const q = await appel("reception", "POST", `/demandes/${id}/qualification`, {
  qualification: "Recevable (fictif)",
});
attendre(
  q.statut === 200 && q.corps.statut === "qualifiee",
  "la réception qualifie la demande",
  q,
);
await refuse(
  appel("reception", "POST", `/demandes/${id}/decision`, {
    type: "valider",
    motif: "non",
  }),
  "la réception ne peut pas décider (403)",
);

const f = await appel("authority", "GET", "/decisions/file");
attendre(
  f.statut === 200 && f.corps.elements.some((e) => e.id === id),
  "l’autorité voit la demande dans la file de décisions",
  f,
);
// DEC-37 : l'Assistant saisit les critères ; seule l'Autorité fixe le niveau ; aucune formule.
const criteres = await appel("assistant", "PATCH", `/demandes/${id}/criteres`, {
  urgence: "elevee",
  rang_protocolaire: "eleve",
});
attendre(
  criteres.statut === 200,
  "l’assistant saisit les critères de priorité",
  criteres,
);
await refuse(
  appel("assistant", "POST", `/demandes/${id}/priorite`, {
    niveau: "critique",
  }),
  "l’assistant ne fixe pas le niveau de priorité sans délégation (403)",
);
const niveau = await appel("authority", "POST", `/demandes/${id}/priorite`, {
  niveau: "elevee",
});
attendre(
  niveau.statut === 200,
  "l’autorité fixe le niveau de priorité",
  niveau,
);
const dec = await appel("authority", "POST", `/demandes/${id}/decision`, {
  type: "valider",
  motif: "Accord de principe (fictif)",
});
attendre(
  dec.statut === 201 && dec.corps.statut_demande === "validee",
  "l’autorité valide",
  dec,
);

const corpsAudience = {
  demande_id: id,
  debut_prevu: "2026-12-01T09:00:00Z",
  duree_prevue_minutes: 30,
};
await refuse(
  appel("assistant", "POST", "/audiences", corpsAudience),
  "l’assistant ne planifie pas sans délégation (« D » de la matrice, 403)",
);
const a = await appel("authority", "POST", "/audiences", corpsAudience);
attendre(
  a.statut === 201 && a.corps.statut === "planifiee",
  "l’autorité planifie l’audience",
  a,
);
const aid = a.corps.id;
const dm = await appel("assistant", "POST", `/audiences/${aid}/demarrer`);
attendre(
  dm.statut === 200 && dm.corps.statut === "en_cours",
  "l’assistant démarre l’audience",
  dm,
);
const tm = await appel("assistant", "POST", `/audiences/${aid}/terminer`, {
  resultat: "Entretien tenu (fictif)",
});
attendre(
  tm.statut === 200 && tm.corps.statut === "terminee",
  "l’assistant termine l’audience et enregistre le résultat",
  tm,
);
for (const qui of ["reception", "administrator"]) {
  const c = await appel(qui, "POST", `/audiences/${aid}/cloturer`);
  attendre(c.statut === 403, `clôture refusée à ${qui} (matrice)`, c);
}
const cl = await appel("assistant", "POST", `/audiences/${aid}/cloturer`);
attendre(
  cl.statut === 200 &&
    cl.corps.statut === "cloturee" &&
    !!cl.corps.conservation_echeance,
  `l’assistant clôture ; conservation jusqu’au ${cl.corps.conservation_echeance}`,
  cl,
);

const det = await appel("authority", "GET", `/demandes/${id}`);
attendre(
  det.statut === 200 &&
    det.corps.decisions?.length === 1 &&
    det.corps.audience?.id === aid,
  "la chaîne demande → décision → audience est restituée",
  det,
);
const j = await appel(
  "authority",
  "GET",
  `/journal?objet_type=demande&objet_id=${id}`,
);
const actions = (j.corps.elements ?? []).map((e) => e.action).reverse();
// Vue limitée de l'Autorité (Q-1, HYPOTHESE(DEC-38)) : sur cette demande, seul le changement de
// priorité (catégorie « priorité ») ; création, qualification, critères et décision relèvent de
// « décisions et audiences », consultées dans les écrans métier, pas dans le journal.
attendre(
  j.statut === 200 &&
    actions.join() === "demande.changer_priorite" &&
    j.corps.elements[0]?.categorie === "priorite",
  `vue limitée du journal de l’autorité sur la demande : ${actions.join(" → ") || "(rien)"}`,
  j,
);
await refuse(
  appel("authority", "GET", "/journal?categorie=decisions_audiences"),
  "l’autorité ne peut pas demander la catégorie « décisions et audiences »",
  400,
);
await refuse(
  appel("assistant", "GET", "/journal"),
  "l’assistant ne lit pas le journal",
);
await refuse(
  appel("administrator", "GET", "/journal"),
  "l’administrateur ne lit pas le journal sans habilitation explicite (« D »)",
);

// Gestion des comptes : l'Administrateur, via le compte de service Keycloak (vrai Keycloak ici).
// DEC-32 : nouvel agenda proposé avec son Autorité ; décision refusée tant que le rattachement
// n'est pas autorisé (Autorité) puis appliqué (Administrateur).
const nouvelAgenda = await appel("administrator", "POST", "/agendas", {
  nom: `PARCOURS agenda ${horodatage}`,
  autorite_id: autoriteId,
});
attendre(
  nouvelAgenda.statut === 201 &&
    nouvelAgenda.corps.rattachement?.statut === "propose",
  "l’administrateur crée un agenda avec son Autorité (rattachement proposé)",
  nouvelAgenda,
);
const demandeLibre = await appel("reception", "POST", "/demandes", {
  visiteur_id: v.corps.id,
  agenda_id: nouvelAgenda.corps.id,
  objet: "Parcours : agenda à rattacher (fictif)",
  contact: "parcours@exemple.invalid",
});
const decisionLibre = await appel(
  "authority",
  "POST",
  `/demandes/${demandeLibre.corps?.id}/decision`,
  { type: "differer", motif: "Essai de périmètre (fictif)" },
);
attendre(
  demandeLibre.statut === 201 && decisionLibre.statut === 409,
  "agenda non rattaché : la décision est refusée (409, file « à rattacher »)",
  decisionLibre,
);
const rid = nouvelAgenda.corps.rattachement?.id;
const autorise = await appel(
  "authority",
  "POST",
  `/rattachements/${rid}/autoriser`,
);
const applique = await appel(
  "administrator",
  "POST",
  `/rattachements/${rid}/appliquer`,
);
const decisionApres = await appel(
  "authority",
  "POST",
  `/demandes/${demandeLibre.corps?.id}/decision`,
  { type: "differer", motif: "Essai de périmètre (fictif)" },
);
attendre(
  autorise.statut === 200 &&
    applique.statut === 200 &&
    decisionApres.statut === 201,
  "l’Autorité autorise, l’Administrateur applique : la décision devient possible",
  decisionApres,
);

const courriel = `parcours.${Date.now()}@example.test`;
const nu = await appel("administrator", "POST", "/utilisateurs", {
  prenom: "Parcours",
  nom: "Fictif",
  courriel,
  role: "assistant",
});
attendre(
  nu.statut === 201,
  "l’administrateur crée un compte (Keycloak + rattachement)",
  nu,
);
await refuse(
  appel("authority", "POST", "/utilisateurs", {
    prenom: "X",
    nom: "Y",
    courriel: "x@example.test",
    role: "assistant",
  }),
  "l’autorité ne gère pas les comptes (profil Administrateur dormant : inactif)",
);
const doublon = await appel("administrator", "POST", "/utilisateurs", {
  prenom: "Parcours",
  nom: "Fictif",
  courriel,
  role: "assistant",
});
attendre(doublon.statut === 409, "le même courriel est refusé (409)", doublon);
const inconnu = await appel(
  "administrator",
  "POST",
  "/utilisateurs/rattachement",
  {
    keycloak_sub: "00000000-0000-4000-8000-000000000000",
    nom_complet: "Inventé Fictif",
  },
);
attendre(
  inconnu.statut === 422,
  "un identifiant Keycloak inventé est refusé (422)",
  inconnu,
);

// Liste blanche (arbitrage du 19/10) : l'Administrateur n'attribue ni Autorité ni Administrateur.
await refuse(
  appel("administrator", "POST", "/utilisateurs", {
    prenom: "Parcours",
    nom: "Autorité",
    courriel: `parcours.autorite.${Date.now()}@example.test`,
    role: "authority",
  }),
  "l’administrateur ne peut pas créer un compte Autorité",
);
// HYPOTHESE(DEC-38), 1 a et 1 e : rôle attribué = entrée distincte ; refus hors liste blanche journalisé
// (regroupé par fenêtre de 10 minutes : un lancement rapproché peut ne pas en ajouter un nouveau).
const jr = await appel(
  "authority",
  "GET",
  "/journal?categorie=droits_delegations&objet_type=utilisateur&limite=200",
);
const entreesRole = (jr.corps.elements ?? []).filter(
  (e) => e.action === "role.attribuer",
);
attendre(
  jr.statut === 200 &&
    entreesRole.some(
      (e) => e.objet_id === nu.corps.id && e.resultat === "accepte",
    ) &&
    entreesRole.some((e) => e.resultat === "refuse"),
  "le journal de l’autorité montre le rôle attribué et le refus hors liste blanche",
  jr,
);
const purges = await appel("authority", "GET", "/journal/purges");
attendre(
  purges.statut === 200 && Array.isArray(purges.corps.elements),
  `l’autorité lit le récapitulatif des purges (${purges.corps.elements?.length ?? "?"} ligne(s))`,
  purges,
);

// Statut neutre (arbitrage du 19/10) : une demande rejetée apparaît « non_retenue » à la réception.
const dr = await appel("reception", "POST", "/demandes", {
  visiteur_id: vr.corps.id,
  agenda_id: agendaId,
  objet: "Parcours : demande à rejeter (fictif)",
  contact: "c@example.test",
});
attendre(dr.statut === 201, "la réception crée une seconde demande", dr);
const rej = await appel(
  "authority",
  "POST",
  `/demandes/${dr.corps.id}/decision`,
  {
    type: "rejeter",
    motif: "Motif fictif de rejet",
  },
);
attendre(rej.statut === 201, "l’autorité rejette avec motif", rej);
const vueRec = await appel("reception", "GET", `/demandes/${dr.corps.id}`);
attendre(
  vueRec.statut === 200 &&
    vueRec.corps.statut === "non_retenue" &&
    !JSON.stringify(vueRec.corps).includes("Motif fictif"),
  "la réception voit « non retenue », sans motif ni décision",
  vueRec,
);

console.log(echec ? "RESULTAT : ECHEC" : "RESULTAT : TOUT OK");
process.exit(echec ? 1 : 0);
