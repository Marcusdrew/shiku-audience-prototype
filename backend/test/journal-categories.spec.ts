import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { REFUS_SENSIBLES_A_LA_GARDE } from '../src/habilitation/habilitation.guard.js';
import {
  actionsDes,
  CATEGORIE_DES_ACTIONS,
  CATEGORIES,
  CATEGORIES_VUE_AUTORITE,
  categorieDe,
  LIBELLES_CATEGORIES,
} from '../src/journal/categories.js';
import { insererEntree } from '../src/journal/journal.service.js';
import { MUTATIONS_JOURNALISEES } from './habilitation/mutations-journalisees.js';

// Test de couverture des catégories (Q-1 du 22/10/2026, confirmé par HYPOTHESE(DEC-38) le 23/10 :
// « garde le test qui fait échouer la construction si une action n'a pas de catégorie »).
// Il échoue si une action écrite dans le journal, par l'application ou par le script d'amorçage,
// n'a pas exactement une catégorie de l'énumération fermée.
const RACINE = join(__dirname, '..', '..');
const SRC = join(RACINE, 'backend', 'src');
const SCRIPT_AMORCAGE = join(RACINE, 'scripts', 'amorcer-donnees-test.mjs');

function fichiers(dossier: string, liste: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) fichiers(chemin, liste);
    else if (nom.endsWith('.ts')) liste.push(chemin);
  }
  return liste;
}

/** Actions écrites en littéral dans le code (`action: 'objet.verbe'`) et dans le script. */
function actionsEcrites(): Map<string, string> {
  const trouvees = new Map<string, string>();
  for (const f of fichiers(SRC)) {
    const texte = readFileSync(f, 'utf8');
    for (const m of texte.matchAll(/\baction:\s*'([a-z_]+\.[a-z_]+)'/g))
      trouvees.set(m[1]!, relative(RACINE, f));
    for (const m of texte.matchAll(
      /\baction:\s*contexte\.mode === 'creation' \? '([a-z_.]+)' : '([a-z_.]+)'/g,
    )) {
      trouvees.set(m[1]!, relative(RACINE, f));
      trouvees.set(m[2]!, relative(RACINE, f));
    }
  }
  const script = readFileSync(SCRIPT_AMORCAGE, 'utf8');
  for (const m of script.matchAll(/parSysteme\(\s*"([a-z_]+\.[a-z_]+)"/g))
    trouvees.set(m[1]!, 'scripts/amorcer-donnees-test.mjs');
  return trouvees;
}

describe('journal : classification des actions (énumération fermée)', () => {
  it('dix catégories, chacune avec son libellé', () => {
    expect(CATEGORIES).toHaveLength(10);
    expect(new Set(CATEGORIES).size).toBe(10);
    for (const c of CATEGORIES) expect(LIBELLES_CATEGORIES[c], c).toBeTruthy();
  });

  it('chaque action classée l’est dans une catégorie de l’énumération', () => {
    for (const [action, c] of Object.entries(CATEGORIE_DES_ACTIONS))
      expect((CATEGORIES as readonly string[]).includes(c), `${action} → ${c}`).toBe(true);
  });

  it('chaque action de l’inventaire des mutations a une catégorie', () => {
    const sans = Object.values(MUTATIONS_JOURNALISEES)
      .flat()
      .filter((a) => !CATEGORIE_DES_ACTIONS[a]);
    expect(sans, `actions sans catégorie : ${sans.join(', ')}`).toEqual([]);
  });

  it('chaque action écrite en littéral (application, script d’amorçage) a une catégorie', () => {
    const ecrites = actionsEcrites();
    // Le balayage doit réellement trouver les écritures connues (sinon il ne prouverait rien).
    for (const attendue of [
      'visiteur.creer',
      'role.attribuer',
      'utilisateur.creer',
      'utilisateur.rattacher',
      'systeme.initialiser',
      'rattachement_agenda.initialiser',
    ])
      expect(ecrites.has(attendue), attendue).toBe(true);
    const sans = [...ecrites]
      .filter(([a]) => !CATEGORIE_DES_ACTIONS[a])
      .map(([a, f]) => `${a} (${f})`);
    expect(sans, `actions sans catégorie : ${sans.join(', ')}`).toEqual([]);
  });

  it('chaque refus journalisé par la garde a une catégorie', () => {
    for (const action of Object.keys(REFUS_SENSIBLES_A_LA_GARDE))
      expect(CATEGORIE_DES_ACTIONS[action], action).toBeDefined();
  });

  it('classement décidé le 23/10 (HYPOTHESE(DEC-38)) sur les points tranchés', () => {
    expect(categorieDe('utilisateur.creer')).toBe('comptes_acces');
    expect(categorieDe('role.attribuer')).toBe('droits_delegations');
    expect(categorieDe('demande.saisir_criteres')).toBe('decisions_audiences');
    expect(categorieDe('demande.changer_priorite')).toBe('priorite');
    expect(categorieDe('systeme.initialiser')).toBe('administration_technique');
    expect(categorieDe('rattachement_agenda.initialiser')).toBe('droits_delegations');
    for (const a of [
      'demande.creer',
      'demande.modifier',
      'demande.qualifier',
      'audience.demarrer',
      'audience.terminer',
    ])
      expect(categorieDe(a), a).toBe('decisions_audiences');
  });

  it('une action inconnue est refusée avant toute écriture', async () => {
    expect(() => categorieDe('inconnue.action')).toThrow(/sans catégorie/);
    const query = vi.fn();
    await expect(
      insererEntree({ query } as never, {
        organisationId: 'o',
        utilisateurId: 'u',
        action: 'inconnue.action',
        objetType: 'x',
      }),
    ).rejects.toThrow(/sans catégorie/);
    expect(query).not.toHaveBeenCalled();
  });

  it('vue limitée de l’Autorité : ni « décisions et audiences » ni « comptes et accès »', () => {
    expect([...CATEGORIES_VUE_AUTORITE].sort()).toEqual(
      [
        'consultation_dossier_relationnel',
        'droits_delegations',
        'priorite',
        'signalement_revue',
      ].sort(),
    );
    const visibles = actionsDes(CATEGORIES_VUE_AUTORITE);
    expect(visibles).toContain('role.attribuer');
    expect(visibles).toContain('demande.changer_priorite');
    expect(visibles).not.toContain('decision.valider');
    expect(visibles).not.toContain('utilisateur.creer');
  });
});
