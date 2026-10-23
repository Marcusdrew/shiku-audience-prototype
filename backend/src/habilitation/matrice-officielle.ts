import type { Matrice } from './matrice.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  MATRICE RBAC « Gate 02A » : données de configuration, sans logique.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Source : `phase-03-matrice-rbac-delegation.md` (statut : décisions PO validées, matrice persistée),
// fournie par M. Jordan le 16/10/2026, avec les trois ajouts du 2026-09-01 (D04-12, D04-13, D04-15).
//
// Lecture des symboles :
//   P  permis dans le périmètre du rôle      → le rôle figure dans `roles`.
//   L  accès limité à ce qui est nécessaire  → le rôle figure dans `roles`, et `limites` dit comment.
//   D  permis SEULEMENT avec délégation       → le rôle figure dans `delegues`, JAMAIS dans `roles`.
//   —  interdit                              → absent.
// Les délégations (Sprint 2) ne sont pas encore modélisées : un `D` est donc refusé, sans exception.
// Le Protocole n'a pas de compte permanent (D04-24) : ce n'est pas un rôle du jeton, seulement un
// profil de délégation. Il n'apparaît donc que dans `delegues`.
//
// Une action absente de cette table est REFUSÉE à tous (refus par défaut).
//
// EXTENSIONS : quelques actions, nécessaires au parcours livré, ne figurent PAS dans la matrice
// officielle. Elles portent un champ `hypothese`, sont comptées par un test et doivent être
// confirmées ou retirées par le métier : voir docs/dev/HYPOTHESES.md.
export const MATRICE_OFFICIELLE: Matrice = {
  statut: 'OFFICIELLE',
  reference:
    'phase-03-matrice-rbac-delegation.md (Gate 02A, décisions PO validées) + ajouts du 2026-09-01',
  actions: {
    // ── Les 23 actions de Gate 02A ──────────────────────────────────────────────────────────
    'visiteur.rechercher': {
      roles: ['authority', 'assistant', 'reception'],
      delegues: ['protocole'],
      source: 'Gate 02A : Rechercher visiteur',
      limites: 'Recherche limitée au périmètre et aux données nécessaires.',
      implementee: true,
    },
    'demande.creer': {
      roles: ['authority', 'assistant', 'reception'],
      delegues: ['protocole'],
      source: 'Gate 02A : Créer demande',
      limites: 'Nom, objet, agenda/Autorité et contact, sauf dérogation justifiée.',
      implementee: true,
    },
    'demande.qualifier': {
      roles: ['authority', 'assistant', 'reception'],
      delegues: ['protocole'],
      source: 'Gate 02A : Qualifier une demande',
      limites: 'Réception : qualification initiale seulement ; aucune décision.',
      implementee: true,
    },
    'demande.consulter': {
      roles: ['authority', 'assistant', 'reception'],
      delegues: ['protocole'],
      source: 'Gate 02A : Consulter une demande',
      limites:
        'Réception : données nécessaires à la fonction ; elle ne reçoit ni décisions ni audience.',
      implementee: true,
    },
    'decision.valider_rejeter': {
      roles: ['authority'],
      delegues: ['assistant'],
      source: 'Gate 02A : Valider / rejeter',
      limites: 'Acte décisionnel, périmètre explicitement délégué.',
      implementee: true,
    },
    'decision.differer': {
      roles: ['authority'],
      delegues: ['assistant'],
      source: 'Gate 02A : Décision différée',
      limites: 'État de décision distinct de la salle d’attente.',
      implementee: true,
    },
    'demande.changer_priorite': {
      roles: ['authority'],
      delegues: ['assistant'],
      source: 'Gate 02A : Changer priorité',
      limites: 'Justification, critères visibles et audit obligatoire.',
      implementee: false,
    },
    'audience.planifier': {
      roles: ['authority'],
      delegues: ['assistant', 'protocole'],
      source: 'Gate 02A : Planifier / reprogrammer',
      limites: 'Dans le périmètre d’agenda autorisé. Reprogrammation : non développée.',
      implementee: true,
    },
    'audience.annuler': {
      roles: ['authority'],
      delegues: ['assistant', 'protocole'],
      source: 'Gate 02A : Annuler',
      limites: 'Motif et audit requis.',
      implementee: false,
    },
    'accueil.enregistrer_arrivee': {
      roles: ['authority', 'assistant', 'reception'],
      delegues: ['protocole'],
      source: 'Gate 02A : Enregistrer arrivée / attente',
      limites: 'Opération limitée au flux d’accueil.',
      implementee: false,
    },
    'accueil.appeler': {
      roles: ['authority', 'assistant'],
      delegues: ['protocole'],
      source: 'Gate 02A : Appeler un visiteur',
      limites: 'Assistant : opérateur principal.',
      implementee: false,
    },
    'audience.demarrer_terminer': {
      roles: ['authority', 'assistant'],
      delegues: ['protocole'],
      source: 'Gate 02A : Démarrer / terminer audience',
      limites: 'Suivi opérationnel ; contrôle d’accès à l’exécution.',
      implementee: true,
    },
    'relationnel.consulter_dossier': {
      roles: ['authority'],
      delegues: ['assistant'],
      source: 'Gate 02A : Consulter dossier relationnel',
      limites: 'Confidentialité, besoin d’en connaître et périmètre autorisé.',
      implementee: false,
    },
    'relationnel.commenter_creer': {
      roles: ['authority'],
      delegues: ['assistant'],
      source: 'Gate 02A : Créer commentaire relationnel confidentiel',
      limites: 'Contenu professionnel nécessaire ; interdictions D03-08.',
      implementee: false,
    },
    'relationnel.commenter_modifier': {
      roles: ['authority'],
      delegues: ['assistant'],
      source: 'Gate 02A : Modifier commentaire relationnel',
      limites: 'Auteur ou rôle supérieur habilité ; historique intégral.',
      implementee: false,
    },
    'relationnel.commenter_supprimer': {
      roles: ['authority'],
      delegues: ['assistant'],
      source: 'Gate 02A : Supprimer logiquement un commentaire',
      limites: 'Motif obligatoire ; aucune suppression physique métier.',
      implementee: false,
    },
    'dashboard.consulter': {
      roles: ['authority', 'assistant', 'reception'],
      delegues: ['protocole'],
      source: 'Gate 02A : Consulter dashboard',
      limites: 'Indicateurs et filtres limités au périmètre autorisé (Réception et Protocole : L).',
      implementee: false,
    },
    'utilisateur.administrer': {
      roles: ['administrator'],
      delegues: [],
      source: 'Gate 02A : Administrer utilisateurs / rôles',
      limites: 'Périmètre administratif autorisé ; aucune auto-attribution métier.',
      implementee: true,
    },
    'agenda.administrer': {
      roles: ['administrator'],
      delegues: [],
      source: 'Gate 02A : Administrer agendas / référentiels',
      limites: 'Périmètre administratif autorisé, distinct de la décision métier.',
      implementee: true,
    },
    'delegation.configurer': {
      roles: ['administrator'],
      delegues: [],
      source: 'Gate 02A : Configurer mécanisme de délégation',
      limites: 'Paramétrage technique/fonctionnel, sans création d’autorité métier.',
      implementee: false,
    },
    'delegation.enregistrer': {
      roles: ['administrator'],
      delegues: [],
      source: 'Gate 02A : Enregistrer / appliquer une délégation autorisée',
      limites: 'Autorisation, source, périmètre et durée préexistants et identifiables.',
      implementee: false,
    },
    'delegation.revoquer': {
      roles: ['administrator'],
      delegues: [],
      source: 'Gate 02A : Appliquer une révocation autorisée',
      limites: 'Autorité compétente identifiée ; effet immédiat et audit.',
      implementee: false,
    },
    'journal.consulter': {
      roles: ['authority'],
      delegues: ['administrator'],
      source: 'Gate 02A : Consulter historique administratif / audit',
      limites:
        'Autorité : L. Administrateur : D, jamais sans habilitation explicite (délégation non modélisée : refusé). ' +
        'L’étendue exacte du « L » de l’Autorité n’est pas définie : voir HYPOTHESES.md (H9).',
      implementee: true,
    },
    // ── Trois ajouts du 2026-09-01 (Autorité seule) ─────────────────────────────────────────
    'audit.consulter_exceptions': {
      roles: ['authority'],
      delegues: [],
      source: 'Ajout 2026-09-01 (D04-12, D04-13) : liste d’exceptions d’audit',
      limites: 'Six signaux seulement ; ne donne pas accès au journal intégral.',
      implementee: false,
    },
    'contenu.consulter_supprime': {
      roles: ['authority'],
      delegues: [],
      source: 'Ajout 2026-09-01 (D04-15) : contenu logiquement supprimé',
      limites: 'Rôle de contrôle ; motif de consultation tracé.',
      implementee: false,
    },
    'note.revue_signalee': {
      roles: ['authority'],
      delegues: [],
      source: 'Ajout 2026-09-01 (D04-12) : revue d’une note signalée',
      limites: 'Issue de la revue tracée (EF03-20).',
      implementee: false,
    },

    // ── EXTENSIONS : absentes de la matrice officielle (champ `hypothese`) ───────────────────
    'visiteur.creer': {
      roles: ['authority', 'assistant', 'reception'],
      delegues: [],
      source:
        'DEC-19 tranchée par M. Jordan le 19/10/2026 (ACTE-ARB-2026-10-19, signature à apposer) : ' +
        'Réception, Assistant et Autorité créent un visiteur ; création journalisée',
      // Reste une extension tant que l'acte qui ajoute « Créer visiteur » à la matrice n'est pas pris.
      hypothese: 'ACTE-ARB-2026-10-19 (ajout à la matrice par un acte à venir)',
      limites:
        'Réception : identité minimale et contact seulement, après recherche (contrôlé par le serveur ' +
        'pour les champs) ; la qualification reste à l’Assistant. Interface publique par code QR : hors périmètre (DEC-31).',
      implementee: true,
    },
    'visiteur.modifier': {
      roles: ['authority', 'assistant'],
      delegues: [],
      source:
        'Réponse de M. Jordan du 22/10/2026 (Q-12, DEC-36) : l’Assistant et l’Autorité modifient un ' +
        'visiteur (qualification) ; la Réception crée mais ne modifie pas ; modification journalisée',
      // Reste une extension tant que l'acte qui ajoute « Modifier visiteur » à la matrice n'est pas pris.
      hypothese: 'HYPOTHESE(DEC-36) : « Modifier visiteur », acte à venir',
      limites:
        'Nom, prénom, contact, qualification. Fusion de doublons hors MVP. Valeurs avant et après ' +
        'dans le journal : en attente de Q-5 (seuls les noms des champs sont tracés).',
      implementee: true,
    },
    'agenda.autoriser_rattachement': {
      roles: ['authority'],
      delegues: [],
      source:
        'Réponses de M. Jordan du 22/10/2026 (Q-10 et point 7, DEC-32) : « l’Autorité autorise, ' +
        'l’Administrateur applique » le rattachement Autorité ↔ agenda, dans l’application, journalisé',
      hypothese: 'HYPOTHESE(DEC-32) : périmètre de l’Autorité, règle provisoire',
      limites:
        'L’Autorité désignée autorise ou révoque SON rattachement ; l’application relève de ' +
        '`agenda.administrer` (Administrateur).',
      implementee: true,
    },
    'demande.modifier': {
      roles: ['authority', 'assistant', 'reception'],
      delegues: [],
      source: 'Aucune ligne officielle : calquée sur « Créer demande »',
      hypothese: 'H12',
      limites: 'Champs modifiables limités, statuts non terminaux.',
      implementee: true,
    },
    'decision.consulter': {
      roles: ['authority', 'assistant'],
      delegues: [],
      source: 'Aucune ligne officielle : lecture des décisions d’une demande et file de décisions',
      hypothese: 'H12',
      implementee: true,
    },
    'audience.consulter': {
      roles: ['authority', 'assistant'],
      delegues: [],
      source: 'Aucune ligne officielle : planning et détail d’audience (US-05-051)',
      hypothese: 'H12',
      implementee: true,
    },
    'agenda.lister': {
      roles: ['authority', 'assistant', 'reception', 'administrator'],
      delegues: [],
      source: 'Aucune ligne officielle : nécessaire pour créer une demande (règle EF03-24 absente)',
      hypothese: 'H12',
      implementee: true,
    },
    'audience.cloturer': {
      roles: ['authority', 'assistant'],
      delegues: ['protocole'],
      source:
        'Gate 02A : Démarrer / terminer audience (P pour l’Assistant), précisé par M. Jordan le ' +
        '22/10/2026 (réponse à Q-13) ; arbitrage du 19/10/2026 (ACTE-ARB-2026-10-19) : l’Assistant ou ' +
        'l’Autorité clôt directement, sans validation distincte ; clôture irréversible, elle ouvre la ' +
        'conservation de 5 ans (D04-06)',
      // L'Assistant clôt sans délégation (droit P de la ligne « Démarrer / terminer audience »). La
      // délégation ne concerne que le Protocole et la rectification, toutes deux inactives.
      hypothese: 'HYPOTHESE(DEC-33) : clôture, règle provisoire du 22/10/2026 (acte non signé)',
      limites:
        'Conditions : audience démarrée et terminée, résultat saisi, durée réelle et responsable ' +
        'de suivi renseignés. Rectification et motif d’écart : non développés.',
      implementee: true,
    },
  },
};
