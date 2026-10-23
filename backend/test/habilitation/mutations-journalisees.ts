// Inventaire des routes de MUTATION et des entrées de journal qu'elles écrivent (US-05-010 : « aucune
// action sensible n'échappe à la journalisation »). Deux tests s'appuient dessus :
//  - routes-declarees.spec.ts : toute route non-GET de l'application DOIT figurer ici ;
//  - db/api-metier.spec.ts : chaque action listée a réellement produit une entrée attribuée.
// Les LECTURES, les REFUS et l'administration directe de Keycloak ne sont PAS journalisés : la règle
// métier n'est pas arrêtée (voir docs/dev/JOURNAL.md, « Ce qui n'est pas journalisé »).
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
  'utilisateurs creer': ['utilisateur.creer'],
  'utilisateurs rattachement': ['utilisateur.rattacher'],
};
