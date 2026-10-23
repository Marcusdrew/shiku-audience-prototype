import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  cloturerAudience,
  decider,
  demarrerAudience,
  lireDemande,
  modifierDemande,
  planifierAudience,
  qualifierDemande,
  terminerAudience,
  type Decision,
  type Demande,
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
import {
  dureeReelle,
  formaterDate,
  LIBELLES_AUDIENCE,
  LIBELLES_DECISION,
  LIBELLES_STATUT,
  STATUTS_DECIDABLES,
  STATUTS_MODIFIABLES,
  TON_STATUT,
} from '../lib/libelles';

export function DemandeDetailPage() {
  const { id = '' } = useParams();
  const { jeton } = useAuth();
  const charger = useCallback((s: AbortSignal) => lireDemande(jeton, id, s), [jeton, id]);
  const r = useRequete(charger);

  return (
    <>
      <p>
        <Link to="/demandes">← Retour aux demandes</Link>
      </p>
      {r.etat === 'chargement' && <Spinner libelle="Chargement de la demande…" />}
      {r.etat === 'erreur' && (
        <ErrorState titre="Demande indisponible" message={r.message} onRetry={r.recharger} />
      )}
      {r.etat === 'succes' && <Detail d={r.donnees} recharger={r.recharger} />}
    </>
  );
}

function Detail({ d, recharger }: { d: Demande; recharger: () => void }) {
  const { peut } = useDroits();
  return (
    <div className="pile">
      <h1>
        {d.reference} <Badge ton={TON_STATUT[d.statut]}>{LIBELLES_STATUT[d.statut]}</Badge>
      </h1>
      <Card titre="Demande">
        <dl className="definitions">
          <dt>Visiteur</dt>
          <dd>{d.visiteur_nom}</dd>
          <dt>Agenda</dt>
          <dd>{d.agenda_nom}</dd>
          <dt>Objet</dt>
          <dd>{d.objet}</dd>
          <dt>Contact</dt>
          <dd>{d.contact ?? '—'}</dd>
          <dt>Dérogation</dt>
          <dd>{d.derogation ?? '—'}</dd>
          <dt>Responsable de suivi</dt>
          <dd>{d.responsable_suivi_nom}</dd>
          <dt>Créée par, le</dt>
          <dd>
            {d.cree_par_nom}, {formaterDate(d.cree_le)}
          </dd>
          <dt>Qualification initiale</dt>
          <dd>{d.qualification_initiale ?? '—'}</dd>
        </dl>
      </Card>

      {peut('demande.qualifier') && d.statut === 'recue' && (
        <Qualification id={d.id} recharger={recharger} />
      )}
      {peut('demande.modifier') && STATUTS_MODIFIABLES.includes(d.statut) && (
        <Modification d={d} recharger={recharger} />
      )}
      {d.decisions && <Decisions d={d} recharger={recharger} />}
      {peut('audience.planifier') && d.statut === 'validee' && (
        <Planification id={d.id} recharger={recharger} />
      )}
      {d.audience && <AudienceCarte d={d} recharger={recharger} />}
    </div>
  );
}

function Qualification({ id, recharger }: { id: string; recharger: () => void }) {
  const { jeton } = useAuth();
  const { enCours, erreur, executer } = useAction();
  const [texte, setTexte] = useState('');
  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (await executer(() => qualifierDemande(jeton, id, texte))) recharger();
  }
  return (
    <Card titre="Qualification initiale (sans décision)">
      <form className="formulaire" onSubmit={(e) => void soumettre(e)}>
        <Champ id="q-texte" libelle="Qualification">
          <textarea
            id="q-texte"
            rows={2}
            required
            maxLength={1000}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
          />
        </Champ>
        <ErreurAction erreur={erreur} />
        <button type="submit" className="bouton" disabled={enCours}>
          Qualifier
        </button>
      </form>
    </Card>
  );
}

