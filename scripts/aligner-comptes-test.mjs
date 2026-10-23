#!/usr/bin/env node
// Diagnostique, puis aligne si on le demande, les 5 COMPTES DE TEST FICTIFS du realm local sur .env.
// Cas visé : un realm créé avec une version antérieure (ou avant une régénération de .env) garde les mots
// de passe de sa création ; les variables KC_PASSWORD_* de .env ne correspondent plus, et la connexion
// des comptes de test échoue (scripts/verifier-parcours.mjs : « identifiant ou mot de passe refusé »).
//
//   node --env-file=.env scripts/aligner-comptes-test.mjs              diagnostic (SIMULATION : rien n'est écrit)
//   node --env-file=.env scripts/aligner-comptes-test.mjs --appliquer  aligne les mots de passe sur .env
//
// Portée strictement limitée : uniquement les 5 identifiants ci-dessous, du realm « shiku ». Aucun autre
// compte, aucun rôle, aucun client n'est touché ; rien n'est supprimé. Avec --appliquer, pour chacun :
// mot de passe = valeur de .env (non temporaire) et levée du blocage éventuel dû aux tentatives répétées.
// Aucune valeur secrète n'est affichée. Ne jamais utiliser sur un environnement autre que local.
// Fin propre (pas de process.exit, connexions de fetch fermées) : voir configurer-compte-service.mjs.
class Fin {
  constructor(code) {
    this.code = code;
  }
}

const COMPTES = [
  ["reception.test", "KC_PASSWORD_RECEPTION"],
  ["assistant1.test", "KC_PASSWORD_ASSISTANT1"],
  ["assistant2.test", "KC_PASSWORD_ASSISTANT2"],
  ["authority.test", "KC_PASSWORD_AUTHORITY"],
  ["admin.test", "KC_PASSWORD_ADMIN"],
];

