import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import {
  type Agenda,
  creerAgenda,
  etapeRattachement,
  listerAgendas,
  listerUtilisateurs,
  planning,
  proposerRattachement,
} from '../api/metier';
import { useRequete } from '../api/useRequete';
import { useAuth } from '../auth/AuthContext';
import { useDroits } from '../auth/DroitsContext';
import { Badge, Card } from '../components/Card';
import { Champ } from '../components/Champ';
import { ErreurAction } from '../components/ErreurAction';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { useAction } from '../components/useAction';
import { formaterDate, LIBELLES_AUDIENCE, LIBELLES_RATTACHEMENT } from '../lib/libelles';

const jourLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function AgendasPage() {
  const { jeton } = useAuth();
  const { peut } = useDroits();
  const agendas = useRequete(useCallback((s: AbortSignal) => listerAgendas(jeton, s), [jeton]));
  const [agendaId, setAgendaId] = useState('');
  const [du, setDu] = useState(() => jourLocal(new Date()));
  const [au, setAu] = useState(() => jourLocal(new Date(Date.now() + 7 * 86_400_000)));
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
            <ListeAgendas
              jeton={jeton}
              agendas={agendas.donnees.elements}
              peutAutoriser={peut('agenda.autoriser_rattachement')}
              peutAppliquer={peut('agenda.administrer')}
              onChange={agendas.recharger}
            />
          )}
        </Card>
        {peut('agenda.administrer') && agendas.etat === 'succes' && (
          <AdministrationAgendas
            jeton={jeton}
            agendas={agendas.donnees.elements}
            onChange={agendas.recharger}
          />
        )}
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

/**
 * Agendas et Autorités rattachées (HYPOTHESE(DEC-32)). L'Autorité désignée autorise ou révoque son
 * rattachement ; l'Administrateur applique un rattachement autorisé. Les boutons suivent les droits
 * renvoyés par le serveur, qui contrôle de nouveau chaque étape.
 */