function Modification({ d, recharger }: { d: Demande; recharger: () => void }) {
  const { jeton } = useAuth();
  const { enCours, erreur, executer } = useAction();
  const [objet, setObjet] = useState(d.objet);
  const [contact, setContact] = useState(d.contact ?? '');
  const [derog, setDerog] = useState(d.derogation ?? '');
  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const corps = { objet, contact: contact.trim() || null, derogation: derog.trim() || null };
    if (await executer(() => modifierDemande(jeton, d.id, corps))) recharger();
  }
  return (
    <Card titre="Corriger la demande">
      <form className="formulaire" onSubmit={(e) => void soumettre(e)}>
        <Champ id="m-objet" libelle="Objet">
          <textarea
            id="m-objet"
            rows={2}
            required
            maxLength={2000}
            value={objet}
            onChange={(e) => setObjet(e.target.value)}
          />
        </Champ>
        <Champ id="m-contact" libelle="Contact">
          <input
            id="m-contact"
            maxLength={300}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </Champ>
        <Champ id="m-derog" libelle="Dérogation">
          <input
            id="m-derog"
            maxLength={1000}
            value={derog}
            onChange={(e) => setDerog(e.target.value)}
          />
        </Champ>
        <ErreurAction erreur={erreur} />
        <button type="submit" className="bouton" disabled={enCours}>
          Enregistrer les corrections
        </button>
      </form>
    </Card>
  );
}

