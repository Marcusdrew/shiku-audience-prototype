import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";

// Les deux scripts Keycloak contre un FAUX Keycloak local (connexions HTTP gardées ouvertes, comme le vrai).
// Vérifie : code de sortie, aucune assertion libuv ni trace d'exception, fin du processus sans process.exit(),
// et qu'en SIMULATION aucune requête d'écriture n'atteint l'API d'administration.
// Contexte : sous Windows, process.exit() pendant la fermeture des connexions de fetch provoquait
// « Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c ».

const SCRIPTS = [
  "configurer-compte-service.mjs",
  "verifier-compte-service.mjs",
];

function fauxKeycloak({
  clientPresent = false,
  droitsOrigine = true,
  jetonRefuse = false,
} = {}) {
  const requetes = [];
  const json = (res, code, corps) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(corps));
  };
  const serveur = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    requetes.push({
      methode: req.method,
      chemin: url.pathname,
      requete: url.search,
    });
    req.resume();
    req.on("end", () => {
      const p = url.pathname;
      if (p.endsWith("/protocol/openid-connect/token"))
        return jetonRefuse
          ? json(res, 401, { error: "invalid_grant" })
          : json(res, 200, { access_token: "jeton-factice" });
      const a = "/admin/realms/shiku";
      if (req.method !== "GET")
        return json(res, 500, { error: "écriture inattendue" });
      if (
        p === `${a}/clients` &&
        url.searchParams.get("clientId") === "shiku-service"
      )
        return json(
          res,
          200,
          clientPresent ? [{ id: "c1", clientId: "shiku-service" }] : [],
        );
      if (
        p === `${a}/clients` &&
        url.searchParams.get("clientId") === "realm-management"
      )
        return json(res, 200, [{ id: "rm", clientId: "realm-management" }]);
      if (p === `${a}/clients/c1/service-account-user`)
        return json(res, 200, { id: "u1" });
      const roles = ["manage-users", "view-users", "query-users"].map(
        (name, i) => ({ id: `r${i}`, name }),
      );
      if (p === `${a}/clients/rm/roles`) return json(res, 200, roles);
      if (p === `${a}/users/u1/role-mappings/clients/rm`)
        return json(res, 200, droitsOrigine ? roles : []);
      if (p === a)
        return json(res, 200, {
          realm: "shiku",
          adminPermissionsEnabled: false,
        });
      return json(res, 404, { error: "non simulé" });
    });
  });
  return new Promise((ok) =>
    serveur.listen(0, "127.0.0.1", () =>
      ok({
        url: `http://127.0.0.1:${serveur.address().port}`,
        requetes,
        fermer: () => serveur.close(),
      }),
    ),
  );
}

// Lancement ASYNCHRONE (le faux serveur tourne dans ce processus) ; échec si le script ne se termine pas seul.
function lancer(script, args, url) {
  return new Promise((ok, ko) => {
    const p = spawn(process.execPath, [`scripts/${script}`, ...args], {
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot ?? "",
        KEYCLOAK_URL: url,
        KEYCLOAK_ADMIN: "admin-factice",
        KEYCLOAK_ADMIN_PASSWORD: "mdp-factice",
        KC_SERVICE_PASSWORD: "secret-factice",
      },
    });
    let sortie = "";
    let erreurs = "";
    p.stdout.on("data", (d) => (sortie += d));
    p.stderr.on("data", (d) => (erreurs += d));
    const delai = setTimeout(() => {
      p.kill();
      ko(new Error(`${script} ne s'est pas terminé seul en 20 s`));
    }, 20_000);
    p.on("close", (code) => {
      clearTimeout(delai);
      ok({ code, sortie, erreurs });
    });
  });
}

const sansIncident = (r) => {
  assert.doesNotMatch(
    r.erreurs,
    /Assertion failed|UV_HANDLE_CLOSING/,
    r.erreurs,
  );
  assert.doesNotMatch(
    r.erreurs,
    /^\s+at /m,
    `trace d'exception affichée :\n${r.erreurs}`,
  );
};
const ecritures = (k) =>
  k.requetes.filter(
    (q) =>
      q.methode !== "GET" &&
      !q.chemin.endsWith("/protocol/openid-connect/token"),
  );

