import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  creerDemande,
  creerVisiteur,
  listerAgendas,
  listerDemandes,
  rechercherVisiteurs,
  type StatutDemande,
  type Visiteur,
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
import { formaterDate, LIBELLES_STATUT, TON_STATUT } from '../lib/libelles';

export function DemandesPage() {
  const { jeton } = useAuth();
  const { peut, compteActif } = useDroits();
  const [statut, setStatut] = useState('');
  const [terme, setTerme] = useState('');
  const [recherche, setRecherche] = useState('');
  const [creation, setCreation] = useState(false);

  const charger = useCallback(
    (s: AbortSignal) => listerDemandes(jeton, { statut, q: recherche }, s),
    [jeton, statut, recherche],
  );
  const liste = useRequete(charger);

  return (
    <>
      <h1>Demandes</h1>
      <p className="lead">Création, qualification, recherche et suivi des demandes d’audience.</p>
      {!compteActif && (
        <div className="alerte alerte--info" role="note">
          Votre identité est reconnue mais aucun compte applicatif actif ne lui est rattaché :
          aucune action métier n’est possible. Demandez à l’administrateur de rattacher votre
          compte.
        </div>
      )}
      <div className="pile">
        {peut('demande.creer') && (
          <Card titre="Nouvelle demande">
            {creation ? (
              <NouvelleDemande onFermer={() => setCreation(false)} />
            ) : (
              <button type="button" className="bouton" onClick={() => setCreation(true)}>
                Créer une demande
              </button>
            )}
          </Card>
        )}
        {peut('demande.consulter') && (
          <Card titre="Liste des demandes">
            <form
              className="filtres"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                setRecherche(terme.trim());
              }}
            >
              <Champ id="f-q" libelle="Recherche (référence, objet, visiteur)">
                <input id="f-q" value={terme} onChange={(e) => setTerme(e.target.value)} />
              </Champ>
              <Champ id="f-statut" libelle="Statut">
                <select id="f-statut" value={statut} onChange={(e) => setStatut(e.target.value)}>
                  <option value="">Tous</option>
                  {(Object.keys(LIBELLES_STATUT) as StatutDemande[]).map((s) => (
                    <option key={s} value={s}>
                      {LIBELLES_STATUT[s]}
                    </option>
                  ))}
                </select>
              </Champ>
              <button type="submit" className="bouton bouton--secondaire">
                Rechercher
              </button>
            </form>
            {liste.etat === 'chargement' && <Spinner libelle="Chargement des demandes…" />}
            {liste.etat === 'erreur' && (
              <ErrorState
                titre="Demandes indisponibles"
                message={liste.message}
                onRetry={liste.recharger}
              />
            )}
            {liste.etat === 'succes' &&
              (liste.donnees.elements.length === 0 ? (
                <p>Aucune demande ne correspond.</p>
              ) : (
                <div className="defile">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Référence</th>
                        <th>Visiteur</th>
                        <th>Objet</th>
                        <th>Agenda</th>
                        <th>Statut</th>
                        <th>Créée le</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liste.donnees.elements.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <Link to={`/demandes/${d.id}`}>{d.reference}</Link>
                          </td>
                          <td>{d.visiteur_nom}</td>
                          <td>{d.objet}</td>
                          <td>{d.agenda_nom}</td>
                          <td>
                            <Badge ton={TON_STATUT[d.statut]}>{LIBELLES_STATUT[d.statut]}</Badge>
                          </td>
                          <td>{formaterDate(d.cree_le)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="note">
                    {liste.donnees.total} demande(s) au total, {liste.donnees.elements.length}{' '}
                    affichée(s).
                  </p>
                </div>
              ))}
          </Card>
        )}
      </div>
    </>
  );
}