function Decisions({ d, recharger }: { d: Demande; recharger: () => void }) {
  const { jeton } = useAuth();
  const { peut } = useDroits();
  const { enCours, erreur, executer } = useAction();
  const [motif, setMotif] = useState('');
  const decidable = peut('decision.valider_rejeter') && STATUTS_DECIDABLES.includes(d.statut);
  const sansMotif = motif.trim() === '';
  async function choisir(type: Decision['type']) {
    if (sansMotif) return; // le serveur l'exige aussi (400) : on évite seulement l'aller-retour
    if (await executer(() => decider(jeton, d.id, type, motif))) {
      setMotif('');
      recharger();
    }
  }
  return (
    <Card titre="Décisions">
      {(d.decisions ?? []).length === 0 ? (
        <p>Aucune décision rendue.</p>
      ) : (
        <ul className="liste-simple">
          {d.decisions!.map((x) => (
            <li key={x.id}>
              <strong>{LIBELLES_DECISION[x.type]}</strong> par {x.decide_par_nom},{' '}
              {formaterDate(x.decide_le)} : {x.motif}
            </li>
          ))}
        </ul>
      )}
      {decidable && (
        <form className="formulaire" onSubmit={(e) => e.preventDefault()}>
          <Champ id="dec-motif" libelle="Motif (obligatoire)">
            <textarea
              id="dec-motif"
              required
              rows={2}
              maxLength={2000}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
            />
          </Champ>
          <ErreurAction erreur={erreur} />
          <div className="actions">
            <button
              type="button"
              className="bouton"
              disabled={enCours || sansMotif}
              onClick={() => void choisir('valider')}
            >
              Valider
            </button>
            <button
              type="button"
              className="bouton bouton--secondaire"
              disabled={enCours || sansMotif}
              onClick={() => void choisir('rejeter')}
            >
              Rejeter
            </button>
            {peut('decision.differer') && d.statut !== 'differee' && (
              <button
                type="button"
                className="bouton bouton--secondaire"
                disabled={enCours || sansMotif}
                onClick={() => void choisir('differer')}
              >
                Différer
              </button>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}

function Planification({ id, recharger }: { id: string; recharger: () => void }) {
  const { jeton } = useAuth();
  const { enCours, erreur, executer } = useAction();
  const [debut, setDebut] = useState('');
  const [duree, setDuree] = useState('30');
  async function soumettre(e: FormEvent) {
    e.preventDefault();
    // L'heure saisie est celle du navigateur ; on envoie un instant ISO avec fuseau (Z).
    const iso = new Date(debut).toISOString();
    if (
      await executer(() =>
        planifierAudience(jeton, {
          demande_id: id,
          debut_prevu: iso,
          duree_prevue_minutes: Number(duree),
        }),
      )
    )
      recharger();
  }
  return (
    <Card titre="Planifier l’audience">
      <form className="formulaire" onSubmit={(e) => void soumettre(e)}>
        <Champ id="p-debut" libelle="Début prévu">
          <input
            id="p-debut"
            type="datetime-local"
            required
            value={debut}
            onChange={(e) => setDebut(e.target.value)}
          />
        </Champ>
        <Champ id="p-duree" libelle="Durée prévue (minutes)">
          <input
            id="p-duree"
            type="number"
            min={1}
            max={1440}
            required
            value={duree}
            onChange={(e) => setDuree(e.target.value)}
          />
        </Champ>
        <ErreurAction erreur={erreur} />
        <button type="submit" className="bouton" disabled={enCours}>
          Planifier
        </button>
      </form>
    </Card>
  );
}

function AudienceCarte({ d, recharger }: { d: Demande; recharger: () => void }) {
  const { jeton } = useAuth();
  const { peut } = useDroits();
  const { enCours, erreur, executer } = useAction();
  const [resultat, setResultat] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const a = d.audience!;
  const duree = dureeReelle(a.debut_reel, a.fin_reel);
  async function agir(f: () => Promise<unknown>) {
    if (await executer(f)) recharger();
  }
  return (
    <Card titre="Audience">
      <dl className="definitions">
        <dt>Statut</dt>
        <dd>
          <Badge ton={a.statut === 'cloturee' ? 'neutre' : 'ok'}>
            {LIBELLES_AUDIENCE[a.statut]}
          </Badge>
        </dd>
        <dt>Début prévu, durée</dt>
        <dd>
          {formaterDate(a.debut_prevu)}, {a.duree_prevue_minutes} min
        </dd>
        <dt>Début et fin réels</dt>
        <dd>
          {formaterDate(a.debut_reel)} → {formaterDate(a.fin_reel)}
        </dd>
        <dt>Durée réelle</dt>
        <dd>{duree === null ? '—' : `${duree} min`}</dd>
        <dt>Responsable de suivi de l’audience</dt>
        <dd>{a.responsable_suivi_nom ?? '—'}</dd>
        <dt>Résultat</dt>
        <dd>{a.resultat ?? '—'}</dd>
        {a.cloturee_le && (
          <>
            <dt>Clôturée le, conservation jusqu’au</dt>
            <dd>
              {formaterDate(a.cloturee_le)}, {a.conservation_echeance}
            </dd>
          </>
        )}
      </dl>
      <ErreurAction erreur={erreur} />
      {peut('audience.demarrer_terminer') && a.statut === 'planifiee' && (
        <button
          type="button"
          className="bouton"
          disabled={enCours}
          onClick={() => void agir(() => demarrerAudience(jeton, a.id))}
        >
          Démarrer l’audience
        </button>
      )}
      {peut('audience.demarrer_terminer') && a.statut === 'en_cours' && (
        <form
          className="formulaire"
          onSubmit={(e) => {
            e.preventDefault();
            void agir(() => terminerAudience(jeton, a.id, resultat));
          }}
        >
          <Champ id="a-resultat" libelle="Résultat de l’audience">
            <textarea
              id="a-resultat"
              rows={2}
              required
              maxLength={4000}
              value={resultat}
              onChange={(e) => setResultat(e.target.value)}
            />
          </Champ>
          <button type="submit" className="bouton" disabled={enCours}>
            Terminer et enregistrer le résultat
          </button>
        </form>
      )}
      {a.statut === 'terminee' &&
        (peut('audience.cloturer') ? (
          confirmation ? (
            <div
              className="alerte alerte--info"
              role="alertdialog"
              aria-label="Confirmer la clôture"
            >
              <p>
                La clôture est <strong>irréversible</strong> et ouvre le délai de conservation de 5
                ans. Vérifiez le résultat, la durée réelle et le responsable de suivi.
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="bouton"
                  disabled={enCours}
                  onClick={() => void agir(() => cloturerAudience(jeton, a.id))}
                >
                  Confirmer la clôture
                </button>
                <button
                  type="button"
                  className="bouton bouton--secondaire"
                  onClick={() => setConfirmation(false)}
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="bouton" onClick={() => setConfirmation(true)}>
              Clôturer
            </button>
          )
        ) : (
          <p className="note">
            Clôture réservée à l’Autorité et à l’Assistant (arbitrage du 19/10/2026).
          </p>
        ))}
    </Card>
  );
}
