import assert from "node:assert/strict";
import { test } from "node:test";
import {
  comparer,
  lireRegistre,
  marqueurs,
  occurrencesDuDepot,
} from "./controle-hypotheses.mjs";

const REGISTRE = `# Hypothèses
## Registre des marqueurs HYPOTHESE(DEC-xx)
| DEC | Sujet | État | Dans le code |
| --- | --- | --- | --- |
| DEC-32 | Périmètre | provisoire, signature attendue | oui |
| DEC-35 | Tolérance | à appliquer (L5) | non |
## Suite
| DEC-99 | hors section | x | oui |
`;

test("lit les marqueurs du code", () => {
  assert.deepEqual(
    marqueurs("// HYPOTHESE(DEC-32) : x\n'HYPOTHESE(DEC-33) : y' HYPOTHESE H3"),
    ["DEC-32", "DEC-33"],
  );
});

test("lit seulement la section du registre", () => {
  const r = lireRegistre(REGISTRE);
  assert.deepEqual([...r.keys()], ["DEC-32", "DEC-35"]);
  assert.equal(r.get("DEC-32").code, true);
  assert.equal(r.get("DEC-35").code, false);
  assert.equal(lireRegistre("# sans registre"), null);
});

test("conforme : chaque marqueur est au registre", () => {
  const occ = new Map([["DEC-32", new Set(["a.ts"])]]);
  assert.deepEqual(comparer(occ, lireRegistre(REGISTRE)), []);
});

test("cas négatifs : marqueur absent du registre, entrée « oui » sans marqueur, registre absent", () => {
  const occ = new Map([["DEC-40", new Set(["b.ts"])]]);
  const p = comparer(occ, lireRegistre(REGISTRE));
  assert.equal(p.length, 2);
  assert.match(p[0], /DEC-40 marqué dans b\.ts/);
  assert.match(p[1], /DEC-32 déclaré « dans le code »/);
  assert.equal(comparer(new Map(), null).length, 1);
});

test("le dépôt lui-même est conforme à son registre", async () => {
  const { readFileSync } = await import("node:fs");
  const r = lireRegistre(readFileSync("docs/dev/HYPOTHESES.md", "utf8"));
  assert.deepEqual(comparer(occurrencesDuDepot(), r), []);
});
