import { describe, expect, it } from 'vitest';
import { HabilitationService } from '../../src/habilitation/habilitation.service.js';
import { MatriceInvalideError, validerMatrice } from '../../src/habilitation/matrice.js';
import { MATRICE_OFFICIELLE } from '../../src/habilitation/matrice-officielle.js';
import { ROLES } from '../../src/habilitation/roles.js';

const valide = () => ({
  statut: 'HYPOTHESE',
  reference: 'essai',
  actions: { 'demande.creer': { roles: ['reception'], source: 'US-05-037' } },
});

// Transcription INDÉPENDANTE du tableau de phase-03-matrice-rbac-delegation.md (colonnes Autorité,
// Assistant, Réception, Protocole, Administrateur). Si quelqu'un modifie la matrice du code sans
// que ce tableau change, ce test échoue : il fige l'écart avec la source.
type Cell = 'P' | 'D' | 'L' | '-';
const OFFICIEL: Record<string, [Cell, Cell, Cell, Cell, Cell]> = {
  'visiteur.rechercher': ['P', 'P', 'P', 'D', '-'],
  'demande.creer': ['P', 'P', 'P', 'D', '-'],
  'demande.qualifier': ['P', 'P', 'L', 'D', '-'],
  'demande.consulter': ['P', 'P', 'L', 'L', '-'],
  'decision.valider_rejeter': ['P', 'D', '-', '-', '-'],
  'decision.differer': ['P', 'D', '-', '-', '-'],
  'demande.changer_priorite': ['P', 'D', '-', '-', '-'],
  'audience.planifier': ['P', 'D', '-', 'D', '-'],
  'audience.annuler': ['P', 'D', '-', 'D', '-'],
  'accueil.enregistrer_arrivee': ['P', 'P', 'P', 'D', '-'],
  'accueil.appeler': ['P', 'P', '-', 'D', '-'],
  'audience.demarrer_terminer': ['P', 'P', '-', 'D', '-'],
  'relationnel.consulter_dossier': ['P', 'D', '-', '-', '-'],
  'relationnel.commenter_creer': ['P', 'D', '-', '-', '-'],
  'relationnel.commenter_modifier': ['P', 'D', '-', '-', '-'],
  'relationnel.commenter_supprimer': ['P', 'D', '-', '-', '-'],
  'dashboard.consulter': ['P', 'P', 'L', 'L', '-'],
  'utilisateur.administrer': ['-', '-', '-', '-', 'P'],
  'agenda.administrer': ['-', '-', '-', '-', 'P'],
  'delegation.configurer': ['-', '-', '-', '-', 'P'],
  'delegation.enregistrer': ['-', '-', '-', '-', 'P'],
  'delegation.revoquer': ['-', '-', '-', '-', 'P'],
  'journal.consulter': ['L', '-', '-', '-', 'D'],
  'audit.consulter_exceptions': ['P', '-', '-', '-', '-'],
  'contenu.consulter_supprime': ['P', '-', '-', '-', '-'],
  'note.revue_signalee': ['P', '-', '-', '-', '-'],
};
const COLONNES = ['authority', 'assistant', 'reception', 'protocole', 'administrator'] as const;

