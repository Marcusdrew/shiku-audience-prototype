import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { lireJournal, lirePurgesJournal, TAILLE_PAGE_JOURNAL } from '../api/metier';
import { useRequete } from '../api/useRequete';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/Card';
import { Champ } from '../components/Champ';
import { ErrorState } from '../components/ErrorState';
import { Pagination } from '../components/Pagination';
import { Spinner } from '../components/Spinner';
import { formaterDate } from '../lib/libelles';

// Types d'objets réellement écrits par le backend (backend/src/**/*.controller.ts, `objetType`, et
// scripts/amorcer-donnees-test.mjs).
const TYPES_OBJET = [
  'demande',
  'audience',
  'visiteur',
  'agenda',
  'rattachement_agenda',
  'utilisateur',
  'organisation',
  'journal',
] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lecture seule du journal (`GET /journal`), avec les seuls filtres exposés par le serveur :
 * catégorie (parmi celles de la vue), type d'objet et identifiant d'objet. L'accès et la vue limitée
 * de l'Autorité sont décidés par le serveur (Q-1, HYPOTHESE(DEC-38)) ; l'écran n'en déduit rien.
 */
export function JournalPage() {
  const { jeton } = useAuth();
  const [categorie, setCategorie] = useState('');
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
          {
            categorie: categorie || undefined,
            objet_type: objetType || undefined,
            objet_id: objetId || undefined,
            decalage,
          },
          s,
        ),
      [jeton, categorie, objetType, objetId, decalage],
    ),
  );
  const purges = useRequete(useCallback((s: AbortSignal) => lirePurgesJournal(jeton, s), [jeton]));
  const categories = r.etat === 'succes' ? (r.donnees.categories_visibles ?? []) : [];

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
          <Champ id="j-cat" libelle="Catégorie">
            <select
              id="j-cat"
              value={categorie}
              onChange={(e) => {
                setDecalage(0);
                setCategorie(e.target.value);
              }}
            >
              <option value="">Toutes celles de votre vue</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.libelle}
                </option>
              ))}
            </select>
          </Champ>
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
                    <th>Catégorie</th>
                    <th>Action</th>
                    <th>Résultat</th>
                    <th>Objet</th>
                  </tr>
                </thead>
                <tbody>
                  {r.donnees.elements.map((e) => (
                    <tr key={e.id}>
                      <td>{formaterDate(e.horodatage)}</td>
                      <td>{e.utilisateur_nom}</td>
                      <td>
                        {e.categorie_libelle ?? '—'}
                        {e.sous_delegation && ' (sous délégation)'}
                      </td>
                      <td>
                        <code>{e.action}</code>
                      </td>
                      <td>{e.resultat === 'refuse' ? 'Refusé' : 'Accepté'}</td>
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
          Vue limitée (décision du 22/10/2026) : consultation du dossier relationnel, droits et
          délégations, priorité, signalement et revue, plus les entrées « sous délégation ». Les
          décisions et audiences se consultent dans les écrans métier. Les refus d’actions sensibles
          apparaissent avec le résultat « Refusé ». Pas encore développé : l’accès temporaire de
          l’Administrateur.
        </p>
      </Card>
      <Card titre="Purges du journal (récapitulatif)">
        {purges.etat === 'chargement' && <Spinner />}
        {purges.etat === 'erreur' && (
          <ErrorState
            titre="Récapitulatif indisponible"
            message={purges.message}
            onRetry={purges.recharger}
          />
        )}
        {purges.etat === 'succes' &&
          (purges.donnees.elements.length === 0 ? (
            <p>Aucune purge exécutée.</p>
          ) : (
            <div className="defile">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Date de la purge</th>
                    <th>Entrées supprimées</th>
                    <th>Période couverte</th>
                    <th>Par catégorie</th>
                  </tr>
                </thead>
                <tbody>
                  {purges.donnees.elements.map((p) => (
                    <tr key={p.id}>
                      <td>{formaterDate(p.purge_le)}</td>
                      <td>{p.entrees_supprimees}</td>
                      <td>
                        {formaterDate(p.plus_ancienne)} — {formaterDate(p.plus_recente)}
                      </td>
                      <td>
                        {Object.entries(p.par_categorie)
                          .map(([c, n]) => `${c} : ${n}`)
                          .join(' ; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        <p className="note">
          Récapitulatif seulement : le contenu des entrées purgées n’est jamais restitué.
        </p>
      </Card>
    </>
  );
}