async function principal() {
  const appliquer = process.argv.slice(2).includes("--appliquer");
  const exiger = (n) => {
    if (!process.env[n]) {
      console.error(
        `ERREUR : variable ${n} absente ou vide (lancez avec --env-file=.env).`,
      );
      throw new Fin(1);
    }
    return process.env[n];
  };
  const base =
    process.env.KEYCLOAK_URL ??
    `http://localhost:${process.env.KEYCLOAK_PORT ?? 8080}`;
  const realm = process.env.KEYCLOAK_REALM ?? "shiku";
  const mdpAttendus = Object.fromEntries(
    COMPTES.map(([u, v]) => [u, exiger(v)]),
  );

  const r = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: exiger("KEYCLOAK_ADMIN"),
      password: exiger("KEYCLOAK_ADMIN_PASSWORD"),
    }),
  }).catch((e) => ({ ok: false, status: e.message }));
  if (!r.ok) {
    console.error(
      `ERREUR : connexion administrateur impossible sur ${base} (${r.status}). ` +
        "Keycloak est-il démarré ? KEYCLOAK_ADMIN et KEYCLOAK_ADMIN_PASSWORD sont-ils ceux de ce Keycloak ?",
    );
    return 1;
  }
  const jeton = (await r.json()).access_token;
  const api = (chemin, init = {}) =>
    fetch(`${base}/admin/realms/${realm}${chemin}`, {
      ...init,
      headers: {
        authorization: `Bearer ${jeton}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });

  // Contrôle d'un mot de passe SANS modifier quoi que ce soit : le flux « mot de passe » d'un client
  // public dédié n'existe pas forcément ; on teste donc par le formulaire de connexion de shiku-web.
  const motDePasseAccepte = async (utilisateur, mdp) => {
    const { connecter } = await import("./lib/pkce.mjs");
    const c = await connecter(utilisateur, mdp);
    return c.code ? { ok: true } : { ok: false, motif: c.motif ?? c.etape };
  };

  console.log(
    `Realm « ${realm} » sur ${base}${appliquer ? "" : "  (SIMULATION : rien n'est écrit)"}`,
  );
  let aCorriger = 0;
  for (const [utilisateur] of COMPTES) {
    const liste = await (
      await api(`/users?username=${encodeURIComponent(utilisateur)}&exact=true`)
    ).json();
    const u = Array.isArray(liste) ? liste[0] : undefined;
    if (!u) {
      console.log(
        `ABSENT  ${utilisateur} : compte inexistant dans le realm (non créé par ce script)`,
      );
      aCorriger++;
      continue;
    }
    const blocage = await (
      await api(`/attack-detection/brute-force/users/${u.id}`)
    )
      .json()
      .catch(() => ({}));
    const bloque = blocage?.disabled === true;
    const actions = (u.requiredActions ?? []).join(", ");
    // On ne teste pas un compte bloqué : chaque essai prolongerait le blocage.
    const essai =
      bloque || !u.enabled
        ? { ok: false, motif: "non testé" }
        : await motDePasseAccepte(utilisateur, mdpAttendus[utilisateur]);
    const etat = [
      u.enabled ? null : "désactivé",
      bloque ? "bloqué (tentatives répétées)" : null,
      actions ? `actions requises : ${actions}` : null,
      essai.ok
        ? "mot de passe de .env accepté"
        : `mot de passe de .env refusé (${essai.motif})`,
    ]
      .filter(Boolean)
      .join(" ; ");
    if (essai.ok && !actions) {
      console.log(`OK      ${utilisateur} : ${etat}`);
      continue;
    }
    aCorriger++;
    if (!appliquer) {
      console.log(
        `À FAIRE ${utilisateur} : ${etat} → [simulation] aligner sur .env`,
      );
      continue;
    }
    if (!u.enabled) {
      console.log(
        `IGNORÉ  ${utilisateur} : compte désactivé, réactivez-le vous-même dans la console si voulu`,
      );
      continue;
    }
    const p = await api(`/users/${u.id}/reset-password`, {
      method: "PUT",
      body: JSON.stringify({
        type: "password",
        value: mdpAttendus[utilisateur],
        temporary: false,
      }),
    });
    if (actions)
      await api(`/users/${u.id}`, {
        method: "PUT",
        body: JSON.stringify({ requiredActions: [] }),
      });
    // Toujours lever le blocage : changer le mot de passe ne remet pas à zéro les échecs déjà comptés,
    // et le contrôle ci-dessus vient lui-même d'en ajouter un.
    await api(`/attack-detection/brute-force/users/${u.id}`, {
      method: "DELETE",
    });
    const apres =
      p.status === 204
        ? await motDePasseAccepte(utilisateur, mdpAttendus[utilisateur])
        : { ok: false };
    console.log(
      `${apres.ok ? "FAIT   " : "ÉCHEC  "} ${utilisateur} : mot de passe aligné sur .env (${p.status})` +
        `${actions ? ", actions requises levées" : ""}, blocage levé ; connexion ${apres.ok ? "vérifiée" : `toujours refusée (${apres.motif ?? "?"})`}`,
    );
    if (!apres.ok) return 1;
  }
  if (!aCorriger)
    console.log(
      "Rien à faire : les 5 comptes de test acceptent les mots de passe de .env.",
    );
  else if (!appliquer)
    console.log(
      `${aCorriger} compte(s) à aligner. Pour appliquer : ajoutez --appliquer.`,
    );
  return 0;
}

try {
  process.exitCode = (await principal()) ?? 0;
} catch (e) {
  if (e instanceof Fin) process.exitCode = e.code;
  else {
    console.error(`ERREUR : ${e?.message ?? e}`);
    process.exitCode = 1;
  }
} finally {
  const repartiteur = globalThis[Symbol.for("undici.globalDispatcher.1")];
  if (typeof repartiteur?.close === "function")
    await repartiteur.close().catch(() => {});
}
