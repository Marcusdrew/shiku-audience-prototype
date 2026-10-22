import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Contrôles sans Keycloak : arguments, variables manquantes, absence d'opération destructive.
// Les preuves sur un vrai Keycloak sont décrites dans docs/dev/COMPTES-KEYCLOAK.md.
const lancer = (script, ...args) =>
  spawnSync(process.execPath, [`scripts/${script}`, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });

test("rôle inconnu refusé avant tout appel réseau", () => {
  const r = lancer(
    "configurer-compte-service.mjs",
    "--reduire",
    "--roles-creables",
    "superadmin",
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--roles-creables/);
});

test("liste de rôles vide refusée", () => {
  assert.equal(
    lancer("configurer-compte-service.mjs", "--roles-creables", "").status,
    2,
  );
});

test("variables manquantes : arrêt explicite, sans valeur affichée", () => {
  for (const s of [
    "configurer-compte-service.mjs",
    "verifier-compte-service.mjs",
  ]) {
    const r = lancer(s);
    assert.equal(r.status, 1, s);
    assert.match(r.stderr, /manquante/);
  }
});

test("le script de configuration ne supprime ni client, ni compte, ni royaume", () => {
  const s = readFileSync("scripts/configurer-compte-service.mjs", "utf8");
  const suppressions = [
    ...s.matchAll(/api\(`([^`]*)`,\s*\{\s*method:\s*"DELETE"/g),
  ].map((m) => m[1]);
  // Seuls sont retirés : des rôles du compte de service (role-mappings) ; la sonde est supprimée par son jeton.
  for (const chemin of suppressions)
    assert.match(chemin, /role-mappings|^\$\{chemin\}$/, chemin);
  assert.ok(!/\/clients\/\$\{[a-z]+\.id\}`,\s*\{\s*method:\s*"DELETE"/.test(s));
});
