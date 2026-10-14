import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { creerAgenda, listerAgendas, planning } from '../api/metier';
import { useRequete } from '../api/useRequete';
import { useAuth } from '../auth/AuthContext';
import { useDroits } from '../auth/DroitsContext';
import { Badge, Card } from '../components/Card';
import { Champ } from '../components/Champ';
import { ErreurAction } from '../components/ErreurAction';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { useAction } from '../components/useAction';
import { formaterDate, LIBELLES_AUDIENCE } from '../lib/libelles';

const jourLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function AgendasPage() {
  const { jeton } = useAuth();
  const { peut } = useDroits();
  const agendas = useRequete(useCallback((s: AbortSignal) => listerAgendas(jeton, s), [jeton]));
  const [agendaId, setAgendaId] = useState('');
  const [du, setDu] = useState(() => jourLocal(new Date()));
  const [au, setAu] = useState(() => jourLocal(new Date(Date.now() + 7 * 86_400_000)));
  const [nom, setNom] = useState('');
  const creation = useAction();
  const voirPlanning = peut('audience.consulter');

  const charger = useCallback(
    (s: AbortSignal) =>
      planning(
        jeton,
        {
          agenda_id: agendaId || undefined,
          // Jours locaux → instants ISO avec fuseau ; borne haute exclusive (lendemain 00:00).
          du: new Date(`${du}T00:00:00`).toISOString(),
          au: new Date(new Date(`${au}T00:00:00`).getTime() + 86_400_000).toISOString(),
        },
        s,
      ),
    [jeton, agendaId, du, au],
  );
  const plan = useRequete(charger);

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    if (await creation.executer(() => creerAgenda(jeton, nom))) {
      setNom('');
      agendas.recharger();
    }
  }

  return (
    <>
      <h1>Agendas</h1>
      <p className="lead">Agendas et planning des audiences sur une période.</p>
      <div className="pile">
        <Card titre="Agendas">
          {agendas.etat === 'chargement' && <Spinner />}
          {agendas.etat === 'erreur' && (
            <ErrorState message={agendas.message} onRetry={agendas.recharger} />
          )}
          {agendas.etat === 'succes' && (
            <ul className="liste-simple">
              {agendas.donnees.elements.map((a) => (
                <li key={a.id}>{a.nom}</li>
              ))}
            </ul>
          )}
          {peut('agenda.administrer') && (
            <form className="formulaire" onSubmit={(e) => void ajouter(e)}>
              <Champ id="ag-nom" libelle="Nouvel agenda">
                <input
                  id="ag-nom"
                  required
                  maxLength={200}
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                />
              </Champ>
              <ErreurAction erreur={creation.erreur} />
              <button type="submit" className="bouton" disabled={creation.enCours}>
                Créer l’agenda
              </button>
            </form>
          )}
        </Card>
        {voirPlanning ? (
          <Card titre="Planning">
            <div className="filtres">
              <Champ id="pl-agenda" libelle="Agenda">
                <select
                  id="pl-agenda"
                  value={agendaId}
                  onChange={(e) => setAgendaId(e.target.value)}
                >
                  <option value="">Tous</option>
                  {agendas.etat === 'succes' &&
                    agendas.donnees.elements.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nom}
                      </option>
                    ))}
                </select>
              </Champ>
              <Champ id="pl-du" libelle="Du">
                <input id="pl-du" type="date" value={du} onChange={(e) => setDu(e.target.value)} />
              </Champ>
              <Champ id="pl-au" libelle="Au (inclus)">
                <input id="pl-au" type="date" value={au} onChange={(e) => setAu(e.target.value)} />
              </Champ>
            </div>
            {plan.etat === 'chargement' && <Spinner libelle="Chargement du planning…" />}
            {plan.etat === 'erreur' && (
              <ErrorState
                titre="Planning indisponible"
                message={plan.message}
                onRetry={plan.recharger}
              />
            )}
            {plan.etat === 'succes' &&
              (plan.donnees.elements.length === 0 ? (
                <p>Aucune audience sur cette période.</p>
              ) : (
                <div className="defile">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Début</th>
                        <th>Durée</th>
                        <th>Agenda</th>
                        <th>Demande</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.donnees.elements.map((a) => (
                        <tr key={a.id}>
                          <td>{formaterDate(a.debut_prevu)}</td>
                          <td>{a.duree_prevue_minutes} min</td>
                          <td>{a.agenda_nom}</td>
                          <td>
                            <Link to={`/demandes/${a.demande_id}`}>{a.demande_reference}</Link>
                          </td>
                          <td>
                            <Badge ton="neutre">{LIBELLES_AUDIENCE[a.statut]}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </Card>
        ) : (
          <p className="note">Le planning n’est pas disponible pour votre profil.</p>
        )}
      </div>
    </>
  );
}
