import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import {
  contactAffiche,
  modifierVisiteur,
  rechercherVisiteurs,
  type Visiteur,
} from '../api/metier';
import { useRequete } from '../api/useRequete';
import { useAuth } from '../auth/AuthContext';
import { useDroits } from '../auth/DroitsContext';
import { Card } from '../components/Card';
import { Champ } from '../components/Champ';
import { ErreurAction } from '../components/ErreurAction';
import { ErrorState } from '../components/ErrorState';
import { FormulaireVisiteur } from '../components/FormulaireVisiteur';
import { Spinner } from '../components/Spinner';
import { useAction } from '../components/useAction';

/**
 * Répertoire minimal des visiteurs, branché sur `GET /visiteurs`, `POST /visiteurs` et
 * `PATCH /visiteurs/:id`. Le dossier relationnel (notes, attestations, signalements) n'est pas exposé.
 *
 * Règles (DEC-19 du 19/10, DEC-36 du 22/10, provisoires) :
 * - la Réception recherche et crée, avec un résultat minimal : nom et contact masqué, sans
 *   qualification. Le serveur ne lui envoie jamais le contact complet ;
 * - l'Assistant et l'Autorité voient la fiche complète, la qualifient et la modifient ;
 * - les doublons sont signalés par le serveur ; l'écran demande de choisir ou de confirmer.
 * Les droits sont décidés par le serveur ; masquer un champ ici n'est qu'un confort d'affichage.
 */
export function RelationnelPage() {
  const { jeton, roles } = useAuth();
  const { peut } = useDroits();
  const [terme, setTerme] = useState('');
  const [recherche, setRecherche] = useState('');
  const [rechercheFaite, setRechercheFaite] = useState(false);
  const [cree, setCree] = useState<Visiteur | null>(null);
  const [enEdition, setEnEdition] = useState<Visiteur | null>(null);
  const peutQualifier = roles.includes('assistant') || roles.includes('authority');
  const peutModifier = peut('visiteur.modifier');

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
  }

  function apresCreation(v: Visiteur) {
    setCree(v);
    setTerme(v.nom_complet);
    setRecherche(v.nom_complet);
    liste.recharger();
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
            {!peutModifier && (
              <p className="note">
                Contacts masqués : votre profil voit le nom et un contact partiel seulement.
              </p>
            )}
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
                        {peutModifier && <th>Qualité</th>}
                        {peutModifier && <th>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visiteurs.map((v) => (
                        <tr key={v.id}>
                          <td>{v.nom_complet}</td>
                          <td>{contactAffiche(v) ?? '—'}</td>
                          {peutModifier && <td>{v.qualite || '—'}</td>}
                          {peutModifier && (
                            <td>
                              <button
                                type="button"
                                className="bouton bouton--secondaire"
                                onClick={() => setEnEdition(v)}
                              >
                                Modifier
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </Card>
        )}
        {peutModifier && enEdition && (
          <ModificationVisiteur
            key={enEdition.id}
            jeton={jeton}
            visiteur={enEdition}
            onFin={(modifie) => {
              setEnEdition(null);
              if (modifie) liste.recharger();
            }}
          />
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
              <>
                {rechercheFaite && visiteurs.length > 0 && (
                  <p className="note">
                    {visiteurs.length} fiche(s) proche(s) trouvée(s) ci-dessus : vérifiez qu’il ne
                    s’agit pas de la même personne avant de créer une nouvelle fiche.
                  </p>
                )}
                <FormulaireVisiteur
                  key={recherche}
                  jeton={jeton}
                  peutQualifier={peutQualifier}
                  prefixe="vis"
                  nomInitial={recherche}
                  onCree={apresCreation}
                />
              </>
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

/** Modification par l'Assistant ou l'Autorité (DEC-36) : seuls les champs changés sont envoyés. */
function ModificationVisiteur({
  jeton,
  visiteur,
  onFin,
}: {
  jeton: string | null;
  visiteur: Visiteur;
  onFin: (modifie: boolean) => void;
}) {
  const [prenom, setPrenom] = useState(visiteur.prenom ?? '');
  const [nom, setNom] = useState(visiteur.nom ?? '');
  const [contact, setContact] = useState(visiteur.contact ?? '');
  const [qualite, setQualite] = useState(visiteur.qualite ?? '');
  const action = useAction();

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    const corps: Partial<Record<'prenom' | 'nom' | 'contact' | 'qualite', string>> = {};
    if (prenom.trim() !== (visiteur.prenom ?? '')) corps.prenom = prenom.trim();
    if (nom.trim() !== (visiteur.nom ?? '')) corps.nom = nom.trim();
    if (contact.trim() !== (visiteur.contact ?? '')) corps.contact = contact.trim();
    if (qualite.trim() !== (visiteur.qualite ?? '')) corps.qualite = qualite.trim();
    if (!Object.keys(corps).length) return onFin(false);
    const r = await action.executer(() => modifierVisiteur(jeton, visiteur.id, corps));
    if (r) onFin(true);
  }

  return (
    <Card titre={`Modifier la fiche : ${visiteur.nom_complet}`}>
      {!visiteur.prenom && (
        <p className="note">
          Fiche antérieure : seul le nom complet est connu. Pour changer le nom, saisissez le prénom
          et le nom.
        </p>
      )}
      <form className="formulaire" onSubmit={(e) => void enregistrer(e)}>
        <Champ id="mod-prenom" libelle="Prénom">
          <input
            id="mod-prenom"
            maxLength={100}
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
          />
        </Champ>
        <Champ id="mod-nom" libelle="Nom">
          <input
            id="mod-nom"
            maxLength={100}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
        </Champ>
        <Champ id="mod-contact" libelle="Contact (téléphone ou courriel)">
          <input
            id="mod-contact"
            maxLength={300}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </Champ>
        <Champ id="mod-qualite" libelle="Qualité / fonction">
          <input
            id="mod-qualite"
            maxLength={200}
            value={qualite}
            onChange={(e) => setQualite(e.target.value)}
          />
        </Champ>
        <ErreurAction erreur={action.erreur} />
        <div className="actions">
          <button className="bouton" type="submit" disabled={action.enCours}>
            Enregistrer la modification
          </button>
          <button className="bouton bouton--secondaire" type="button" onClick={() => onFin(false)}>
            Annuler
          </button>
        </div>
      </form>
    </Card>
  );
}
