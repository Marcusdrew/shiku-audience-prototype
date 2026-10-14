import type { Role } from './auth/roles';

/**
 * Navigation globale arrêtée par la conception (phase-02-information-architecture : sept écrans).
 * `api` décrit les routes de l'écran. Celles des entrées `implemente: true` existent (docs/dev/API.md) ;
 * les autres (opérations d'accueil, dossier relationnel) n'existent pas : voir docs/dev/FRONTEND-API-MANQUANTES.md.
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
    resume: 'Création, qualification, recherche et suivi des demandes d’audience.',
    exigences: ['EF03-04', 'EF03-13', 'EF03-14'],
    stories: ['US-05-037 à US-05-042'],
    api: [
      'GET /demandes',
      'POST /demandes',
      'GET /demandes/:id',
      'PATCH /demandes/:id (qualification, catégorie, priorité)',
    ],
  },
  {
    chemin: '/decisions',
    droit: 'decision.consulter',
    implemente: true,
    libelle: 'Décisions',
    resume: 'File de décisions ordonnée par priorité : valider, rejeter, différer.',
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
    resume: 'Agendas, planning, planification, reprogrammation et annulation.',
    exigences: ['EF03-02', 'EF03-06', 'EF03-08', 'EF03-09', 'EF03-24'],
    stories: ['US-05-024 à US-05-026', 'US-05-047 à US-05-052'],
    api: ['GET /agendas', 'GET /agendas/:id/planning', 'POST /audiences', 'PATCH /audiences/:id'],
  },
  {
    chemin: '/operations',
    droit: 'audience.demarrer_terminer',
    implemente: true,
    libelle: 'Opérations du jour',
    resume: 'Salle d’attente, appel des visiteurs, début et fin d’audience.',
    exigences: ['EF03-07', 'EF03-11'],
    stories: ['US-05-053 à US-05-057'],
    api: ['GET /operations/jour', 'POST /operations/arrivees', 'POST /audiences/:id/appel'],
  },
  {
    chemin: '/relationnel',
    libelle: 'Dossiers relationnels',
    resume: 'Dossier relationnel confidentiel, notes, attestation et signalement.',
    roles: ['authority', 'assistant', 'administrator'],
    exigences: ['EF03-12', 'EF03-18', 'EF03-19', 'EF03-20'],
    stories: ['US-05-028 à US-05-036'],
    api: ['GET /visiteurs', 'GET /visiteurs/:id/dossier', 'POST /visiteurs/:id/notes'],
  },
  {
    chemin: '/administration',
    droit: 'utilisateur.administrer',
    implemente: true,
    libelle: 'Administration',
    resume: 'Utilisateurs, rôles, délégations, agendas et référentiels.',
    roles: ['administrator'],
    exigences: ['EF03-16', 'EF03-25'],
    stories: ['US-05-004 à US-05-009'],
    api: ['GET /utilisateurs', 'POST /delegations', 'DELETE /delegations/:id'],
  },
  {
    chemin: '/journal',
    droit: 'journal.consulter',
    implemente: true,
    libelle: 'Journal',
    resume: 'Journal d’audit en ajout seul.',
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
