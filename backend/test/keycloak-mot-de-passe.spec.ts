import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Garde-fou exigé par M. Jordan (22/10 et 23/10/2026, Q-6 à Q-8) : le compte de service Keycloak ne
// doit jamais servir à DÉFINIR un mot de passe. Keycloak 26.8.0 ne permet pas de lui retirer ce droit
// sans bloquer la gestion des comptes (limite mesurée, docs/dev/COMPTES-KEYCLOAK.md) : ce test empêche
// le code de l'application de l'utiliser. Il échoue si une telle opération apparaît dans backend/src.
const SRC = join(__dirname, '..', 'src');
const INTERDITS: [RegExp, string][] = [
  [/reset-password/i, 'route Keycloak de définition de mot de passe (reset-password)'],
  [/\/credentials\b/i, 'route Keycloak des identifiants (/credentials)'],
  [/["']?\bcredentials["']?\s*:/, 'mot de passe fourni à la création du compte (credentials)'],
  [/\btemporary\s*:/, 'mot de passe temporaire (temporary)'],
];

function fichiers(dossier: string, liste: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) fichiers(chemin, liste);
    else if (nom.endsWith('.ts')) liste.push(chemin);
  }
  return liste;
}

describe('compte de service Keycloak : jamais de définition de mot de passe', () => {
  it('aucun fichier du backend n’appelle une opération de définition de mot de passe', () => {
    const trouves: string[] = [];
    for (const f of fichiers(SRC)) {
      const texte = readFileSync(f, 'utf8');
      for (const [motif, libelle] of INTERDITS)
        if (motif.test(texte)) trouves.push(`${relative(SRC, f)} : ${libelle}`);
    }
    expect(trouves).toEqual([]);
  });

  it('seul le module keycloak appelle l’API d’administration de Keycloak', () => {
    const appelants = fichiers(SRC)
      .filter((f) => /admin\/realms/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).replaceAll('\\', '/'));
    expect(appelants).toEqual(['keycloak/keycloak-admin.service.ts']);
  });

  it('cas négatif : les motifs détectent bien une définition de mot de passe', () => {
    const exemple = `fetch(\`\${url}/users/\${id}/reset-password\`, { body: JSON.stringify({ temporary: false }) })`;
    expect(INTERDITS.some(([m]) => m.test(exemple))).toBe(true);
    expect(INTERDITS.some(([m]) => m.test("grant_type: 'client_credentials'"))).toBe(false);
  });
});