describe('matrice officielle (Gate 02A)', () => {
  it('est OFFICIELLE, cite son document source et passe la validation structurelle', () => {
    expect(MATRICE_OFFICIELLE.statut).toBe('OFFICIELLE');
    expect(MATRICE_OFFICIELLE.reference).toContain('phase-03-matrice-rbac-delegation.md');
    expect(() => validerMatrice(MATRICE_OFFICIELLE)).not.toThrow();
  });

  it.each(Object.entries(OFFICIEL))('%s reproduit la ligne officielle', (action, cellules) => {
    const def = MATRICE_OFFICIELLE.actions[action];
    expect(def, `action officielle absente du code : ${action}`).toBeDefined();
    COLONNES.forEach((col, i) => {
      const cellule = cellules[i]!;
      const permis = (def!.roles as readonly string[]).includes(col);
      const delegue = (def!.delegues ?? ([] as readonly string[])).includes(col);
      // P et L : permis dans le périmètre ; D : jamais permis sans délégation ; — : interdit.
      // Le Protocole n'a pas de compte permanent (D04-24) : même un P/L n'existe que par profil
      // de délégation, donc il est toujours « délégué », jamais « permis ».
      const viaDelegation = cellule === 'D' || (col === 'protocole' && cellule !== '-');
      expect({ col, permis }).toEqual({
        col,
        permis: col !== 'protocole' && (cellule === 'P' || cellule === 'L'),
      });
      expect({ col, delegue }).toEqual({ col, delegue: viaDelegation });
    });
  });

  it('ne contient que les 26 actions officielles et des extensions explicitement marquées', () => {
    const hors = Object.entries(MATRICE_OFFICIELLE.actions)
      .filter(([nom]) => !(nom in OFFICIEL))
      .map(([nom, d]) => ({ nom, hypothese: d.hypothese }));
    expect(Object.keys(OFFICIEL)).toHaveLength(26);
    for (const e of hors) expect(e.hypothese, `${e.nom} sans hypothèse`).toBeTruthy();
    expect(hors.map((e) => e.nom).sort()).toEqual([
      'agenda.lister',
      'audience.cloturer',
      'audience.consulter',
      'decision.consulter',
      'demande.modifier',
      'visiteur.creer',
    ]);
  });

  it("le Protocole n'est jamais permis (P/L) : il n'existe que par délégation", () => {
    for (const d of Object.values(MATRICE_OFFICIELLE.actions))
      expect((d.roles as readonly string[]).includes('protocole')).toBe(false);
  });

  it('chaque règle cite sa source et seuls les quatre rôles du realm sont permis', () => {
    for (const d of Object.values(MATRICE_OFFICIELLE.actions)) {
      expect(d.source.length).toBeGreaterThan(0);
      for (const r of d.roles) expect(ROLES).toContain(r);
    }
  });

  it('un droit « D » est refusé tant qu’aucune délégation n’existe (Assistant ne décide pas, ne planifie pas)', () => {
    const s = new HabilitationService(MATRICE_OFFICIELLE);
    expect(s.estAutorise(['assistant'], 'decision.valider_rejeter')).toBe(false);
    expect(s.estAutorise(['assistant'], 'decision.differer')).toBe(false);
    expect(s.estAutorise(['assistant'], 'audience.planifier')).toBe(false);
    expect(s.estAutorise(['administrator'], 'journal.consulter')).toBe(false);
    expect(s.estAutorise(['authority'], 'decision.valider_rejeter')).toBe(true);
    expect(s.estAutorise(['authority'], 'audience.planifier')).toBe(true);
  });

  it('la Réception ne décide pas, ne planifie pas, ne lit pas le journal ni les décisions', () => {
    const s = new HabilitationService(MATRICE_OFFICIELLE);
    for (const a of [
      'decision.valider_rejeter',
      'audience.planifier',
      'audience.demarrer_terminer',
      'journal.consulter',
      'decision.consulter',
      'audience.consulter',
    ])
      expect(s.estAutorise(['reception'], a), a).toBe(false);
  });

  it('l’Administrateur administre mais ne touche à aucune action métier', () => {
    const s = new HabilitationService(MATRICE_OFFICIELLE);
    expect(s.estAutorise(['administrator'], 'utilisateur.administrer')).toBe(true);
    for (const a of [
      'demande.creer',
      'demande.consulter',
      'decision.valider_rejeter',
      'visiteur.creer',
    ])
      expect(s.estAutorise(['administrator'], a), a).toBe(false);
  });

  it('une action inconnue est refusée à tous', () => {
    const s = new HabilitationService(MATRICE_OFFICIELLE);
    for (const r of ROLES) expect(s.estAutorise([r], 'inconnue.action')).toBe(false);
  });

  it('création de visiteur (arbitrage du 19/10) : Réception, Assistant et Autorité ; jamais l’Administrateur', () => {
    const s = new HabilitationService(MATRICE_OFFICIELLE);
    for (const r of ['reception', 'assistant', 'authority'] as const)
      expect(s.estAutorise([r], 'visiteur.creer'), r).toBe(true);
    expect(s.estAutorise(['administrator'], 'visiteur.creer')).toBe(false);
  });

  it('la clôture (arbitrage du 19/10) : Autorité et Assistant, pas la Réception ni l’Administrateur', () => {
    const s = new HabilitationService(MATRICE_OFFICIELLE);
    expect(s.estAutorise(['assistant'], 'audience.cloturer')).toBe(true);
    expect(s.estAutorise(['authority'], 'audience.cloturer')).toBe(true);
    expect(s.estAutorise(['reception'], 'audience.cloturer')).toBe(false);
    expect(s.estAutorise(['administrator'], 'audience.cloturer')).toBe(false);
  });
});

describe('validation de la matrice (échec fermé au démarrage)', () => {
  it.each([
    ['statut inconnu', { ...valide(), statut: 'DEFINITIVE' }],
    ['référence vide', { ...valide(), reference: ' ' }],
    [
      'OFFICIELLE sans document source',
      { ...valide(), statut: 'OFFICIELLE', reference: 'HYPOTHESE H1' },
    ],
    ['actions absentes', { statut: 'HYPOTHESE', reference: 'x' }],
    [
      'nom d’action invalide',
      { ...valide(), actions: { 'Demande-Creer': { roles: [], source: 's' } } },
    ],
    [
      'rôle inconnu (ex. protocole)',
      { ...valide(), actions: { 'a.b': { roles: ['protocole'], source: 's' } } },
    ],
    [
      'rôle en double',
      { ...valide(), actions: { 'a.b': { roles: ['assistant', 'assistant'], source: 's' } } },
    ],
    [
      'profil délégué inconnu',
      { ...valide(), actions: { 'a.b': { roles: [], delegues: ['stagiaire'], source: 's' } } },
    ],
    [
      'rôle à la fois permis (P) et délégué (D)',
      {
        ...valide(),
        actions: { 'a.b': { roles: ['assistant'], delegues: ['assistant'], source: 's' } },
      },
    ],
    ['source manquante', { ...valide(), actions: { 'a.b': { roles: ['assistant'], source: '' } } }],
    ['valeur non objet', 'texte'],
  ])('refuse : %s', (_nom, matrice) => {
    expect(() => validerMatrice(matrice)).toThrow(MatriceInvalideError);
  });
});

describe('HabilitationService (refus par défaut)', () => {
  const s = new HabilitationService(validerMatrice(valide()));
  it('autorise un rôle listé', () =>
    expect(s.estAutorise(['reception'], 'demande.creer')).toBe(true));
  it('refuse un rôle non listé', () =>
    expect(s.estAutorise(['authority'], 'demande.creer')).toBe(false));
  it('refuse une action absente de la matrice', () =>
    expect(s.estAutorise(['administrator'], 'action.inconnue')).toBe(false));
  it('refuse sans aucun rôle', () => expect(s.estAutorise([], 'demande.creer')).toBe(false));
  it('refuse les noms hérités de Object.prototype', () => {
    expect(s.estAutorise(['reception'], 'constructor')).toBe(false);
    expect(s.estAutorise(['reception'], '__proto__')).toBe(false);
  });
});
