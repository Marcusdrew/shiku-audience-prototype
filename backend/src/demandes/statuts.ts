// Statuts d'une demande et transitions. HYPOTHESE H14 : cette machine d'états est déduite des
// guides de sprint 4 à 7 ; aucune source ne la fixe formellement. Elle est testée (statuts.spec.ts).
export const STATUTS_DEMANDE = [
  'recue',
  'qualifiee',
  'differee',
  'validee',
  'rejetee',
  'planifiee',
  'realisee',
  'cloturee',
] as const;
export type StatutDemande = (typeof STATUTS_DEMANDE)[number];

/** Statuts où les champs de saisie d'une demande peuvent encore être corrigés. */
export const STATUTS_MODIFIABLES: readonly StatutDemande[] = ['recue', 'qualifiee', 'differee'];

/** Statuts d'où l'Autorité peut rendre une décision (valider, rejeter, différer). */
export const STATUTS_DECIDABLES: readonly StatutDemande[] = ['recue', 'qualifiee', 'differee'];

export const TRANSITIONS: Readonly<Record<StatutDemande, readonly StatutDemande[]>> = {
  recue: ['qualifiee', 'validee', 'rejetee', 'differee'],
  qualifiee: ['validee', 'rejetee', 'differee'],
  differee: ['validee', 'rejetee'],
  validee: ['planifiee'],
  rejetee: [],
  planifiee: ['realisee'],
  realisee: ['cloturee'],
  cloturee: [],
};

export const transitionPermise = (de: StatutDemande, vers: StatutDemande) =>
  TRANSITIONS[de].includes(vers);
