import type { Ton } from '../components/Card';
import type { Decision, StatutAudience, StatutDemande } from '../api/metier';

// Libellés affichés. Le statut est toujours dit en toutes lettres (la couleur seule ne suffit pas, ENF03-09).
export const LIBELLES_STATUT: Record<StatutDemande, string> = {
  recue: 'Reçue',
  qualifiee: 'Qualifiée',
  differee: 'Décision différée',
  validee: 'Validée',
  rejetee: 'Rejetée',
  planifiee: 'Audience planifiée',
  realisee: 'Audience réalisée',
  cloturee: 'Clôturée',
  // HYPOTHESE(DEC-34) : règle provisoire du 22/10/2026 (Q-14), sans motif ni auteur de la
  // décision. Une demande annulée affichera « Annulée » (annulation non développée).
  non_retenue: 'Non retenue — ne pas planifier',
};
export const TON_STATUT: Record<StatutDemande, Ton> = {
  recue: 'neutre',
  qualifiee: 'neutre',
  differee: 'attention',
  validee: 'ok',
  rejetee: 'erreur',
  planifiee: 'ok',
  realisee: 'ok',
  cloturee: 'neutre',
  non_retenue: 'neutre',
};
/**
 * Statuts proposés dans le filtre, selon ce que le serveur expose à l'appelant : sans le droit
 * `decision.consulter` (Réception), « Rejetée » n'existe pas et seul le statut neutre est filtrable.
 */
export function statutsFiltrables(voitLesDecisions: boolean): StatutDemande[] {
  return (Object.keys(LIBELLES_STATUT) as StatutDemande[]).filter((s) =>
    voitLesDecisions ? s !== 'non_retenue' : s !== 'rejetee',
  );
}
export const LIBELLES_AUDIENCE: Record<StatutAudience, string> = {
  planifiee: 'Planifiée',
  en_cours: 'En cours',
  terminee: 'Terminée',
  cloturee: 'Clôturée',
};
export const LIBELLES_DECISION: Record<Decision['type'], string> = {
  valider: 'Validée',
  rejeter: 'Rejetée',
  differer: 'Différée',
};
export const STATUTS_DECIDABLES: readonly StatutDemande[] = ['recue', 'qualifiee', 'differee'];
export const STATUTS_MODIFIABLES: readonly StatutDemande[] = ['recue', 'qualifiee', 'differee'];

/** Durée réelle en minutes à partir des horodatages serveur (début et fin réels). */
export function dureeReelle(debut: string | null, fin: string | null): number | null {
  if (!debut || !fin) return null;
  const ms = new Date(fin).getTime() - new Date(debut).getTime();
  return Number.isNaN(ms) ? null : Math.round(ms / 60_000);
}

export function formaterDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}
