import { appeler } from './client';

// Contrats réels : backend/src/{demandes,decisions,audiences,agendas,visiteurs,journal,utilisateurs}.
// Voir docs/dev/API.md. Dates en ISO 8601 ; identifiants en UUID ; champs en snake_case.

export interface Droits {
  compte_actif: boolean;
  matrice: { statut: string; reference: string };
  actions: string[];
}
export interface Agenda {
  id: string;
  nom: string;
}
export interface Visiteur {
  id: string;
  nom_complet: string;
  contact: string | null;
  qualite: string | null;
}
export type StatutDemande =
  | 'recue'
  | 'qualifiee'
  | 'differee'
  | 'validee'
  | 'rejetee'
  | 'planifiee'
  | 'realisee'
  | 'cloturee'
  // Statut neutre renvoyé par le serveur à la Réception pour une demande rejetée (arbitrage du 19/10).
  | 'non_retenue';
export interface Demande {
  id: string;
  reference: string;
  statut: StatutDemande;
  objet: string;
  contact: string | null;
  derogation: string | null;
  qualification_initiale: string | null;
  cree_le: string;
  visiteur_id: string;
  visiteur_nom: string;
  agenda_id: string;
  agenda_nom: string;
  responsable_suivi_nom: string;
  cree_par_nom: string;
  decisions?: Decision[];
  audience?: AudienceResume | null;
}
export interface Decision {
  id: string;
  type: 'valider' | 'rejeter' | 'differer';
  motif: string;
  decide_le: string;
  decide_par_nom: string;
}
export interface AudienceResume {
  id: string;
  statut: StatutAudience;
  debut_prevu: string;
  duree_prevue_minutes: number;
  debut_reel: string | null;
  fin_reel: string | null;
  resultat: string | null;
  cloturee_le: string | null;
  conservation_echeance: string | null;
  /** Responsable de suivi de l'AUDIENCE (fixé à la planification), distinct de celui de la demande. */
  responsable_suivi_nom?: string;
}
export type StatutAudience = 'planifiee' | 'en_cours' | 'terminee' | 'cloturee';
export interface Audience extends AudienceResume {
  demande_id: string;
  demande_reference: string;
  agenda_id: string;
  agenda_nom: string;
  duree_reelle_minutes: number | null;
}
export interface Liste<T> {
  elements: T[];
  total?: number;
  limite?: number;
  decalage?: number;
}
export interface EntreeJournal {
  id: string;
  horodatage: string;
  action: string;
  objet_type: string;
  objet_id: string | null;
  utilisateur_nom: string;
}
export interface NouvelleDemande {
  visiteur_id: string;
  agenda_id: string;
  objet: string;
  contact?: string;
  derogation?: string;
}

type J = string | null;
const qs = (p: Record<string, string | number | undefined | null>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p))
    if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
};
const get = <T>(chemin: string, jeton: J, signal?: AbortSignal) =>
  appeler<T>(chemin, { jeton, signal });
const envoyer = <T>(methode: 'POST' | 'PATCH', chemin: string, jeton: J, corps?: unknown) =>
  appeler<T>(chemin, { methode, jeton, corps: corps ?? {} });

export const lireDroits = (j: J, s?: AbortSignal) => get<Droits>('/droits', j, s);
export const listerAgendas = (j: J, s?: AbortSignal) => get<Liste<Agenda>>('/agendas', j, s);
export const creerAgenda = (j: J, nom: string) => envoyer<Agenda>('POST', '/agendas', j, { nom });
export const rechercherVisiteurs = (j: J, q: string, s?: AbortSignal) =>
  get<Liste<Visiteur>>(`/visiteurs${qs({ q, limite: 20 })}`, j, s);
export const creerVisiteur = (
  j: J,
  corps: { nom_complet: string; contact?: string; qualite?: string },
) => envoyer<Visiteur>('POST', '/visiteurs', j, corps);
export const TAILLE_PAGE = 20;
export const listerDemandes = (
  j: J,
  f: { statut?: string; q?: string; decalage?: number },
  s?: AbortSignal,
) => get<Liste<Demande>>(`/demandes${qs({ ...f, limite: TAILLE_PAGE })}`, j, s);
export const lireDemande = (j: J, id: string, s?: AbortSignal) =>
  get<Demande>(`/demandes/${id}`, j, s);
export const creerDemande = (j: J, corps: NouvelleDemande) =>
  envoyer<Demande>('POST', '/demandes', j, corps);
export const modifierDemande = (j: J, id: string, corps: Record<string, string | null>) =>
  envoyer<Demande>('PATCH', `/demandes/${id}`, j, corps);
export const qualifierDemande = (j: J, id: string, qualification: string) =>
  envoyer<Demande>('POST', `/demandes/${id}/qualification`, j, { qualification });
export const decider = (j: J, id: string, type: Decision['type'], motif: string) =>
  envoyer<Decision>('POST', `/demandes/${id}/decision`, j, { type, motif });
export const fileDecisions = (j: J, s?: AbortSignal) =>
  get<Liste<Demande>>('/decisions/file', j, s);
export const planifierAudience = (
  j: J,
  corps: { demande_id: string; debut_prevu: string; duree_prevue_minutes: number },
) => envoyer<Audience>('POST', '/audiences', j, corps);
export const planning = (
  j: J,
  f: { agenda_id?: string; du?: string; au?: string },
  s?: AbortSignal,
) => get<Liste<Audience>>(`/audiences${qs(f)}`, j, s);
export const demarrerAudience = (j: J, id: string) =>
  envoyer<Audience>('POST', `/audiences/${id}/demarrer`, j);
export const terminerAudience = (j: J, id: string, resultat: string) =>
  envoyer<Audience>('POST', `/audiences/${id}/terminer`, j, { resultat });
export const cloturerAudience = (j: J, id: string) =>
  envoyer<Audience>('POST', `/audiences/${id}/cloturer`, j);
export const TAILLE_PAGE_JOURNAL = 50;
export const lireJournal = (
  j: J,
  f: { objet_type?: string; objet_id?: string; decalage?: number },
  s?: AbortSignal,
) => get<Liste<EntreeJournal>>(`/journal${qs({ ...f, limite: TAILLE_PAGE_JOURNAL })}`, j, s);
export const listerUtilisateurs = (j: J, s?: AbortSignal) =>
  get<Liste<{ id: string; nom_complet: string; actif: boolean }>>('/utilisateurs', j, s);
export const creerUtilisateur = (
  j: J,
  corps: { prenom: string; nom: string; courriel: string; role: string },
) => envoyer<{ id: string }>('POST', '/utilisateurs', j, corps);
export const rattacherUtilisateur = (j: J, corps: { keycloak_sub: string; nom_complet: string }) =>
  envoyer<{ id: string }>('POST', '/utilisateurs/rattachement', j, corps);
