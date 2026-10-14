import type { Matrice } from './matrice.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  MATRICE PROVISOIRE : HYPOTHESE (H1). NE PAS PRÉSENTER COMME UNE DÉCISION MÉTIER VALIDÉE.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// La matrice RBAC officielle (26 actions × 5 profils, `phase-03-matrice-rbac-delegation.md`) n'est
// pas disponible dans ce dépôt. Cette matrice ne reprend que ce que les stories du backlog
// affirment explicitement (colonne « source »). Tout le reste est REFUSÉ par défaut.
//
//  - Les délégations (D) ne sont pas modélisées : l'Assistant n'a pas le droit de décider.
//  - `audience.cloturer` n'a AUCUN rôle : le responsable de la clôture n'est désigné par aucune
//    source (HYPOTHESE H4). Tant que ce n'est pas tranché, personne ne peut clôturer.
//  - `visiteur.creer` pour l'Assistant suit US-05-029 ; la création par la Réception (DEC-19)
//    n'est PAS accordée ici.
//  - `journal.consulter` réservé à l'Autorité : HYPOTHESE H9 (D04-12 désigne l'Autorité pour la revue).
//  - HYPOTHESE H12 : plusieurs actions ont été ajoutées ou élargies pour rendre le parcours utilisable
//    (lecture des demandes par la Réception et l'Autorité, modification, file de décisions, planning,
//    liste des agendas). Chacune le dit dans son champ `source`.
// À remplacer par la matrice officielle dès sa fourniture, ligne à ligne.
export const MATRICE_PROVISOIRE: Matrice = {
  statut: 'HYPOTHESE',
  reference: 'HYPOTHESE H1 : dérivée du backlog, en attente de phase-03-matrice-rbac-delegation.md',
  actions: {
    'visiteur.rechercher': {
      roles: ['reception', 'assistant'],
      source: 'US-05-028 (backlog) ; Assistant ajouté : HYPOTHESE H12 (il crée les visiteurs)',
    },
    'visiteur.creer': { roles: ['assistant'], source: 'US-05-029 (backlog) ; DEC-19 ouverte' },
    'demande.creer': { roles: ['reception'], source: 'US-05-037 (backlog)' },
    'demande.qualifier_initialement': { roles: ['reception'], source: 'US-05-038 (backlog)' },
    'demande.consulter': {
      roles: ['reception', 'assistant', 'authority'],
      source: 'US-05-039 (backlog, Assistant) ; Réception et Autorité ajoutées : HYPOTHESE H12',
      remarque:
        'Réception : nécessaire pour qualifier ; Autorité : nécessaire pour décider (US-05-043, 045).',
    },
    'demande.modifier': {
      roles: ['reception', 'assistant'],
      source: 'HYPOTHESE H12 : aucune story ne désigne qui corrige une demande',
    },
    'demande.qualifier_categorie': { roles: ['assistant'], source: 'US-05-040 (backlog)' },
    'decision.valider_rejeter': {
      roles: ['authority'],
      source: 'US-05-043 (backlog)',
      remarque: 'Délégable à l’Assistant selon le backlog : délégation non modélisée ici.',
    },
    'decision.differer': { roles: ['authority'], source: 'US-05-044 (backlog)' },
    'decision.consulter': {
      roles: ['authority', 'assistant'],
      source: 'US-05-045 (backlog, Autorité) ; Assistant : HYPOTHESE H12 (menu du frontend)',
    },
    'audience.consulter': {
      roles: ['assistant', 'authority'],
      source: 'US-05-051 (backlog, Assistant) ; Autorité : HYPOTHESE H12',
    },
    'agenda.lister': {
      roles: ['reception', 'assistant', 'authority', 'administrator'],
      source:
        'HYPOTHESE H12 : nécessaire pour créer une demande ; règle de visibilité EF03-24 absente',
    },
    'audience.planifier': { roles: ['assistant'], source: 'US-05-047 (backlog)' },
    'audience.demarrer_terminer': { roles: ['assistant'], source: 'US-05-056 (backlog)' },
    'audience.cloturer': {
      roles: [],
      source: 'AUCUNE : responsable non désigné (HYPOTHESE H4)',
      remarque: 'Volontairement vide : refusé à tous tant que le métier ne tranche pas.',
    },
    'agenda.administrer': { roles: ['administrator'], source: 'US-05-024 (backlog)' },
    'utilisateur.administrer': { roles: ['administrator'], source: 'US-05-004 (backlog)' },
    'journal.consulter': { roles: ['authority'], source: 'HYPOTHESE H9 (D04-12)' },
  },
};
