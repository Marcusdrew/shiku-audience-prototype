// Registre des hypothèses (exigence de M. Jordan du 23/10/2026, Q-15) : chaque marqueur
// HYPOTHESE(DEC-xx) du code doit figurer dans le registre de docs/dev/HYPOTHESES.md, et chaque entrée du
// registre déclarée « dans le code » doit y avoir au moins un marqueur. Le registre servira à la
// réintégration quand les actes seront signés. Lancé par la CI et par `pnpm hypotheses:check`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DOSSIERS = [
  "backend/src",
  "backend/migrations",
  "frontend/src",
  "scripts",
];
const EXTENSIONS = /\.(ts|tsx|mjs|js|sql)$/;
const MARQUEUR = /HYPOTHESE\(DEC-(\d+)/g;

/** Numéros DEC trouvés dans un texte de code. */
export function marqueurs(texte) {
  return [...texte.matchAll(MARQUEUR)].map((m) => `DEC-${m[1]}`);
}

/**
 * Lignes du registre : « | DEC-xx | sujet | état | dans le code : oui/non | ».
 * Seule la section « Registre des marqueurs » est lue.
 */
export function lireRegistre(markdown) {
  const debut = markdown.indexOf("## Registre des marqueurs");
  if (debut < 0) return null;
  const suite = markdown.slice(debut + 1);
  const fin = suite.search(/\n## /);
  const section = fin < 0 ? suite : suite.slice(0, fin);
  const entrees = new Map();
  for (const ligne of section.split("\n")) {
    const c = ligne.split("|").map((x) => x.trim());
    if (c.length < 6 || !/^DEC-\d+$/.test(c[1])) continue;
    entrees.set(c[1], { sujet: c[2], etat: c[3], code: /^oui$/i.test(c[4]) });
  }
  return entrees;
}

/** Compare le code au registre ; renvoie la liste des écarts (vide = conforme). */
export function comparer(occurrences, registre) {
  if (!registre)
    return [
      "docs/dev/HYPOTHESES.md : section « Registre des marqueurs » introuvable.",
    ];
  const problemes = [];
  for (const [dec, fichiers] of occurrences)
    if (!registre.has(dec))
      problemes.push(
        `${dec} marqué dans ${[...fichiers].join(", ")} mais absent du registre.`,
      );
  for (const [dec, e] of registre)
    if (e.code && !occurrences.has(dec))
      problemes.push(
        `${dec} déclaré « dans le code » dans le registre, mais aucun marqueur HYPOTHESE(${dec}) n'existe.`,
      );
  return problemes;
}

function parcourir(dossier, liste = []) {
  for (const nom of readdirSync(dossier)) {
    if (nom === "node_modules" || nom === "dist") continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) parcourir(chemin, liste);
    else if (EXTENSIONS.test(nom) && !nom.includes("controle-hypotheses"))
      liste.push(chemin);
  }
  return liste;
}

export function occurrencesDuDepot(racine = ".") {
  const occ = new Map();
  for (const d of DOSSIERS)
    for (const f of parcourir(join(racine, d)))
      for (const dec of marqueurs(readFileSync(f, "utf8"))) {
        if (!occ.has(dec)) occ.set(dec, new Set());
        occ.get(dec).add(f.replaceAll("\\", "/"));
      }
  return occ;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const registre = lireRegistre(readFileSync("docs/dev/HYPOTHESES.md", "utf8"));
  const occ = occurrencesDuDepot();
  const problemes = comparer(occ, registre);
  if (problemes.length) {
    for (const p of problemes) console.error(`ERREUR : ${p}`);
    process.exitCode = 1;
  } else
    console.log(
      `Registre des hypothèses conforme : ${occ.size} décision(s) marquée(s) dans le code, ${registre.size} au registre.`,
    );
}
