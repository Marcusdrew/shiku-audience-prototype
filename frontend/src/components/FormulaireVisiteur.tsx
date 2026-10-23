import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../api/client';
import {
  contactAffiche,
  creerVisiteur,
  type DoublonVisiteur,
  lireDoublon,
  type NouveauVisiteur,
  type Visiteur,
} from '../api/metier';
import { Champ } from './Champ';
import { ErreurAction } from './ErreurAction';

/**
 * Création d'une fiche visiteur : identité minimale (prénom, nom, un moyen de contact) et
 * qualification réservée à l'Assistant ou à l'Autorité (DEC-19, DEC-36).
 *
 * Le contrôle de doublon est fait par le SERVEUR (réponses de M. Jordan du 22/10/2026) : en cas de
 * fiche proche, il répond 409 avec les fiches au format minimal (nom, contact masqué). L'écran les
 * montre et demande, soit de choisir la fiche existante, soit de confirmer : « homonyme distinct »
 * quand le contact est identique, simple confirmation quand seul le nom est proche. Jamais de fusion.
 */
export function FormulaireVisiteur({
  jeton,
  peutQualifier,
  prefixe,
  nomInitial = '',
  onCree,
  onChoisir,
  imbrique = false,
}: {
  jeton: string | null;
  peutQualifier: boolean;
  /** Préfixe des identifiants de champs, pour deux formulaires dans la même page. */
  prefixe: string;
  nomInitial?: string;
  onCree: (v: Visiteur) => void;
  /** Si fourni, chaque fiche proche signalée peut être choisie à la place d'une création. */
  onChoisir?: (v: Visiteur) => void;
  /** Dans un autre formulaire (création de demande) : pas de <form> imbriqué, bouton simple. */
  imbrique?: boolean;
}) {
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState(nomInitial);
  const [contact, setContact] = useState('');
  const [qualite, setQualite] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<{ message: string; details: string[] } | null>(null);
  const [doublon, setDoublon] = useState<DoublonVisiteur | null>(null);

  async function envoyer(confirmation?: 'nom' | 'contact') {
    const corps: NouveauVisiteur = {
      prenom: prenom.trim(),
      nom: nom.trim(),
      contact: contact.trim(),
      ...(peutQualifier && qualite.trim() ? { qualite: qualite.trim() } : {}),
      ...(confirmation === 'nom' ? { confirmer_homonyme: true } : {}),
      ...(confirmation === 'contact' ? { motif_doublon: 'homonyme_distinct' as const } : {}),
    };
    setEnCours(true);
    setErreur(null);
    try {
      const v = await creerVisiteur(jeton, corps);
      setDoublon(null);
      setPrenom('');
      setNom('');
      setContact('');
      setQualite('');
      onCree(v);
    } catch (e) {
      const d = e instanceof ApiError && e.statut === 409 ? lireDoublon(e.corps) : null;
      if (d) setDoublon(d);
      else
        setErreur(
          e instanceof ApiError
            ? { message: e.message, details: e.details }
            : { message: 'Erreur inattendue.', details: [] },
        );
    } finally {
      setEnCours(false);
    }
  }

  function soumettre(e?: FormEvent) {
    e?.preventDefault();
    setDoublon(null);
    void envoyer();
  }
  const incomplet = !prenom.trim() || !nom.trim() || !contact.trim();

  const champs = (
    <>
      <Champ id={`${prefixe}-prenom`} libelle="Prénom">
        <input
          id={`${prefixe}-prenom`}
          required
          maxLength={100}
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
        />
      </Champ>
      <Champ id={`${prefixe}-nom`} libelle="Nom">
        <input
          id={`${prefixe}-nom`}
          required
          maxLength={100}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
        />
      </Champ>
      <Champ id={`${prefixe}-contact`} libelle="Contact (téléphone ou courriel)">
        <input
          id={`${prefixe}-contact`}
          required
          maxLength={300}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </Champ>
      {peutQualifier ? (
        <Champ id={`${prefixe}-qualite`} libelle="Qualité / fonction (facultatif)">
          <input
            id={`${prefixe}-qualite`}
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
      <ErreurAction erreur={erreur} />
      {doublon && (
        <div className="alerte alerte--attention" role="alert">
          <strong>{doublon.message}</strong>
          <ul>
            {doublon.doublons.map((v) => (
              <li key={v.id}>
                {v.nom_complet}
                {contactAffiche(v) ? ` — ${contactAffiche(v)}` : ''}
                {onChoisir && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="bouton bouton--secondaire"
                      onClick={() => onChoisir(v)}
                    >
                      Choisir cette fiche
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="bouton"
            disabled={enCours}
            onClick={() => void envoyer(doublon.code === 'doublon_contact' ? 'contact' : 'nom')}
          >
            {doublon.code === 'doublon_contact'
              ? 'Créer quand même : autre personne (homonyme distinct)'
              : 'Créer quand même : ce n’est pas la même personne'}
          </button>
        </div>
      )}
    </>
  );

  return imbrique ? (
    <div className="formulaire">
      {champs}
      <button
        className="bouton bouton--secondaire"
        type="button"
        disabled={enCours || incomplet}
        onClick={() => soumettre()}
      >
        Créer le visiteur
      </button>
    </div>
  ) : (
    <form className="formulaire" onSubmit={soumettre}>
      {champs}
      <button className="bouton" type="submit" disabled={enCours || incomplet}>
        Créer le visiteur
      </button>
    </form>
  );
}
