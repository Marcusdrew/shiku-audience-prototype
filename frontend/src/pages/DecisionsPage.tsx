import { useCallback } from 'react';
import { Link } from 'react-router';
import { fileDecisions } from '../api/metier';
import { useRequete } from '../api/useRequete';
import { useAuth } from '../auth/AuthContext';
import { Badge, Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { formaterDate, LIBELLES_STATUT, TON_STATUT } from '../lib/libelles';

export function DecisionsPage() {
  const { jeton } = useAuth();
  const r = useRequete(useCallback((s: AbortSignal) => fileDecisions(jeton, s), [jeton]));
  return (
    <>
      <h1>Décisions</h1>
      <p className="lead">File des demandes en attente de décision (valider, rejeter, différer).</p>
      <Card titre="File d’attente">
        {r.etat === 'chargement' && <Spinner libelle="Chargement de la file…" />}
        {r.etat === 'erreur' && (
          <ErrorState titre="File indisponible" message={r.message} onRetry={r.recharger} />
        )}
        {r.etat === 'succes' &&
          (r.donnees.elements.length === 0 ? (
            <p>Aucune demande en attente de décision.</p>
          ) : (
            <div className="defile">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Rang</th>
                    <th>Référence</th>
                    <th>Visiteur</th>
                    <th>Objet</th>
                    <th>Statut</th>
                    <th>Reçue le</th>
                  </tr>
                </thead>
                <tbody>
                  {r.donnees.elements.map((d, i) => (
                    <tr key={d.id}>
                      <td>{i + 1}</td>
                      <td>
                        <Link to={`/demandes/${d.id}`}>{d.reference}</Link>
                      </td>
                      <td>{d.visiteur_nom}</td>
                      <td>{d.objet}</td>
                      <td>
                        <Badge ton={TON_STATUT[d.statut]}>{LIBELLES_STATUT[d.statut]}</Badge>
                      </td>
                      <td>{formaterDate(d.cree_le)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        <p className="note">
          Ordre actuel : du plus ancien au plus récent (chronologie seule). La priorité à six
          critères (US-05-041) n’est pas développée : aucun seuil chiffré n’est défini par les
          documents.
        </p>
      </Card>
    </>
  );
}