test("les deux scripts ferment les connexions de fetch avant de se terminer", () => {
  for (const s of SCRIPTS) {
    const code = readFileSync(`scripts/${s}`, "utf8");
    assert.match(code, /Symbol\.for\("undici\.globalDispatcher\.1"\)/, s);
    assert.match(code, /finally \{[\s\S]*repartiteur\.close\(\)/, s);
  }
});

test("aucun des deux scripts n'appelle process.exit()", () => {
  for (const s of SCRIPTS) {
    const code = readFileSync(`scripts/${s}`, "utf8").replace(
      /^\s*\/\/.*$/gm,
      "",
    );
    assert.doesNotMatch(code, /process\.exit\s*\(/, s);
  }
});

test("vérification, client absent : « ABSENT », code 3, fin propre, aucune écriture", async () => {
  const k = await fauxKeycloak({ clientPresent: false });
  try {
    const r = await lancer("verifier-compte-service.mjs", [], k.url);
    assert.equal(r.code, 3, r.sortie + r.erreurs);
    assert.match(r.sortie, /ABSENT client « shiku-service »/);
    sansIncident(r);
    assert.deepEqual(ecritures(k), []);
  } finally {
    k.fermer();
  }
});

test("configuration en SIMULATION, client absent : annonce la création, code 0, aucune écriture", async () => {
  const k = await fauxKeycloak({ clientPresent: false });
  try {
    const r = await lancer("configurer-compte-service.mjs", [], k.url);
    assert.equal(r.code, 0, r.sortie + r.erreurs);
    assert.match(r.sortie, /SIMULATION : rien n'est écrit/);
    assert.match(r.sortie, /\[simulation\] créer le client shiku-service/);
    sansIncident(r);
    assert.deepEqual(ecritures(k), []);
  } finally {
    k.fermer();
  }
});

test("configuration en SIMULATION, client présent sans droits : annonce l'octroi, aucune écriture", async () => {
  const k = await fauxKeycloak({ clientPresent: true, droitsOrigine: false });
  try {
    const r = await lancer("configurer-compte-service.mjs", [], k.url);
    assert.equal(r.code, 0, r.sortie + r.erreurs);
    assert.match(
      r.sortie,
      /présent : client shiku-service \(secret inchangé\)/,
    );
    assert.match(
      r.sortie,
      /\[simulation\] donner manage-users, view-users, query-users/,
    );
    sansIncident(r);
    assert.deepEqual(ecritures(k), []);
  } finally {
    k.fermer();
  }
});

test("configuration en SIMULATION avec --reduire : aucune écriture", async () => {
  const k = await fauxKeycloak({ clientPresent: true });
  try {
    const r = await lancer(
      "configurer-compte-service.mjs",
      ["--reduire"],
      k.url,
    );
    assert.equal(r.code, 0, r.sortie + r.erreurs);
    assert.match(r.sortie, /\[simulation\] activer les permissions/);
    sansIncident(r);
    assert.deepEqual(ecritures(k), []);
  } finally {
    k.fermer();
  }
});

test("identifiants d'administration refusés : message clair, code 1, sans trace d'exception", async () => {
  const k = await fauxKeycloak({ jetonRefuse: true });
  try {
    for (const s of SCRIPTS) {
      const r = await lancer(s, [], k.url);
      assert.equal(r.code, 1, s);
      assert.match(r.erreurs, /ERREUR : /, s);
      sansIncident(r);
    }
    assert.deepEqual(ecritures(k), []);
  } finally {
    k.fermer();
  }
});

test("fin stable : 10 lancements successifs de chaque script, toujours le bon code de sortie", async () => {
  // Le défaut Windows dépend du moment de la fermeture : un lancement isolé ne suffit pas à le montrer.
  // Une assertion libuv donnerait un autre code (3221226505 sous Windows).
  const k = await fauxKeycloak({ clientPresent: false });
  try {
    for (let n = 1; n <= 10; n++) {
      const v = await lancer("verifier-compte-service.mjs", [], k.url);
      assert.equal(v.code, 3, `vérification, lancement ${n} :\n${v.erreurs}`);
      sansIncident(v);
      const c = await lancer("configurer-compte-service.mjs", [], k.url);
      assert.equal(c.code, 0, `simulation, lancement ${n} :\n${c.erreurs}`);
      sansIncident(c);
    }
    assert.deepEqual(ecritures(k), []);
  } finally {
    k.fermer();
  }
});