function ListeAgendas({
  jeton,
  agendas,
  peutAutoriser,
  peutAppliquer,
  onChange,
}: {
  jeton: string | null;
  agendas: Agenda[];
  peutAutoriser: boolean;
  peutAppliquer: boolean;
  onChange: () => void;
}) {
  const action = useAction();
  async function etape(id: string, e: 'autoriser' | 'appliquer' | 'revoquer') {
    if (await action.executer(() => etapeRattachement(jeton, id, e))) onChange();
  }
  if (!agendas.length) return <p>Aucun agenda.</p>;
  return (
    <>
      <ErreurAction erreur={action.erreur} />
      <div className="defile">
        <table className="tableau">
          <thead>
            <tr>
              <th>Agenda</th>
              <th>Autorité de rattachement</th>
            </tr>
          </thead>
          <tbody>
            {agendas.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.nom}
                  {a.a_rattacher && (
                    <>
                      {' '}
                      <Badge ton="attention">À rattacher : décisions et suivi impossibles</Badge>
                    </>
                  )}
                </td>
                <td>
                  {(a.rattachements ?? []).length === 0 && '—'}
                  <ul className="liste-simple">
                    {(a.rattachements ?? []).map((r) => (
                      <li key={r.id}>
                        {r.autorite_nom}
                        {r.est_moi ? ' (vous)' : ''} —{' '}
                        <Badge ton={r.en_vigueur ? 'ok' : 'neutre'}>
                          {r.statut === 'actif' && !r.en_vigueur
                            ? 'Actif, hors période'
                            : LIBELLES_RATTACHEMENT[r.statut]}
                        </Badge>{' '}
                        <span className="note">
                          du {r.debut}
                          {r.fin ? ` au ${r.fin}` : ''}
                        </span>
                        <div className="actions-ligne">
                          {peutAutoriser && r.est_moi && r.statut === 'propose' && (
                            <button
                              type="button"
                              className="bouton bouton--secondaire"
                              disabled={action.enCours}
                              onClick={() => void etape(r.id, 'autoriser')}
                            >
                              Autoriser
                            </button>
                          )}
                          {peutAppliquer && r.statut === 'autorise' && (
                            <button
                              type="button"
                              className="bouton bouton--secondaire"
                              disabled={action.enCours}
                              onClick={() => void etape(r.id, 'appliquer')}
                            >
                              Appliquer
                            </button>
                          )}
                          {peutAutoriser && r.est_moi && (
                            <button
                              type="button"
                              className="bouton bouton--secondaire"
                              disabled={action.enCours}
                              onClick={() => void etape(r.id, 'revoquer')}
                            >
                              Révoquer
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Administrateur : création d'un agenda avec son Autorité de rattachement (obligatoire, DEC-32), et
 * proposition d'un rattachement pour un agenda existant. La personne désignée doit ensuite autoriser.
 */
function AdministrationAgendas({
  jeton,
  agendas,
  onChange,
}: {
  jeton: string | null;
  agendas: Agenda[];
  onChange: () => void;
}) {
  const comptes = useRequete(
    useCallback((s: AbortSignal) => listerUtilisateurs(jeton, s), [jeton]),
  );
  const [nom, setNom] = useState('');
  const [autorite, setAutorite] = useState('');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [agendaCible, setAgendaCible] = useState('');
  const [autoriteCible, setAutoriteCible] = useState('');
  const creation = useAction();
  const proposition = useAction();
  const personnes =
    comptes.etat === 'succes' ? comptes.donnees.elements.filter((u) => u.actif) : [];
  const periode = { ...(debut ? { debut } : {}), ...(fin ? { fin } : {}) };

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    if (
      await creation.executer(() => creerAgenda(jeton, { nom, autorite_id: autorite, ...periode }))
    ) {
      setNom('');
      setAutorite('');
      setDebut('');
      setFin('');
      onChange();
    }
  }
  async function proposer(e: FormEvent) {
    e.preventDefault();
    if (
      await proposition.executer(() =>
        proposerRattachement(jeton, agendaCible, { autorite_id: autoriteCible }),
      )
    ) {
      setAgendaCible('');
      setAutoriteCible('');
      onChange();
    }
  }
  const choixPersonne = (id: string, valeur: string, changer: (v: string) => void) => (
    <select id={id} required value={valeur} onChange={(e) => changer(e.target.value)}>
      <option value="">— Choisir —</option>
      {personnes.map((u) => (
        <option key={u.id} value={u.id}>
          {u.nom_complet}
        </option>
      ))}
    </select>
  );

  return (
    <Card titre="Administration des agendas">
      {comptes.etat === 'erreur' && (
        <ErrorState message={comptes.message} onRetry={comptes.recharger} />
      )}
      <p className="note">
        L’Autorité de rattachement est obligatoire. Le rattachement n’est actif qu’après
        l’autorisation de la personne désignée (qui doit avoir le rôle Autorité), puis son
        application ici. D’ici là, les demandes de l’agenda restent dans la file « à rattacher ».
      </p>
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
        <Champ id="ag-autorite" libelle="Autorité de rattachement">
          {choixPersonne('ag-autorite', autorite, setAutorite)}
        </Champ>
        <Champ id="ag-debut" libelle="Début (facultatif, aujourd’hui par défaut)">
          <input
            id="ag-debut"
            type="date"
            value={debut}
            onChange={(e) => setDebut(e.target.value)}
          />
        </Champ>
        <Champ id="ag-fin" libelle="Fin (facultative)">
          <input id="ag-fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
        </Champ>
        <ErreurAction erreur={creation.erreur} />
        <button type="submit" className="bouton" disabled={creation.enCours}>
          Créer l’agenda
        </button>
      </form>
      <form className="formulaire" onSubmit={(e) => void proposer(e)}>
        <h3>Proposer un rattachement pour un agenda existant</h3>
        <Champ id="pr-agenda" libelle="Agenda">
          <select
            id="pr-agenda"
            required
            value={agendaCible}
            onChange={(e) => setAgendaCible(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {agendas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ id="pr-autorite" libelle="Autorité">
          {choixPersonne('pr-autorite', autoriteCible, setAutoriteCible)}
        </Champ>
        <ErreurAction erreur={proposition.erreur} />
        <button type="submit" className="bouton bouton--secondaire" disabled={proposition.enCours}>
          Proposer le rattachement
        </button>
      </form>
    </Card>
  );
}
