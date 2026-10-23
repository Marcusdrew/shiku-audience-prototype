import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chercherSecrets,
  fichierTropGros,
  nomInterdit,
  TAILLE_MAX,
  verifierMessage,
} from "./controles-commit.mjs";

// Les faux secrets sont assemblés à l'exécution : ce fichier ne contient aucune valeur qui ressemble
// à un secret, donc il ne déclenche pas lui-même le contrôle qu'il teste.
const faux = {
  cleAws: "AKIA" + "ABCDEFGHIJKLMNOP",
  cle: "-----BEGIN " + "PRIVATE KEY-----",
  affectation: "DB_" + "password" + " = " + "Zq81xLmP4vTn7RwYc2Ke",
};

test("messages conformes", () => {
  for (const m of [
    "feat(backend): ajouter la clôture",
    "fix: corriger la purge",
    "docs(api): mettre à jour",
    "Merge branch x",
  ])
    assert.equal(verifierMessage(m), null, m);
});

test("message non conforme refusé (cas négatif exigé par T0-06)", () => {
  for (const m of [
    "correction",
    "Fix: majuscule",
    "feat:vide",
    "feat(): x",
    "wip",
    "",
  ])
    assert.notEqual(verifierMessage(m), null, m);
  assert.match(verifierMessage("n’importe quoi"), /type\(portée\)/);
});

test("faux secrets détectés, sans jamais renvoyer la valeur (cas négatif exigé par T0-07 et T0-15)", () => {
  for (const [nom, valeur] of Object.entries(faux)) {
    const r = chercherSecrets(`ligne 1\n${valeur}\n`, "f.txt");
    assert.equal(r.length, 1, nom);
    assert.equal(r[0].ligne, 2);
    assert.ok(
      !JSON.stringify(r).includes(valeur),
      "la valeur ne doit jamais apparaître",
    );
  }
});

test("placeholders, variables et exemples ne sont pas des secrets", () => {
  for (const l of [
    "DB_APP_PASSWORD=",
    "password: ${DB_APP_PASSWORD}",
    'secret = "<à remplir>"',
    'password = "exemple-de-mot-de-passe-long"',
  ])
    assert.deepEqual(chercherSecrets(l), [], l);
});

test("gros fichiers et fichiers interdits", () => {
  assert.equal(fichierTropGros(TAILLE_MAX + 1), true);
  assert.equal(fichierTropGros(10), false);
  for (const f of [".env", "backend/.env.local", "a/b/cle.pem", "x.key"])
    assert.equal(nomInterdit(f), true, f);
  for (const f of [".env.example", "README.md"])
    assert.equal(nomInterdit(f), false, f);
});
