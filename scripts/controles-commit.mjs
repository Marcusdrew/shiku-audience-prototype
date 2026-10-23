// Contrôles locaux et CI partagés (T0-06, T0-07, T0-15) : message de commit, secrets, gros fichiers.
// Aucune valeur de secret n'est jamais affichée : seulement le fichier, la ligne et le type de motif.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ── Message de commit : type(portée): message ──────────────────────────────────────────────────
export const TYPES = [
  "feat",
  "fix",
  "docs",
  "test",
  "refactor",
  "chore",
  "ci",
  "build",
  "perf",
  "revert",
];
const FORMAT = new RegExp(
  `^(${TYPES.join("|")})(\\([a-z0-9._/-]+\\))?!?: \\S.{2,}$`,
);

export function verifierMessage(message) {
  const ligne = message.split("\n")[0].trim();
  if (/^(Merge|Revert|fixup!|squash!) /.test(ligne)) return null;
  if (ligne.length > 100) return "La première ligne dépasse 100 caractères.";
  if (!FORMAT.test(ligne))
    return `Message non conforme : « type(portée): message ». Types : ${TYPES.join(", ")}.`;
  return null;
}

// ── Détection de secrets ───────────────────────────────────────────────────────────────────────
const MOTIFS = [
  ["clé privée", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ["clé d’accès AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["jeton GitHub", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["jeton Slack", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  [
    "jeton JWT",
    /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/,
  ],
  // Affectation d'un secret littéral : mot-clé, puis valeur de 12 caractères ou plus, sans placeholder.
  [
    "secret affecté en clair",
    /(?:password|passwd|secret|token|api[_-]?key)[A-Za-z0-9_]*\s*[:=]\s*['"]?(?![$<{(])(?:[A-Za-z0-9+/_-]{16,})['"]?\s*$/im,
  ],
];
// Valeurs d'exemple ou de test explicitement non secrètes.
const AUTORISE =
  /(exemple|example|essai|test|placeholder|changeme|xxxxx|\*\*\*)/i;

export function chercherSecrets(texte, nomFichier = "(texte)") {
  const trouves = [];
  texte.split("\n").forEach((ligne, i) => {
    if (ligne.length > 2000 || AUTORISE.test(ligne)) return;
    for (const [type, re] of MOTIFS)
      if (re.test(ligne))
        trouves.push({ fichier: nomFichier, ligne: i + 1, type });
  });
  return trouves;
}

export const TAILLE_MAX = 1_000_000; // octets
export const fichierTropGros = (taille) => taille > TAILLE_MAX;
export const FICHIERS_INTERDITS = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(?!example$)/,
  /\.(pem|key|p12|pfx)$/,
];
export const nomInterdit = (chemin) =>
  FICHIERS_INTERDITS.some((re) => re.test(chemin));

// ── Exécution (hooks et CI) ────────────────────────────────────────────────────────────────────
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const binaire = (b) => b.includes("\0");

function controlerFichiers(fichiers) {
  const problemes = [];
  for (const f of fichiers) {
    if (nomInterdit(f))
      problemes.push(`${f} : fichier interdit (secret local, clé ou .env).`);
    let taille = 0;
    try {
      taille = statSync(f).size;
    } catch {
      continue;
    }
    if (fichierTropGros(taille))
      problemes.push(`${f} : fichier de plus de 1 Mo.`);
    else if (taille > 0) {
      const brut = readFileSync(f);
      if (binaire(brut.subarray(0, 8000))) continue;
      for (const s of chercherSecrets(brut.toString("utf8"), f))
        problemes.push(
          `${s.fichier}:${s.ligne} : motif de secret probable (${s.type}).`,
        );
    }
  }
  return problemes;
}

function sortir(problemes, ok) {
  for (const p of problemes) console.error(`  ✗ ${p}`);
  console.log(
    problemes.length === 0 ? ok : `RESULTAT : ${problemes.length} problème(s).`,
  );
  process.exit(problemes.length === 0 ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [mode, arg] = process.argv.slice(2);
  if (mode === "message") {
    const e = verifierMessage(readFileSync(arg, "utf8"));
    sortir(e ? [e] : [], "Message de commit conforme.");
  } else if (mode === "indexe") {
    const fichiers = git("diff", "--cached", "--name-only", "--diff-filter=ACM")
      .split("\n")
      .filter(Boolean);
    sortir(
      controlerFichiers(fichiers),
      `Contrôle du commit : ${fichiers.length} fichier(s) sans secret ni gros fichier.`,
    );
  } else if (mode === "arbre") {
    const fichiers = git("ls-files").split("\n").filter(Boolean);
    sortir(
      controlerFichiers(fichiers),
      `Contrôle de l'arbre : ${fichiers.length} fichier(s) sans secret ni gros fichier.`,
    );
  } else if (mode === "historique") {
    // Tout l'historique : seules les lignes AJOUTÉES sont examinées, jamais affichées.
    const problemes = [];
    const diff = git("log", "--all", "-p", "--no-color", "--unified=0");
    let fichier = "(historique)";
    for (const l of diff.split("\n")) {
      if (l.startsWith("+++ b/")) fichier = l.slice(6);
      else if (l.startsWith("+") && !l.startsWith("+++"))
        for (const s of chercherSecrets(l.slice(1), fichier))
          problemes.push(
            `${s.fichier} : motif de secret probable (${s.type}) dans l'historique.`,
          );
    }
    sortir(
      [...new Set(problemes)],
      "Historique : aucun motif de secret détecté.",
    );
  } else if (mode === "messages") {
    // Messages des commits d'une plage (CI : base..tete).
    const problemes = [];
    for (const m of git("log", "--format=%H%x00%s", arg)
      .split("\n")
      .filter(Boolean)) {
      const [sha, sujet] = m.split("\0");
      const e = verifierMessage(sujet);
      if (e) problemes.push(`${sha.slice(0, 8)} « ${sujet} » : ${e}`);
    }
    sortir(problemes, "Messages de commit conformes.");
  } else {
    console.error(
      "Usage : controles-commit.mjs message <fichier> | indexe | arbre | historique | messages <plage>",
    );
    process.exit(2);
  }
}
