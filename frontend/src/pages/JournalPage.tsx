import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { lireJournal, TAILLE_PAGE_JOURNAL } from '../api/metier';
import { useRequete } from '../api/useRequete';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/Card';
import { Champ } from '../components/Champ';
import { ErrorState } from '../components/ErrorState';
import { Pagination } from '../components/Pagination';
import { Spinner } from '../components/Spinner';
import { formaterDate } from '../lib/libelles';

// Types d'objets réellement écrits par le backend (backend/src/**/*.controller.ts, `objetType`).
const TYPES_OBJET = ['demande', 'audience', 'visiteur', 'agenda', 'utilisateur'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lecture seule du journal (`GET /journal`), avec les seuls filtres exposés par le serveur :
 * type d'objet et identifiant d'objet. L'accès est décidé par le serveur (`journal.consulter`).
 */
export function JournalPage() {
  const { jeton } = useAuth();
  const [objetType, setObjetType] = useState('');
  const [objetIdSaisi, setObjetIdSaisi] = useState('');
  const [objetId, setObjetId] = useState('');
  const [decalage, setDecalage] = useState(0);
  const idInvalide = objetIdSaisi.trim() !== '' && !UUID.test(objetIdSaisi.trim());

  const r = useRequete(
    useCallback(
      (s: AbortSignal) =>
        lireJournal(
          jeton,
          { objet_type: objetType || undefined, objet_id: objetId || undefined, decalage },
          s,
        ),
      [jeton, objetType, objetId, decalage],
    ),
  );

  function filtrer(e: FormEvent) {
    e.preventDefault();
    if (idInvalide) return;
    setDecalage(0);
    setObjetId(objetIdSaisi.trim());
  }

  return (
    <>
      <h1>Journal d’audit</h1>
      <p className="lead">
        Entrées les plus récentes. Le journal est en ajout seul, protégé contre la modification et
        la suppression au niveau de la base de données, y compris pour un administrateur applicatif
        ; ce n’est pas une garantie absolue (limites : docs/dev/JOURNAL.md).
      </p>
      <Card titre="Entrées">
        <form className="filtres" onSubmit={filtrer}>
          <Champ id="j-type" libelle="Type d’objet">
            <select
              id="j-type"
              value={objetType}
              onChange={(e) => {
                setDecalage(0);
                setObjetType(e.target.value);
              }}
            >
              <option value="">Tous</option>
              {TYPES_OBJET.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Champ>
          <Champ id="j-id" libelle="Identifiant de l’objet (UUID)">
            <input
              id="j-id"
              value={objetIdSaisi}
              aria-invalid={idInvalide}
              onChange={(e) => setObjetIdSaisi(e.target.value)}
            />
          </Champ>
          <button type="submit" className="bouton bouton--secondaire" disabled={idInvalide}>
            Filtrer
          </button>
        </form>
        {idInvalide && <p className="note">L’identifiant doit être un UUID.</p>}
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
                      <td>
                        {e.objet_type}
                        {e.objet_id && (
                          <>
                            {' '}
                            <code>{e.objet_id}</code>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                decalage={decalage}
                taille={TAILLE_PAGE_JOURNAL}
                affiches={r.donnees.elements.length}
                onChanger={setDecalage}
              />
            </div>
          ))}
        <p className="note">
          Restrictions décidées le 19/10/2026 (vue limitée à cinq catégories pour l’Autorité,
          période, journalisation de chaque consultation, habilitation temporaire de
          l’Administrateur) : pas encore appliquées par le serveur, en attente du classement des
          actions par catégorie.
        </p>
      </Card>
    </>
  );
}