function NouvelleDemande({ onFermer }: { onFermer: () => void }) {
  const { jeton } = useAuth();
  const { peut } = useDroits();
  const navigate = useNavigate();
  const { enCours, erreur, executer } = useAction();
  const [q, setQ] = useState('');
  const [visiteurs, setVisiteurs] = useState<Visiteur[] | null>(null);
  const [visiteur, setVisiteur] = useState<Visiteur | null>(null);
  const [nouveauNom, setNouveauNom] = useState('');
  const agendas = useRequete(useCallback((s: AbortSignal) => listerAgendas(jeton, s), [jeton]));
  const [agendaId, setAgendaId] = useState('');
  const [objet, setObjet] = useState('');
  const [contact, setContact] = useState('');
  const [derogation, setDerogation] = useState('');

  async function chercher() {
    const r = await executer(() => rechercherVisiteurs(jeton, q));
    if (r) setVisiteurs(r.elements);
  }
  async function creerNouveauVisiteur() {
    const v = await executer(() => creerVisiteur(jeton, { nom_complet: nouveauNom }));
    if (v) {
      setVisiteur(v);
      setNouveauNom('');
    }
  }
  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!visiteur) return;
    const d = await executer(() =>
      creerDemande(jeton, {
        visiteur_id: visiteur.id,
        agenda_id: agendaId,
        objet,
        ...(contact.trim() ? { contact } : {}),
        ...(derogation.trim() ? { derogation } : {}),
      }),
    );
    if (d) void navigate(`/demandes/${d.id}`);
  }

  return (
    <form className="formulaire" onSubmit={(e) => void soumettre(e)}>
      <fieldset>
        <legend>Visiteur</legend>
        {visiteur ? (
          <p>
            <strong>{visiteur.nom_complet}</strong>{' '}
            <button
              type="button"
              className="bouton bouton--secondaire"
              onClick={() => setVisiteur(null)}
            >
              Changer
            </button>
          </p>
        ) : (
          <>
            <Champ id="v-q" libelle="Rechercher un visiteur par nom">
              <input id="v-q" value={q} onChange={(e) => setQ(e.target.value)} />
            </Champ>
            <button
              type="button"
              className="bouton bouton--secondaire"
              onClick={() => void chercher()}
            >
              Rechercher
            </button>
            {visiteurs && visiteurs.length === 0 && <p>Aucun visiteur trouvé.</p>}
            {visiteurs?.map((v) => (
              <p key={v.id}>
                <button
                  type="button"
                  className="bouton bouton--secondaire"
                  onClick={() => setVisiteur(v)}
                >
                  Choisir
                </button>{' '}
                {v.nom_complet}
              </p>
            ))}
            {peut('visiteur.creer') ? (
              <>
                <Champ id="v-nouveau" libelle="Ou créer un nouveau visiteur (nom complet)">
                  <input
                    id="v-nouveau"
                    value={nouveauNom}
                    onChange={(e) => setNouveauNom(e.target.value)}
                  />
                </Champ>
                <button
                  type="button"
                  className="bouton bouton--secondaire"
                  onClick={() => void creerNouveauVisiteur()}
                >
                  Créer le visiteur
                </button>
              </>
            ) : (
              <p className="note">
                Votre profil ne peut pas créer de visiteur (règle provisoire, décision DEC-19 en
                attente) : demandez à un assistant de le créer.
              </p>
            )}
          </>
        )}
      </fieldset>
      <Champ id="d-agenda" libelle="Agenda">
        <select
          id="d-agenda"
          required
          value={agendaId}
          onChange={(e) => setAgendaId(e.target.value)}
        >
          <option value="">Choisir…</option>
          {agendas.etat === 'succes' &&
            agendas.donnees.elements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom}
              </option>
            ))}
        </select>
      </Champ>
      <Champ id="d-objet" libelle="Objet de la demande">
        <textarea
          id="d-objet"
          required
          rows={3}
          maxLength={2000}
          value={objet}
          onChange={(e) => setObjet(e.target.value)}
        />
      </Champ>
      <Champ id="d-contact" libelle="Contact du visiteur">
        <input
          id="d-contact"
          maxLength={300}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </Champ>
      <Champ id="d-derog" libelle="Dérogation (obligatoire si aucun contact : justifiez)">
        <input
          id="d-derog"
          maxLength={1000}
          value={derogation}
          onChange={(e) => setDerogation(e.target.value)}
        />
      </Champ>
      <ErreurAction erreur={erreur} />
      <div className="actions">
        <button type="submit" className="bouton" disabled={enCours || !visiteur}>
          Enregistrer la demande
        </button>
        <button type="button" className="bouton bouton--secondaire" onClick={onFermer}>
          Annuler
        </button>
      </div>
    </form>
  );
}
