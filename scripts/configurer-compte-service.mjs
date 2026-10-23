#!/usr/bin/env node
// Configure le compte de service Keycloak « shiku-service » sur un realm EXISTANT (l'import du realm ne
// rejoue pas). Idempotent ; simulation par défaut ; ne supprime ni client, ni compte, ni volume.
//
//   node --env-file=.env scripts/configurer-compte-service.mjs                 simulation (rien n'est écrit)
//   node --env-file=.env scripts/configurer-compte-service.mjs --appliquer     crée le client s'il manque et
//                                                                              lui donne les droits d'origine
//   ... --appliquer --reduire [--roles-creables reception,assistant]   (par défaut : reception,assistant)
//        remplace les droits d'origine (manage-users, view-users, query-users) par des permissions fines :
//        utilisateurs (voir, gérer, attribuer des rôles) et UNIQUEMENT les rôles listés. Les droits d'origine
//        ne sont retirés qu'après vérification que le compte de service fonctionne avec les nouvelles.
//
// Variables lues dans l'environnement (jamais affichées) : KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_PASSWORD,
// KC_SERVICE_PASSWORD ; facultatives : KEYCLOAK_URL (http://localhost:<KEYCLOAK_PORT|8080>), KEYCLOAK_REALM (shiku).
// Limite connue, non levée par ce script : « gérer les utilisateurs » inclut encore la définition d'un mot de
// passe (voir docs/dev/COMPTES-KEYCLOAK.md, risque résiduel).
// Fin propre : AUCUN process.exit(), et les connexions de fetch sont fermées avant la fin. Sinon, sous
// Windows, « Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) » (libuv, async.c ; nodejs/node#56645).
// Le code de sortie est placé dans process.exitCode et Node se termine de lui-même.
class Fin {
  constructor(code) {
    this.code = code;
  }
}

