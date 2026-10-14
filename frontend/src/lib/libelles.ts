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
};
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

export function formaterDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}
