#!/usr/bin/env node
// Vérifie, sur un Keycloak réel, ce que le compte de service « shiku-service » PEUT et NE PEUT PAS faire.
// Usage : node --env-file=.env scripts/verifier-compte-service.mjs [--roles-creables reception,assistant]
// Crée puis supprime un compte fictif « sonde-… @exemple.invalid ». Ne touche à aucun compte existant.
// N'affiche que des codes HTTP : jamais de jeton, de secret ni de mot de passe.
// Les cas « ne peut pas » sont des assertions (le script échoue s'ils sont autorisés). L'aptitude à définir un
// mot de passe est un CONSTAT affiché, non une assertion : c'est un risque résiduel connu (COMPTES-KEYCLOAK.md).
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
  const ROLES_APP = ["reception", "assistant", "authority", "administrator"];
  // Arbitrage de M. Jordan du 19/10/2026 (point 2) : l'Administrateur n'attribue que Réception et Assistant,
  // limite appliquée dans l'application ET dans les permissions du compte de service (avec --reduire).
  const ROLES_ATTRIBUABLES = ["reception", "assistant"];
  const i = args.indexOf("--roles-creables");
  const creables =
    i >= 0
      ? (args[i + 1] ?? "").split(",").filter(Boolean)
      : ROLES_ATTRIBUABLES;
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
  const jeton = async (r, corps) => {
    const x = await fetch(`${base}/realms/${r}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(corps),
    });
    if (!x.ok) throw new Error(`jeton refusé (${x.status})`);
    return (await x.json()).access_token;
  };
  const secret = exiger("KC_SERVICE_PASSWORD");
  let tAdm;
  try {
    tAdm = await jeton("master", {
      grant_type: "password",
      client_id: "admin-cli",
      username: exiger("KEYCLOAK_ADMIN"),
      password: exiger("KEYCLOAK_ADMIN_PASSWORD"),
    });
  } catch (e) {
    console.error(
      `ERREUR : connexion administrateur impossible sur ${base} (${e.message}). ` +
        "Keycloak est-il démarré ? KEYCLOAK_ADMIN et KEYCLOAK_ADMIN_PASSWORD sont-ils ceux de ce Keycloak ?",
    );
    return 1;
  }
  // Diagnostic d'abord, sans rien modifier : le client existe-t-il dans ce realm ?
  const presents = await (
    await fetch(
      `${base}/admin/realms/${realm}/clients?clientId=shiku-service`,
      {
        headers: { authorization: `Bearer ${tAdm}` },
      },
    )
  ).json();
  if (!Array.isArray(presents) || presents.length === 0) {
    console.log(`ABSENT client « shiku-service » dans le realm « ${realm} ».`);
    console.log(
      "       Créez-le : node --env-file=.env scripts/configurer-compte-service.mjs (simulation), puis --appliquer.",
    );
    return 3;
  }
  console.log(
    `OK     client « shiku-service » présent dans le realm « ${realm} »`,
  );
  let tSvc;
  try {
    tSvc = await jeton(realm, {
      grant_type: "client_credentials",
      client_id: "shiku-service",
      client_secret: secret,
    });
  } catch (e) {
    console.log(
      `ÉCHEC  jeton du compte de service refusé (${e.message}) : le secret du client diffère de KC_SERVICE_PASSWORD, ` +
        "ou le compte de service est désactivé. Le script de configuration ne change jamais un secret existant : " +
        "alignez l'un sur l'autre vous-même (console Keycloak, onglet Credentials du client, ou .env).",
    );
    return 4;
  }
  const f =
    (t) =>
    (chemin, init = {}) =>
      fetch(`${base}/admin/realms/${realm}${chemin}`, {
        ...init,
        headers: {
          authorization: `Bearer ${t}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
      });
  const svc = f(tSvc),
    adm = f(tAdm);

  let echecs = 0;
  const verdict = (ok, texte) => {
    console.log(`${ok ? "OK    " : "ÉCHEC "} ${texte}`);
    if (!ok) echecs++;
  };
  const sonde = `sonde-${Date.now()}@exemple.invalid`;
  const cree = await svc("/users", {
    method: "POST",
    body: JSON.stringify({
      username: sonde,
      email: sonde,
      enabled: true,
      requiredActions: ["UPDATE_PASSWORD"],
    }),
  });
  verdict(cree.status === 201, `peut créer un compte (${cree.status})`);
  const id = cree.headers.get("location")?.split("/").pop();
  try {
    verdict((await svc(`/users/${id}`)).status === 200, "peut lire un compte");
    const roles = await (await adm("/roles?max=100")).json(); // représentations lues avec l'administrateur, pas le compte de service
    for (const nom of ROLES_APP) {
      const rep = roles.find((r) => r.name === nom);
      const r = await svc(`/users/${id}/role-mappings/realm`, {
        method: "POST",
        body: JSON.stringify([{ id: rep.id, name: rep.name }]),
      });
      const attendu = creables.includes(nom);
      verdict(
        attendu ? r.status === 204 : r.status === 403 || r.status === 404,
        `rôle « ${nom} » : ${attendu ? "attribuable" : "REFUSÉ"} (${r.status})`,
      );
    }
    const refus = [
      ["lire les réglages du realm", () => svc("")],
      ["lister les groupes", () => svc("/groups")],
      ["lister les rôles du realm", () => svc("/roles")],
      ["lister les clients (secrets des clients)", () => svc("/clients")],
      [
        "lire les événements d'administration",
        () => svc("/admin-events?max=1"),
      ],
      [
        "usurper l'identité d'un compte",
        () => svc(`/users/${id}/impersonation`, { method: "POST" }),
      ],
    ];
    for (const [nom, appel] of refus) {
      const s = (await appel()).status;
      const legacy = [
        "lire les réglages du realm",
        "lister les groupes",
      ].includes(nom);
      if (legacy && process.env.KC_VERIFIER_REDUIT !== "1")
        console.log(
          `INFO   ${nom} : ${s} (autorisé par les droits d'origine ; refusé après --reduire)`,
        );
      else verdict(s === 403, `ne peut pas : ${nom} (${s})`);
    }
    const mdp = ["Sonde", "Essai", Date.now()].join("");
    const s = (
      await svc(`/users/${id}/reset-password`, {
        method: "PUT",
        body: JSON.stringify({ type: "password", value: mdp, temporary: true }),
      })
    ).status;
    console.log(
      `CONSTAT peut définir un mot de passe : ${s === 204 ? "OUI (risque résiduel connu)" : `non (${s})`}`,
    );
  } finally {
    if (id)
      verdict(
        [204, 403].includes(
          (await adm(`/users/${id}`, { method: "DELETE" })).status,
        ),
        "compte de la sonde supprimé (par l'administrateur)",
      );
  }
  return echecs ? 1 : 0;
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