async function principal() {
  const args = process.argv.slice(2);
  const appliquer = args.includes("--appliquer");
  const reduire = args.includes("--reduire");
  const i = args.indexOf("--roles-creables");
  const ROLES_APP = ["reception", "assistant", "authority", "administrator"];
  // Arbitrage de M. Jordan du 19/10/2026 (point 2) : l'Administrateur n'attribue que Réception et Assistant,
  // limite appliquée dans l'application ET dans les permissions du compte de service (avec --reduire).
  const ROLES_ATTRIBUABLES = ["reception", "assistant"];
  const rolesCreables =
    i >= 0
      ? (args[i + 1] ?? "").split(",").filter(Boolean)
      : ROLES_ATTRIBUABLES;
  const inconnus = rolesCreables.filter((r) => !ROLES_APP.includes(r));
  if (inconnus.length || rolesCreables.length === 0) {
    console.error(
      `ERREUR : --roles-creables doit lister des rôles parmi : ${ROLES_APP.join(", ")}.`,
    );
    return 2;
  }
  const exiger = (n) => {
    const v = process.env[n];
    if (!v) {
      console.error(
        `ERREUR : variable ${n} manquante (lancez avec --env-file=.env).`,
      );
      throw new Fin(1);
    }
    return v;
  };
  const base =
    process.env.KEYCLOAK_URL ??
    `http://localhost:${process.env.KEYCLOAK_PORT ?? 8080}`;
  const realm = process.env.KEYCLOAK_REALM ?? "shiku";
  const admin = exiger("KEYCLOAK_ADMIN");
  const mdpAdmin = exiger("KEYCLOAK_ADMIN_PASSWORD");
  const secretService = exiger("KC_SERVICE_PASSWORD");

  const jeton = async (realmJeton, corps) => {
    const r = await fetch(
      `${base}/realms/${realmJeton}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(corps),
      },
    );
    if (!r.ok) throw new Error(`jeton refusé (${r.status})`);
    return (await r.json()).access_token;
  };
  let tAdmin;
  try {
    tAdmin = await jeton("master", {
      grant_type: "password",
      client_id: "admin-cli",
      username: admin,
      password: mdpAdmin,
    });
  } catch (e) {
    console.error(
      `ERREUR : connexion administrateur impossible sur ${base} (${e.message}). ` +
        "Keycloak est-il démarré ? KEYCLOAK_ADMIN et KEYCLOAK_ADMIN_PASSWORD sont-ils ceux de ce Keycloak ?",
    );
    return 1;
  }
  const api = (chemin, init = {}) =>
    fetch(`${base}/admin/realms/${realm}${chemin}`, {
      ...init,
      headers: {
        authorization: `Bearer ${tAdmin}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
  const lire = async (chemin) => {
    const r = await api(chemin);
    if (!r.ok) throw new Error(`GET ${chemin.split("?")[0]} : ${r.status}`);
    return r.json();
  };
  const ecrire = async (nom, chemin, init, ok = [200, 201, 204]) => {
    if (!appliquer) {
      console.log(`  [simulation] ${nom}`);
      return null;
    }
    const r = await api(chemin, init);
    if (!ok.includes(r.status)) throw new Error(`${nom} : HTTP ${r.status}`);
    console.log(`  fait : ${nom}`);
    return r;
  };
  console.log(
    `Realm « ${realm} » sur ${base}${appliquer ? "" : "  (SIMULATION : rien n'est écrit)"}`,
  );

  // 1. Le client shiku-service
  let [svc] = await lire(`/clients?clientId=shiku-service`);
  if (svc) console.log("  présent : client shiku-service (secret inchangé)");
  else {
    const r = await ecrire("créer le client shiku-service", "/clients", {
      method: "POST",
      body: JSON.stringify({
        clientId: "shiku-service",
        name: "SHIKU service (gestion des comptes par l'application)",
        description:
          "Compte de service réservé au backend. Ne se connecte jamais.",
        enabled: true,
        publicClient: false,
        clientAuthenticatorType: "client-secret",
        secret: secretService,
        standardFlowEnabled: false,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: true,
        protocol: "openid-connect",
      }),
    });
    if (r) [svc] = await lire(`/clients?clientId=shiku-service`);
  }
  if (!svc) {
    console.log(
      "Simulation terminée : le client serait créé, la suite dépend de lui.",
    );
    return 0;
  }
  const su = await lire(`/clients/${svc.id}/service-account-user`);
  const [rm] = await lire(`/clients?clientId=realm-management`);
  const rolesRm = await lire(`/clients/${rm.id}/roles`);
  const herites = ["manage-users", "view-users", "query-users"];

  if (!reduire) {
    const actuels = (
      await lire(`/users/${su.id}/role-mappings/clients/${rm.id}`)
    ).map((r) => r.name);
    const manque = rolesRm.filter(
      (r) => herites.includes(r.name) && !actuels.includes(r.name),
    );
    if (manque.length)
      await ecrire(
        `donner ${manque.map((r) => r.name).join(", ")}`,
        `/users/${su.id}/role-mappings/clients/${rm.id}`,
        { method: "POST", body: JSON.stringify(manque) },
      );
    else
      console.log(
        "  présent : droits d'origine (manage-users, view-users, query-users)",
      );
    return 0;
  }

  // 2. Permissions fines (v2) à la place des droits d'origine
  const royaume = await lire("");
  if (!royaume.adminPermissionsEnabled)
    await ecrire(
      "activer les permissions d'administration fines du realm",
      "",
      {
        method: "PUT",
        body: JSON.stringify({ realm, adminPermissionsEnabled: true }),
      },
    );
  const ap = appliquer
    ? (await lire(`/clients?clientId=admin-permissions`))[0]
    : undefined;
  if (!ap) {
    console.log(
      "  (simulation) la suite crée une politique et deux permissions.",
    );
    return 0;
  }
  const rs = `/clients/${ap.id}/authz/resource-server`;
  const parNom = async (type, nom) =>
    (await lire(`${rs}/${type}?name=${encodeURIComponent(nom)}&exact=true`))[0];
  let pol = await parNom("policy", "shiku-service");
  if (!pol) {
    const r = await ecrire(
      "créer la politique « shiku-service »",
      `${rs}/policy/client`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "shiku-service",
          type: "client",
          logic: "POSITIVE",
          decisionStrategy: "UNANIMOUS",
          clients: [svc.id],
        }),
      },
    );
    pol = await r.json();
  } else console.log("  présent : politique shiku-service");
  const roles = await lire("/roles?max=100");
  const idsRoles = roles
    .filter((r) => rolesCreables.includes(r.name))
    .map((r) => r.id);
  if (idsRoles.length !== rolesCreables.length)
    throw new Error("un rôle demandé n'existe pas dans le realm");
  for (const p of [
    {
      name: "shiku-service-utilisateurs",
      resourceType: "Users",
      scopes: ["view", "manage", "map-roles"],
    },
    {
      name: "shiku-service-roles-attribuables",
      resourceType: "Roles",
      scopes: ["map-role"],
      resources: idsRoles,
    },
  ]) {
    const existant = await parNom("permission", p.name);
    if (existant) {
      await ecrire(
        `remplacer la permission « ${p.name} »`,
        `${rs}/permission/scope/${existant.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...p,
            id: existant.id,
            type: "scope",
            logic: "POSITIVE",
            decisionStrategy: "UNANIMOUS",
            policies: [pol.id],
          }),
        },
      );
    } else
      await ecrire(
        `créer la permission « ${p.name} »`,
        `${rs}/permission/scope`,
        {
          method: "POST",
          body: JSON.stringify({
            ...p,
            type: "scope",
            logic: "POSITIVE",
            decisionStrategy: "UNANIMOUS",
            policies: [pol.id],
          }),
        },
      );
  }

  // 3. Retrait des droits d'origine, puis vérification ; si la vérification échoue, ils sont REMIS.
  const actuels = (
    await lire(`/users/${su.id}/role-mappings/clients/${rm.id}`)
  ).filter((r) => herites.includes(r.name));
  const chemin = `/users/${su.id}/role-mappings/clients/${rm.id}`;
  if (actuels.length)
    await ecrire(
      `retirer les droits d'origine (${actuels.map((r) => r.name).join(", ")})`,
      chemin,
      { method: "DELETE", body: JSON.stringify(actuels) },
    );
  const remettre = async () => {
    if (appliquer && actuels.length) {
      await api(chemin, { method: "POST", body: JSON.stringify(actuels) });
      console.error(
        "Les droits d'origine ont été REMIS : le compte de service fonctionne comme avant.",
      );
    }
  };
  let attendu = "",
    obtenu = "",
    statutCreation = 0;
  try {
    const tSvc = await jeton(realm, {
      grant_type: "client_credentials",
      client_id: "shiku-service",
      client_secret: secretService,
    });
    const sonde = `sonde-config-${Date.now()}@exemple.invalid`;
    const c = await fetch(`${base}/admin/realms/${realm}/users`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tSvc}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ username: sonde, email: sonde, enabled: true }),
    });
    statutCreation = c.status;
    const idSonde = c.headers.get("location")?.split("/").pop();
    const l = idSonde
      ? await fetch(
          `${base}/admin/realms/${realm}/users/${idSonde}/role-mappings/realm/available`,
          { headers: { authorization: `Bearer ${tSvc}` } },
        )
      : null;
    const dispo = l?.ok ? (await l.json()).map((r) => r.name).sort() : [];
    if (idSonde)
      await fetch(`${base}/admin/realms/${realm}/users/${idSonde}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${tSvc}` },
      });
    attendu = [...rolesCreables].sort().join(",");
    obtenu = dispo.filter((n) => ROLES_APP.includes(n)).join(",");
  } catch (e) {
    console.error(`ÉCHEC de la vérification : ${e.message}.`);
    await remettre();
    return 1;
  }
  if (appliquer && (statutCreation !== 201 || obtenu !== attendu)) {
    console.error(
      `ÉCHEC de la vérification (création ${statutCreation}, rôles attribuables « ${obtenu} » au lieu de « ${attendu} »).`,
    );
    await remettre();
    return 1;
  }
  if (appliquer)
    console.log(
      `  vérifié : création/suppression de compte possibles ; rôles attribuables = ${attendu}`,
    );
  console.log(
    "Terminé. Lancez : node --env-file=.env scripts/verifier-compte-service.mjs --roles-creables " +
      rolesCreables.join(","),
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
  // Ferme explicitement les connexions gardées ouvertes par fetch AVANT la fin du processus : sous Windows
  // (Node 23 à 26), une fin pendant leur fermeture déclenche l'assertion libuv même sans process.exit()
  // (nodejs/node#56645). Répartiteur interne de fetch : absent → rien à faire.
  const repartiteur = globalThis[Symbol.for("undici.globalDispatcher.1")];
  if (typeof repartiteur?.close === "function")
    await repartiteur.close().catch(() => {});
}
