/**
 * Catégories du journal d'audit : énumération FERMÉE (décision Q-1 de M. Jordan, 22/10/2026) et
 * classement de chaque action (HYPOTHESE(DEC-38), réponses du 23/10/2026, acte ACTE-DEC-38, signature
 * attendue). Une action appartient à exactement une catégorie, selon ce qu'elle touche.
 *
 * La catégorie n'est PAS stockée dans l'entrée : elle se déduit de l'action par ce tableau, qui est
 * la seule source. Le journal étant en ajout seul, une colonne remplie après coup sur les entrées
 * existantes serait impossible ; la déduction vaut pour toutes les entrées, anciennes comprises.
 * « Exécutée sous délégation » est un attribut de l'entrée (colonne `sous_delegation`), pas une
 * catégorie. Un test (journal-categories.spec.ts) échoue si une action écrite n'est pas classée, et
 * l'écriture elle-même refuse une action non classée.
 */
export const CATEGORIES = [
  'consultation_dossier_relationnel',
  'droits_delegations',
  'priorite',
  'signalement_revue',
  'decisions_audiences',
  'ecriture_dossier_relationnel',
  'comptes_acces',
  'conservation_purge',
  'securite_journal',
  'administration_technique',
] as const;
export type Categorie = (typeof CATEGORIES)[number];

export const LIBELLES_CATEGORIES: Readonly<Record<Categorie, string>> = {
  consultation_dossier_relationnel: 'Consultation du dossier relationnel',
  droits_delegations: 'Droits et délégations',
  priorite: 'Priorité',
  signalement_revue: 'Signalement et revue de note',
  decisions_audiences: 'Décisions et audiences',
  ecriture_dossier_relationnel: 'Écriture du dossier relationnel',
  comptes_acces: 'Comptes et accès',
  conservation_purge: 'Conservation et purge',
  securite_journal: 'Sécurité du journal',
  administration_technique: 'Administration technique',
};

/** Classement de chaque action écrite dans le journal (application ET script d'amorçage). */
export const CATEGORIE_DES_ACTIONS: Readonly<Record<string, Categorie>> = {
  // Décisions et audiences : création et qualification d'un visiteur, demandes, décisions,
  // planification et suivi (réponse du 23/10, point 1 b) ; la saisie des critères de priorité est
  // de la qualification (point 1 d).
  'visiteur.creer': 'decisions_audiences',
  'visiteur.modifier': 'decisions_audiences',
  'demande.creer': 'decisions_audiences',
  'demande.modifier': 'decisions_audiences',
  'demande.qualifier': 'decisions_audiences',
  'demande.saisir_criteres': 'decisions_audiences',
  'decision.valider': 'decisions_audiences',
  'decision.rejeter': 'decisions_audiences',
  'decision.differer': 'decisions_audiences',
  'audience.planifier': 'decisions_audiences',
  'audience.demarrer': 'decisions_audiences',
  'audience.terminer': 'decisions_audiences',
  'audience.cloturer': 'decisions_audiences',
  // Priorité : seul le changement du NIVEAU, que la liste d'exceptions surveille (point 1 d).
  'demande.changer_priorite': 'priorite',
  // Comptes et accès : le compte lui-même (point 1 a).
  'utilisateur.creer': 'comptes_acces',
  'utilisateur.rattacher': 'comptes_acces',
  // Droits et délégations : l'attribution d'un rôle (entrée distincte, même transaction que la
  // création du compte, point 1 a) et chaque étape d'un rattachement Autorité ↔ agenda (DEC-32).
  'role.attribuer': 'droits_delegations',
  'rattachement_agenda.proposer': 'droits_delegations',
  'rattachement_agenda.autoriser': 'droits_delegations',
  'rattachement_agenda.appliquer': 'droits_delegations',
  'rattachement_agenda.revoquer': 'droits_delegations',
  'rattachement_agenda.initialiser': 'droits_delegations',
  // Administration technique : agendas, référentiels, initialisation du système (point 1 c).
  'agenda.creer': 'administration_technique',
  'systeme.initialiser': 'administration_technique',
  // Sécurité du journal : tentative de lecture sans accès (journalisée comme refus, point 1 e).
  'journal.consulter': 'securite_journal',
};

/**
 * Vue limitée de l'Autorité dans le journal (Q-1 du 22/10, confirmée le 22/10, point 2) : ces
 * catégories, plus toute entrée marquée « sous délégation ». Elle ne voit ni « décisions et
 * audiences » ni « comptes et accès » : elle consulte les décisions dans l'application métier.
 * « Conservation et purge » s'y ajoute en récapitulatif seulement (point 1 f) : `GET /journal/purges`.
 */
export const CATEGORIES_VUE_AUTORITE: readonly Categorie[] = [
  'consultation_dossier_relationnel',
  'droits_delegations',
  'priorite',
  'signalement_revue',
];

export function categorieDe(action: string): Categorie {
  const c = CATEGORIE_DES_ACTIONS[action];
  if (!c) throw new Error(`Action de journal sans catégorie : ${action}`);
  return c;
}

/** Actions d'une liste de catégories (pour filtrer en base sans stocker la catégorie). */
export function actionsDes(categories: readonly Categorie[]): string[] {
  return Object.entries(CATEGORIE_DES_ACTIONS)
    .filter(([, c]) => categories.includes(c))
    .map(([a]) => a);
}
