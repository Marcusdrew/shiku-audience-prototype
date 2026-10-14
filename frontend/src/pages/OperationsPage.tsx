import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { demarrerAudience, planning, terminerAudience, type Audience } from '../api/metier';
import { useRequete } from '../api/useRequete';
import { useAuth } from '../auth/AuthContext';
import { useDroits } from '../auth/DroitsContext';
import { Badge, Card } from '../components/Card';
import { ErreurAction } from '../components/ErreurAction';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { useAction } from '../components/useAction';
import { formaterDate, LIBELLES_AUDIENCE } from '../lib/libelles';

export function OperationsPage() {
  const { jeton } = useAuth();
  const { peut } = useDroits();
  const { enCours, erreur, executer } = useAction();
  const [resultats, setResultats] = useState<Record<string, string>>({});
  const charger = useCallback(
    (s: AbortSignal) => {
      const debut = new Date();
      debut.setHours(0, 0, 0, 0);
      const fin = new Date(debut.getTime() + 86_400_000);
      return planning(jeton, { du: debut.toISOString(), au: fin.toISOString() }, s);
    },
    [jeton],
  );
  const r = useRequete(charger);

  async function agir(f: () => Promise<unknown>) {
    if (await executer(f)) r.recharger();
  }

  return (
    <>
      <h1>Opérations du jour</h1>
      <p className="lead">
        Audiences prévues aujourd’hui : démarrer, terminer et enregistrer le résultat. La salle
        d’attente (arrivée, appel, absence) n’est pas développée.
      </p>
      <Card titre="Audiences du jour">
        <ErreurAction erreur={erreur} />
        {r.etat === 'chargement' && <Spinner />}
        {r.etat === 'erreur' && <ErrorState message={r.message} onRetry={r.recharger} />}
        {r.etat === 'succes' &&
          (r.donnees.elements.length === 0 ? (
            <p>Aucune audience prévue aujourd’hui.</p>
          ) : (
            <ul className="liste-simple">
              {r.donnees.elements.map((a: Audience) => (
                <li key={a.id}>
                  <strong>{formaterDate(a.debut_prevu)}</strong> — {a.agenda_nom} —{' '}
                  <Link to={`/demandes/${a.demande_id}`}>{a.demande_reference}</Link>{' '}
                  <Badge ton="neutre">{LIBELLES_AUDIENCE[a.statut]}</Badge>
                  {peut('audience.demarrer_terminer') && a.statut === 'planifiee' && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="bouton"
                        disabled={enCours}
                        onClick={() => void agir(() => demarrerAudience(jeton, a.id))}
                      >
                        Démarrer
                      </button>
                    </>
                  )}
                  {peut('audience.demarrer_terminer') && a.statut === 'en_cours' && (
                    <form
                      className="actions"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void agir(() => terminerAudience(jeton, a.id, resultats[a.id] ?? ''));
                      }}
                    >
                      <label htmlFor={`res-${a.id}`}>Résultat</label>
                      <input
                        id={`res-${a.id}`}
                        required
                        value={resultats[a.id] ?? ''}
                        onChange={(e) => setResultats({ ...resultats, [a.id]: e.target.value })}
                      />
                      <button type="submit" className="bouton" disabled={enCours}>
                        Terminer
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </Card>
    </>
  );
}
