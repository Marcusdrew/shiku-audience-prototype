import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CRITERES_PRIORITE,
  type CriterePriorite,
  type Demande,
  fixerPriorite,
  lireReferentielPriorite,
  type ReferentielPriorite,
  saisirCriteres,
} from '../api/metier';
import { useRequete } from '../api/useRequete';
import { useAuth } from '../auth/AuthContext';
import { useDroits } from '../auth/DroitsContext';
import { formaterDate } from '../lib/libelles';
import { Card } from './Card';
import { Champ } from './Champ';
import { ErreurAction } from './ErreurAction';
import { useAction } from './useAction';

const NOMS: Record<CriterePriorite, string> = {
  rang_protocolaire: 'Rang protocolaire',
  urgence: 'Urgence',
  importance_strategique: 'Importance stratégique',
  relation: 'Relation',
};
const STATUTS_PRIORISABLES = ['recue', 'qualifiee', 'differee', 'validee', 'planifiee'];

export const libelleValeur = (
  ref: ReferentielPriorite | null,
  critere: keyof ReferentielPriorite,
  code: string | null | undefined,
) => (code ? (ref?.[critere]?.find((v) => v.code === code)?.libelle ?? code) : '—');

/**
 * Priorité d'une demande (HYPOTHESE(DEC-37), règle provisoire du 22/10/2026) : les six critères sont
 * tous affichés (agenda et chronologie viennent de la demande) ; l'Assistant et l'Autorité saisissent
 * les critères ; seule l'Autorité fixe le niveau. Aucune formule : le niveau n'est jamais calculé.
 */
export function PrioriteCarte({ d, recharger }: { d: Demande; recharger: () => void }) {
  const { jeton } = useAuth();
  const { peut } = useDroits();
  const referentiel = useRequete(
    useCallback((s: AbortSignal) => lireReferentielPriorite(jeton, s), [jeton]),
  );
  const ref = referentiel.etat === 'succes' ? referentiel.donnees : null;
  const modifiable = STATUTS_PRIORISABLES.includes(d.statut);

  return (
    <Card titre="Priorité">
      <dl className="definitions">
        <dt>Niveau</dt>
        <dd>
          {d.priorite ? (
            <strong>{libelleValeur(ref, 'niveau', d.priorite)}</strong>
          ) : (
            'Non fixé (rang par ancienneté)'
          )}
          {d.priorite_fixee_par_nom &&
            ` — fixé par ${d.priorite_fixee_par_nom}, le ${formaterDate(d.priorite_fixee_le ?? '')}`}
        </dd>
        {d.priorite_justification && (
          <>
            <dt>Justification</dt>
            <dd>{d.priorite_justification}</dd>
          </>
        )}
        <dt>Agenda</dt>
        <dd>{d.agenda_nom}</dd>
        {CRITERES_PRIORITE.map((k) => (
          <div key={k} className="contents">
            <dt>{NOMS[k]}</dt>
            <dd>{libelleValeur(ref, k, d[k])}</dd>
          </div>
        ))}
        <dt>Chronologie</dt>
        <dd>Reçue le {formaterDate(d.cree_le)}</dd>
      </dl>
      <p className="note">
        Aucune formule ne combine ces critères : la grille de pondération sera définie avec
        l’Autorité. Valeurs provisoires à trois niveaux.
      </p>
      {modifiable && ref && peut('demande.saisir_criteres') && (
        <Criteres d={d} ref_={ref} recharger={recharger} />
      )}
      {modifiable && ref && peut('demande.changer_priorite') && (
        <Niveau d={d} ref_={ref} recharger={recharger} />
      )}
    </Card>
  );
}

function Criteres({
  d,
  ref_,
  recharger,
}: {
  d: Demande;
  ref_: ReferentielPriorite;
  recharger: () => void;
}) {
  const { jeton } = useAuth();
  const action = useAction();
  const [valeurs, setValeurs] = useState<Record<CriterePriorite, string>>(
    () =>
      Object.fromEntries(CRITERES_PRIORITE.map((k) => [k, d[k] ?? ''])) as Record<
        CriterePriorite,
        string
      >,
  );
  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    const corps = Object.fromEntries(
      CRITERES_PRIORITE.filter((k) => valeurs[k] !== (d[k] ?? '')).map((k) => [k, valeurs[k]]),
    );
    if (!Object.keys(corps).length) return;
    if (await action.executer(() => saisirCriteres(jeton, d.id, corps))) recharger();
  }
  return (
    <form className="formulaire" onSubmit={(e) => void enregistrer(e)}>
      <h3>Saisir les critères</h3>
      {CRITERES_PRIORITE.map((k) => (
        <Champ key={k} id={`crit-${k}`} libelle={NOMS[k]}>
          <select
            id={`crit-${k}`}
            value={valeurs[k]}
            onChange={(e) => setValeurs((v) => ({ ...v, [k]: e.target.value }))}
          >
            <option value="">— Non renseigné —</option>
            {ref_[k].map((x) => (
              <option key={x.code} value={x.code}>
                {x.libelle}
              </option>
            ))}
          </select>
        </Champ>
      ))}
      <ErreurAction erreur={action.erreur} />
      <button type="submit" className="bouton bouton--secondaire" disabled={action.enCours}>
        Enregistrer les critères
      </button>
    </form>
  );
}

function Niveau({
  d,
  ref_,
  recharger,
}: {
  d: Demande;
  ref_: ReferentielPriorite;
  recharger: () => void;
}) {
  const { jeton } = useAuth();
  const action = useAction();
  const [niveau, setNiveau] = useState(d.priorite ?? '');
  const [justification, setJustification] = useState('');
  async function fixer(e: FormEvent) {
    e.preventDefault();
    const corps = {
      niveau,
      ...(justification.trim() ? { justification: justification.trim() } : {}),
    };
    if (await action.executer(() => fixerPriorite(jeton, d.id, corps))) {
      setJustification('');
      recharger();
    }
  }
  return (
    <form className="formulaire" onSubmit={(e) => void fixer(e)}>
      <h3>Fixer le niveau de priorité</h3>
      <Champ id="prio-niveau" libelle="Niveau">
        <select
          id="prio-niveau"
          required
          value={niveau}
          onChange={(e) => setNiveau(e.target.value)}
        >
          <option value="">— Choisir —</option>
          {ref_.niveau.map((x) => (
            <option key={x.code} value={x.code}>
              {x.libelle}
            </option>
          ))}
        </select>
      </Champ>
      <Champ id="prio-justif" libelle="Justification (si l’écart est contesté)">
        <textarea
          id="prio-justif"
          maxLength={2000}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
        />
      </Champ>
      <ErreurAction erreur={action.erreur} />
      <button type="submit" className="bouton bouton--secondaire" disabled={action.enCours}>
        Fixer le niveau
      </button>
    </form>
  );
}
