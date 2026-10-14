import { describe, expect, it } from 'vitest';
import { HabilitationService } from '../../src/habilitation/habilitation.service.js';
import { MatriceInvalideError, validerMatrice } from '../../src/habilitation/matrice.js';
import { MATRICE_PROVISOIRE } from '../../src/habilitation/matrice-provisoire.js';
import { ROLES } from '../../src/habilitation/roles.js';

const valide = () => ({
  statut: 'HYPOTHESE',
  reference: 'essai',
  actions: { 'demande.creer': { roles: ['reception'], source: 'US-05-037' } },
});

describe('matrice provisoire', () => {
  it('est marquée HYPOTHESE et passe la validation structurelle', () => {
    expect(MATRICE_PROVISOIRE.statut).toBe('HYPOTHESE');
    expect(() => validerMatrice(MATRICE_PROVISOIRE)).not.toThrow();
  });

  it("chaque règle cite sa source et n'utilise que les quatre rôles du realm", () => {
    for (const [, d] of Object.entries(MATRICE_PROVISOIRE.actions)) {
      expect(d.source.length).toBeGreaterThan(0);
      for (const r of d.roles) expect(ROLES).toContain(r);
    }
  });

  it('ne désigne personne pour la clôture (responsable non défini, H4)', () => {
    expect(MATRICE_PROVISOIRE.actions['audience.cloturer'].roles).toEqual([]);
  });

  it('n’accorde à la Réception aucune décision ni aucun accès au journal', () => {
    const s = new HabilitationService(MATRICE_PROVISOIRE);
    expect(s.estAutorise(['reception'], 'decision.valider_rejeter')).toBe(false);
    expect(s.estAutorise(['reception'], 'journal.consulter')).toBe(false);
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
