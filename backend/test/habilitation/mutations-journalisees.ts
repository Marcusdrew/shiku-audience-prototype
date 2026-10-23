// Inventaire des routes de MUTATION et des entrées de journal qu'elles écrivent (US-05-010 : « aucune
// action sensible n'échappe à la journalisation »). Deux tests s'appuient dessus :
//  - routes-declarees.spec.ts : toute route non-GET de l'application DOIT figurer ici ;
//  - db/api-metier.spec.ts : chaque action listée a réellement produit une entrée attribuée.
// Les LECTURES et l'administration directe de Keycloak ne sont PAS journalisées (docs/dev/JOURNAL.md,
// « Ce qui n'est pas journalisé »). Seuls les refus SENSIBLES le sont (HYPOTHESE(DEC-38)) : voir
// ACTIONS_HORS_ROUTES. Chaque action a une catégorie (test journal-categories.spec.ts).
export const MUTATIONS_JOURNALISEES: Readonly<Record<string, readonly string[]>> = {
  'agendas creer': ['agenda.creer', 'rattachement_agenda.proposer'],
  'agendas rattacher': ['rattachement_agenda.proposer'],
  'rattachements autoriser': ['rattachement_agenda.autoriser'],
  'rattachements appliquer': ['rattachement_agenda.appliquer'],
  'rattachements revoquer': ['rattachement_agenda.revoquer'],
  'visiteurs creer': ['visiteur.creer'],
  'visiteurs modifier': ['visiteur.modifier'],
  'demandes creer': ['demande.creer'],
  'demandes modifier': ['demande.modifier'],
  'demandes qualifier': ['demande.qualifier'],
  '/ criteres': ['demande.saisir_criteres'],
  '/ priorite': ['demande.changer_priorite'],
  '/ decider': ['decision.valider', 'decision.rejeter', 'decision.differer'],
  'audiences planifier': ['audience.planifier'],
  'audiences demarrer': ['audience.demarrer'],
  'audiences terminer': ['audience.terminer'],
  'audiences cloturer': ['audience.cloturer'],
  'utilisateurs creer': ['utilisateur.creer', 'role.attribuer'],
  'utilisateurs rattachement': ['utilisateur.rattacher'],
};

// Actions écrites hors d'une route de mutation : refus sensible relevé par la garde (lecture du journal
// sans accès) et entrées de l'initialisation, au nom du « système » (scripts/amorcer-donnees-test.mjs).
export const ACTIONS_HORS_ROUTES: readonly string[] = [
  'journal.consulter',
  'systeme.initialiser',
  'rattachement_agenda.initialiser',
];
