import { useCallback } from 'react';
import { lireJournal } from '../api/metier';
import { useRequete } from '../api/useRequete';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { formaterDate } from '../lib/libelles';

export function JournalPage() {
  const { jeton } = useAuth();
  const r = useRequete(useCallback((s: AbortSignal) => lireJournal(jeton, {}, s), [jeton]));
  return (
    <>
      <h1>Journal d’audit</h1>
      <p className="lead">
        Entrées les plus récentes. Le journal est en ajout seul, protégé au niveau de la base de
        données ; ce n’est pas une garantie d’inaltérabilité absolue (limites :
        docs/dev/JOURNAL.md).
      </p>
      <Card titre="Dernières entrées">
        {r.etat === 'chargement' && <Spinner />}
        {r.etat === 'erreur' && (
          <ErrorState titre="Journal indisponible" message={r.message} onRetry={r.recharger} />
        )}
        {r.etat === 'succes' &&
          (r.donnees.elements.length === 0 ? (
            <p>Aucune entrée.</p>
          ) : (
            <div className="defile">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Auteur</th>
                    <th>Action</th>
                    <th>Objet</th>
                  </tr>
                </thead>
                <tbody>
                  {r.donnees.elements.map((e) => (
                    <tr key={e.id}>
                      <td>{formaterDate(e.horodatage)}</td>
                      <td>{e.utilisateur_nom}</td>
                      <td>
                        <code>{e.action}</code>
                      </td>
                      <td>{e.objet_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </Card>
    </>
  );
}
