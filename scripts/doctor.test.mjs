import assert from "node:assert/strict";
import { test } from "node:test";
import { codeSortie, diagnostiquer, PREREQUIS } from "./doctor.mjs";

// Poste simulé : aucune installation réelle n'est touchée.
const poste = (sorties) => (commande) => sorties[commande.join(" ")] ?? null;
const complet = {
  "node --version": "v24.21.0\n",
  "pnpm --version": "12.10.1\n",
  "git --version": "git version 2.50.0\n",
  "docker --version": "Docker version 28.0.0, build abc\n",
  "docker compose version": "Docker Compose version v2.40.0\n",
  [PREREQUIS.at(-1).commande.join(" ")]: "services:\n  db:\n    image: x\n",
};

test("poste complet : tout est OK, code de sortie 0", () => {
  const r = diagnostiquer(poste(complet));
  assert.equal(r.length, PREREQUIS.length);
  assert.ok(r.every((x) => x.ok));
  assert.equal(codeSortie(r), 0);
});

test("KO 1 : pnpm absent → échec avec aide, code de sortie 1", () => {
  const { ["pnpm --version"]: _, ...sans } = complet;
  const r = diagnostiquer(poste(sans));
  const pnpm = r.find((x) => x.nom.startsWith("pnpm"));
  assert.equal(pnpm.ok, false);
  assert.match(pnpm.aide, /pnpm@12\.10\.1/);
  assert.equal(codeSortie(r), 1);
});

test("KO 2 : mauvaise version de Node ou de pnpm → échec", () => {
  const r = diagnostiquer(
    poste({
      ...complet,
      "node --version": "v22.1.0\n",
      "pnpm --version": "11.0.0\n",
    }),
  );
  assert.equal(r.find((x) => x.nom.startsWith("Node")).ok, false);
  assert.equal(r.find((x) => x.nom.startsWith("pnpm")).ok, false);
  assert.equal(codeSortie(r), 1);
});

test("KO 3 : un seul manque suffit pour échouer (Docker absent)", () => {
  const { ["docker --version"]: _, ...sans } = complet;
  assert.equal(codeSortie(diagnostiquer(poste(sans))), 1);
});
