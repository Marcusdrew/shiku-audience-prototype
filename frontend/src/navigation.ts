import type { Role } from './auth/roles';

/**
 * Navigation globale arrêtée par la conception (phase-02-information-architecture : sept écrans).
 * `api` liste les routes RÉELLEMENT exposées par le backend et appelées par l'écran (src/api/metier.ts) ;
 * ce qui n'existe pas est dit dans `resume`, jamais listé comme route. Le dossier relationnel complet
 * n'est pas exposé : l'écran /relationnel se limite au répertoire des visiteurs.
 *
 * `roles` ne sert QU'À l'affichage du menu. Seul le backend décidera de l'accès réel.
 * HYPOTHESE(DEC-28) : visibilité des entrées par rôle déduite du cahier des charges
 * (Réception exclue du dossier relationnel ; Administration pour l'Administrateur).
 */
export interface EntreeNavigation {
  chemin: string;
  libelle: string;
  resume: string;
  roles?: readonly Role[];
  /** Action qui rend l'entrée visible quand les droits du serveur sont connus (affichage seulement). */
  droit?: string;
  /** Écran branché sur une API réelle (sinon ModulePage dit que l'API manque). */
  implemente?: boolean;
  exigences: readonly string[];
  stories: readonly string[];
  api: readonly string[];
}

export const NAVIGATION: readonly EntreeNavigation[] = [
  {
    chemin: '/demandes',
    droit: 'demande.consulter',
    implemente: true,
    libelle: 'Demandes',
    resume:
      'Création, qualification initiale, correction, recherche et suivi des demandes. Catégorie et priorité : non développées.',
    exigences: ['EF03-04', 'EF03-13', 'EF03-14'],
    stories: ['US-05-037 à US-05-042'],
    api: [
      'GET /demandes',
      'POST /demandes',
      'GET /demandes/:id',
      'PATCH /demandes/:id',
      'POST /demandes/:id/qualification',
    ],
  },
  {
    chemin: '/decisions',
    droit: 'decision.consulter',
    implemente: true,
    libelle: 'Décisions',
    resume:
      'File des demandes en attente (ordre chronologique : priorité à six critères non définie) : valider, rejeter, différer, avec motif.',
    roles: ['authority', 'assistant'],
    exigences: ['EF03-05', 'EF03-14'],
    stories: ['US-05-043 à US-05-046'],
    api: ['GET /decisions/file', 'POST /demandes/:id/decision'],
  },
  {
    chemin: '/agendas',
    droit: 'agenda.lister',
    implemente: true,
    libelle: 'Agendas',
    resume:
      'Agendas, Autorités rattachées (proposer, autoriser, appliquer, révoquer) et planning des audiences ; la planification se fait depuis la demande validée. Reprogrammation et annulation : non développées.',
    exigences: ['EF03-02', 'EF03-06', 'EF03-08', 'EF03-09', 'EF03-24'],
    stories: ['US-05-024 à US-05-026', 'US-05-047 à US-05-052'],
    api: [
      'GET /agendas',
      'POST /agendas',
      'POST /agendas/:id/rattachements',
      'POST /rattachements/:id/(autoriser|appliquer|revoquer)',
      'GET /audiences',
      'POST /audiences',
    ],
  },
  {
    chemin: '/operations',
    droit: 'audience.demarrer_terminer',
    implemente: true,
    libelle: 'Opérations du jour',
    resume:
      'Audiences du jour : démarrer, terminer avec le résultat. Salle d’attente et appel des visiteurs : non développés.',
    exigences: ['EF03-07', 'EF03-11'],
    stories: ['US-05-053 à US-05-057'],
    api: ['GET /audiences', 'POST /audiences/:id/demarrer', 'POST /audiences/:id/terminer'],
  },
  {
    chemin: '/relationnel',
    // Visible selon le droit serveur : la Réception recherche et crée des visiteurs (arbitrage du
    // 19/10) ; l'Administrateur, sans droit sur les visiteurs, ne voit plus cette entrée.
    droit: 'visiteur.rechercher',
    implemente: true,
    libelle: 'Répertoire des visiteurs',
    resume:
      'Recherche, création et modification des fiches minimales de visiteurs (contact masqué pour la Réception, doublons signalés). Notes, attestations et dossier relationnel : non exposés par l’API.',
    roles: ['authority', 'assistant', 'reception'],
    exigences: ['EF03-12', 'EF03-18', 'EF03-19', 'EF03-20'],
    stories: ['US-05-028 à US-05-036'],
    api: ['GET /visiteurs?q=…', 'POST /visiteurs', 'PATCH /visiteurs/:id'],
  },
  {
    chemin: '/administration',
    droit: 'utilisateur.administrer',
    implemente: true,
    libelle: 'Administration',
    resume:
      'Comptes : liste, création (Réception, Assistant) et rattachement. Délégations : non exposées par l’API (Sprint 2).',
    roles: ['administrator'],
    exigences: ['EF03-16', 'EF03-25'],
    stories: ['US-05-004 à US-05-009'],
    api: ['GET /utilisateurs', 'POST /utilisateurs', 'POST /utilisateurs/rattachement'],
  },
  {
    chemin: '/journal',
    droit: 'journal.consulter',
    implemente: true,
    libelle: 'Journal',
    resume: 'Journal d’audit en ajout seul : lecture, filtre par type et identifiant d’objet.',
    roles: ['authority'],
    exigences: ['ENF03-02', 'ENF03-11'],
    stories: ['US-05-010', 'US-05-011'],
    api: ['GET /journal'],
  },
];

/**
 * Entrées de menu visibles. Si les droits du serveur sont connus (`peut`), ils décident de l'affichage
 * des écrans branchés sur l'API ; sinon on retombe sur l'hypothèse par rôle. Affichage seulement :
 * le backend refuse toute action non autorisée.
 */
export function entreesVisibles(
  roles: readonly Role[],
  peut?: (action: string) => boolean,
): EntreeNavigation[] {
  return NAVIGATION.filter((e) => {
    if (peut && e.droit) return peut(e.droit);
    return !e.roles || e.roles.some((r) => roles.includes(r));
  });
}
