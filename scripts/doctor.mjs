// Diagnostic des prérequis du poste (T0-03) : OK ou KO par prérequis, code de sortie 1 si un seul manque.
// Usage : node scripts/doctor.mjs        (ou : pnpm doctor, une fois pnpm installé)
// Les versions sont HYPOTHESE(DEC-04) tant que le représentant habilité ne les a pas fixées (PREREQUIS.md).
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Chaque prérequis : commande de vérification, test sur sa sortie, aide en cas de KO. */
export const PREREQUIS = [
  {
    nom: "Node.js 24.x",
    commande: ["node", "--version"],
    ok: (sortie) => /^v24\./.test(sortie.trim()),
    aide: "Installer Node.js 24 (LTS) : https://nodejs.org ; vérifier avec « node --version ».",
  },
  {
    nom: "pnpm 12.10.1 (version exacte)",
    commande: ["pnpm", "--version"],
    ok: (sortie) => sortie.trim() === "12.10.1",
    aide: "npm install --global pnpm@12.10.1",
  },
  {
    nom: "Git",
    commande: ["git", "--version"],
    ok: (sortie) => /^git version \d+\./.test(sortie.trim()),
    aide: "Installer Git (avec Git Bash sous Windows) : https://git-scm.com",
  },
  {
    nom: "Docker",
    commande: ["docker", "--version"],
    ok: (sortie) => /^Docker version \d+\./.test(sortie.trim()),
    aide: "Installer Docker Desktop (WSL 2 sous Windows) : https://www.docker.com",
  },
  {
    nom: "Docker Compose",
    commande: ["docker", "compose", "version"],
    ok: (sortie) => /Docker Compose version v?\d+\./.test(sortie.trim()),
    aide: "Docker Compose est fourni avec Docker Desktop (« docker compose version »).",
  },
  {
    // Le client SQL n'est pas installé sur le poste : il vient du conteneur de la base (T0-01).
    nom: "Client PostgreSQL (psql, fourni par le conteneur db)",
    // Lit docker-compose.yml plutôt que « docker compose config » : ce dernier échoue tant que .env
    // n'existe pas, donc avant le premier bootstrap.
    commande: [
      "node",
      "-e",
      "process.stdout.write(require('fs').readFileSync('docker-compose.yml','utf8'))",
    ],
    ok: (sortie) => /^ {2}db:/m.test(sortie),
    aide: "Le client psql est celui du conteneur « db » (docker-compose.yml) : lancer « docker compose up -d db ».",
  },
];

/** Exécute une commande et renvoie sa sortie, ou null si elle est absente ou échoue. */
export function executerReel(commande) {
  const r = spawnSync(commande[0], commande.slice(1), {
    encoding: "utf8",
    timeout: 15000,
    shell: false,
  });
  if (r.error || r.status !== 0) return null;
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
}

/** `executer` est injectable : les tests simulent un poste sans rien installer ni désinstaller. */
export function diagnostiquer(executer = executerReel, prerequis = PREREQUIS) {
  return prerequis.map((p) => {
    const sortie = executer(p.commande);
    return {
      nom: p.nom,
      ok: sortie !== null && p.ok(sortie),
      detail:
        sortie === null
          ? "introuvable ou en échec"
          : sortie.trim().split("\n")[0],
      aide: p.aide,
    };
  });
}

export const codeSortie = (resultats) => (resultats.every((r) => r.ok) ? 0 : 1);

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.chdir(fileURLToPath(new URL("..", import.meta.url))); // racine du dépôt, d'où que l'on lance
  const resultats = diagnostiquer();
  for (const r of resultats) {
    console.log(`${r.ok ? "OK  " : "KO  "} ${r.nom} : ${r.detail}`);
    if (!r.ok) console.log(`      → ${r.aide}`);
  }
  const code = codeSortie(resultats);
  console.log(
    code === 0
      ? "RESULTAT : poste prêt."
      : "RESULTAT : prérequis manquants (voir ci-dessus).",
  );
  process.exit(code);
}
