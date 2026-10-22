import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { creerVisiteur, rechercherVisiteurs, type Visiteur } from '../api/metier';
import { useRequete } from '../api/useRequete';
import { useAuth } from '../auth/AuthContext';
import { useDroits } from '../auth/DroitsContext';
import { Card } from '../components/Card';
import { Champ } from '../components/Champ';
import { ErreurAction } from '../components/ErreurAction';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { useAction } from '../components/useAction';

/**
 * Répertoire minimal des visiteurs, branché sur `GET /visiteurs` et `POST /visiteurs`.
 * Le dossier relationnel (notes, attestations, signalements) n'est pas exposé par le backend.
 *
 * Arbitrage du 19/10/2026 (DEC-19) : Réception, Assistant et Autorité créent un visiteur, après
 * recherche pour éviter un doublon ; la Réception ne saisit que l'identité minimale et le contact,
 * la qualification reste à l'Assistant (ou à l'Autorité). Le serveur refuse la qualification à la
 * Réception : le masquage du champ ici n'est qu'un confort d'affichage.
 */
export function RelationnelPage() {
  const { jeton, roles } = useAuth();
  const { peut } = useDroits();
  const [terme, setTerme] = useState('');
  const [recherche, setRecherche] = useState('');
  const [rechercheFaite, setRechercheFaite] = useState(false);
  const [nom, setNom] = useState('');
  const [contact, setContact] = useState('');
  const [qualite, setQualite] = useState('');
  const [cree, setCree] = useState<Visiteur | null>(null);
  const action = useAction();
  const peutQualifier = roles.includes('assistant') || roles.includes('authority');

  const charger = useCallback(
    (signal: AbortSignal) => rechercherVisiteurs(jeton, recherche, signal),
    [jeton, recherche],
  );
  const liste = useRequete(charger);

  function chercher(e: FormEvent) {
    e.preventDefault();
    setCree(null);
    setRecherche(terme.trim());
    setRechercheFaite(true);
    if (!nom) setNom(terme.trim());
  }

  async function creer(e: FormEvent) {
    e.preventDefault();
    const nouveau = await action.executer(() =>
      creerVisiteur(jeton, {
        nom_complet: nom.trim(),
        ...(contact.trim() ? { contact: contact.trim() } : {}),
        ...(peutQualifier && qualite.trim() ? { qualite: qualite.trim() } : {}),
      }),
    );
    if (nouveau) {
      setCree(nouveau);
      setNom('');
      setContact('');
      setQualite('');
      setTerme(nouveau.nom_complet);
      setRecherche(nouveau.nom_complet);
      liste.recharger();
    }
  }

  const visiteurs = liste.etat === 'succes' ? liste.donnees.elements : [];

  return (
    <>
      <h1>Répertoire des visiteurs</h1>
      <p className="lead">
        Recherche et création des fiches minimales de visiteurs via l’API métier. Les notes,
        attestations et autres éléments du dossier relationnel ne sont pas disponibles dans l’API
        actuelle.
      </p>
      <div className="pile">
        {peut('visiteur.rechercher') && (
          <Card titre="Rechercher un visiteur">
            <form className="filtres" onSubmit={chercher}>
              <Champ id="vis-q" libelle="Nom du visiteur">
                <input
                  id="vis-q"
                  value={terme}
                  maxLength={100}
                  onChange={(e) => setTerme(e.target.value)}
                />
              </Champ>
              <button className="bouton" type="submit">
                Rechercher
              </button>
            </form>
            {liste.etat === 'chargement' && <Spinner libelle="Chargement des visiteurs…" />}
            {liste.etat === 'erreur' && (
              <ErrorState
                titre="Recherche impossible"
                message={liste.message}
                onRetry={liste.recharger}
              />
            )}
            {liste.etat === 'succes' &&
              (visiteurs.length === 0 ? (
                <p>Aucun visiteur trouvé.</p>
              ) : (
                <div className="defile">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Nom complet</th>
                        <th>Contact</th>
                        <th>Qualité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiteurs.map((v) => (
                        <tr key={v.id}>
                          <td>{v.nom_complet}</td>
                          <td>{v.contact || '—'}</td>
                          <td>{v.qualite || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </Card>
        )}
        {peut('visiteur.creer') && (
          <Card titre="Créer une fiche visiteur">
            {cree && (
              <p className="alerte alerte--info" role="status">
                Fiche créée : {cree.nom_complet}.
              </p>
            )}
            {!rechercheFaite && peut('visiteur.rechercher') ? (
              <p className="note">
                Recherchez d’abord le visiteur : la création n’est proposée qu’après une recherche,
                pour éviter les doublons.
              </p>
            ) : (
              <form className="formulaire" onSubmit={(e) => void creer(e)}>
                {rechercheFaite && visiteurs.length > 0 && (
                  <p className="note">
                    {visiteurs.length} fiche(s) proche(s) trouvée(s) ci-dessus : vérifiez qu’il ne
                    s’agit pas de la même personne avant de créer une nouvelle fiche.
                  </p>
                )}
                <Champ id="vis-nom" libelle="Nom complet">
                  <input
                    id="vis-nom"
                    required
                    maxLength={200}
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                  />
                </Champ>
                <Champ id="vis-contact" libelle="Contact (facultatif)">
                  <input
                    id="vis-contact"
                    maxLength={300}
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                </Champ>
                {peutQualifier ? (
                  <Champ id="vis-qualite" libelle="Qualité / fonction (facultatif)">
                    <input
                      id="vis-qualite"
                      maxLength={200}
                      value={qualite}
                      onChange={(e) => setQualite(e.target.value)}
                    />
                  </Champ>
                ) : (
                  <p className="note">
                    La qualification du visiteur (qualité, fonction) est saisie par l’Assistant.
                  </p>
                )}
                <ErreurAction erreur={action.erreur} />
                <button className="bouton" type="submit" disabled={action.enCours}>
                  Créer le visiteur
                </button>
              </form>
            )}
          </Card>
        )}
        {!peut('visiteur.rechercher') && !peut('visiteur.creer') && (
          <p className="note">
            Aucun droit de consultation ou de création de visiteur n’est accordé à votre compte.
          </p>
        )}
      </div>
    </>
  );
}
