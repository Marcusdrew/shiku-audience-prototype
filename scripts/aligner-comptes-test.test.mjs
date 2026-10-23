import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";

// aligner-comptes-test.mjs : portée limitée aux 5 comptes de test, aucune écriture en simulation,
// fin propre (pas de process.exit), message clair en cas d'échec. Faux Keycloak local, aucun réseau externe.
const SCRIPT = "scripts/aligner-comptes-test.mjs";
const ENV_COMPTES = {
  KC_PASSWORD_RECEPTION: "a",
  KC_PASSWORD_ASSISTANT1: "b",
  KC_PASSWORD_ASSISTANT2: "c",
  KC_PASSWORD_AUTHORITY: "d",
  KC_PASSWORD_ADMIN: "e",
};

function fauxKeycloak({ jetonRefuse = false } = {}) {
  const requetes = [];
  const serveur = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    requetes.push({ methode: req.method, chemin: url.pathname });
    req.resume();
    req.on("end", () => {
      res.writeHead(
        url.pathname.endsWith("/token") && jetonRefuse ? 401 : 200,
        {
          "content-type": "application/json",
        },
      );
      if (url.pathname.endsWith("/token"))
        return res.end(JSON.stringify({ access_token: "faux" }));
      // Aucun compte de test dans ce faux realm : le script doit le dire sans rien écrire.
      return res.end(JSON.stringify([]));
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

function lancer(args, env) {
  return new Promise((ok, ko) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], {
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot ?? "",
        ...env,
      },
    });
    let sortie = "";
    let erreurs = "";
    p.stdout.on("data", (d) => (sortie += d));
    p.stderr.on("data", (d) => (erreurs += d));
    const delai = setTimeout(() => {
      p.kill();
      ko(new Error("le script ne s'est pas terminé seul en 20 s"));
    }, 20_000);
    p.on("close", (code) => {
      clearTimeout(delai);
      ok({ code, sortie, erreurs });
    });
  });
}

test("portée : uniquement les 5 comptes de test ; jamais de suppression de compte ; fin propre", () => {
  const code = readFileSync(SCRIPT, "utf8");
  const sansCommentaires = code.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(sansCommentaires, /process\.exit\s*\(/);
  assert.match(code, /Symbol\.for\("undici\.globalDispatcher\.1"\)/);
  const comptes = [
    ...code.matchAll(/\["([a-z0-9.]+\.test)", "KC_PASSWORD_[A-Z0-9]+"\]/g),
  ].map((m) => m[1]);
  assert.deepEqual(comptes, [
    "reception.test",
    "assistant1.test",
    "assistant2.test",
    "authority.test",
    "admin.test",
  ]);
  // Écritures possibles : mot de passe (PUT), actions requises (PUT), levée du blocage (DELETE) ; le seul POST
  // est la demande de jeton administrateur. Aucune suppression de compte.
  const ecritures = [
    ...sansCommentaires.matchAll(/method: "(PUT|POST|DELETE)"/g),
  ].map((m) => m[1]);
  assert.deepEqual(ecritures.sort(), ["DELETE", "POST", "PUT", "PUT"]);
  assert.match(
    sansCommentaires,
    /realms\/master\/protocol\/openid-connect\/token`, \{\s*method: "POST"/,
  );
  assert.match(
    sansCommentaires,
    /attack-detection\/brute-force\/users\/\$\{u\.id\}`, \{\s*method: "DELETE"/,
  );
  assert.doesNotMatch(
    sansCommentaires,
    /`\/users\/\$\{u\.id\}`, \{\s*method: "DELETE"/,
  );
});

test("simulation : comptes absents signalés, aucune écriture, code 0", async () => {
  const k = await fauxKeycloak();
  try {
    const r = await lancer([], {
      KEYCLOAK_URL: k.url,
      KEYCLOAK_ADMIN: "x",
      KEYCLOAK_ADMIN_PASSWORD: "y",
      ...ENV_COMPTES,
    });
    assert.equal(r.code, 0, r.sortie + r.erreurs);
    assert.match(r.sortie, /SIMULATION : rien n'est écrit/);
    assert.equal((r.sortie.match(/^ABSENT/gm) ?? []).length, 5);
    assert.doesNotMatch(r.erreurs, /Assertion failed|^\s+at /m);
    assert.deepEqual(
      k.requetes.filter(
        (q) => q.methode !== "GET" && !q.chemin.endsWith("/token"),
      ),
      [],
    );
  } finally {
    k.fermer();
  }
});

test("variable manquante ou identifiants d'administration refusés : code 1, message clair", async () => {
  const sansVariable = await lancer([], {
    KEYCLOAK_URL: "http://127.0.0.1:9",
    KEYCLOAK_ADMIN: "x",
  });
  assert.equal(sansVariable.code, 1);
  assert.match(
    sansVariable.erreurs,
    /variable KC_PASSWORD_RECEPTION absente ou vide/,
  );
  const k = await fauxKeycloak({ jetonRefuse: true });
  try {
    const r = await lancer([], {
      KEYCLOAK_URL: k.url,
      KEYCLOAK_ADMIN: "x",
      KEYCLOAK_ADMIN_PASSWORD: "y",
      ...ENV_COMPTES,
    });
    assert.equal(r.code, 1);
    assert.match(r.erreurs, /connexion administrateur impossible/);
    assert.doesNotMatch(r.erreurs, /Assertion failed|^\s+at /m);
  } finally {
    k.fermer();
  }
});
