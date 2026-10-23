import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { creerUtilisateur, listerUtilisateurs, rattacherUtilisateur } from '../api/metier';
import { useRequete } from '../api/useRequete';
import { useAuth } from '../auth/AuthContext';
import { useDroits } from '../auth/DroitsContext';
import { Badge, Card } from '../components/Card';
import { Champ } from '../components/Champ';
import { ErreurAction } from '../components/ErreurAction';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { useAction } from '../components/useAction';

export function AdministrationPage() {
  const { jeton } = useAuth();
  const { matrice } = useDroits();
  const r = useRequete(useCallback((s: AbortSignal) => listerUtilisateurs(jeton, s), [jeton]));
  const creation = useAction();
  const rattachement = useAction();
  const [sub, setSub] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [nomFamille, setNomFamille] = useState('');
  const [courriel, setCourriel] = useState('');
  const [role, setRole] = useState('assistant');
  async function creer(e: FormEvent) {
    e.preventDefault();
    if (
      await creation.executer(() =>
        creerUtilisateur(jeton, { prenom, nom: nomFamille, courriel: courriel.trim(), role }),
      )
    ) {
      setPrenom('');
      setNomFamille('');
      setCourriel('');
      r.recharger();
    }
  }
  async function rattacher(e: FormEvent) {
    e.preventDefault();
    if (
      await rattachement.executer(() =>
        rattacherUtilisateur(jeton, { keycloak_sub: sub.trim(), nom_complet: nom }),
      )
    ) {
      setSub('');
      setNom('');
      r.recharger();
    }
  }
  return (
    <>
      <h1>Administration</h1>
      <p className="lead">Comptes applicatifs rattachés à l’organisation.</p>
      <div className="pile">
        {matrice && (
          <div className="alerte alerte--info" role="note">
            Matrice de droits :{' '}
            <Badge ton={matrice.statut === 'OFFICIELLE' ? 'ok' : 'attention'}>
              {matrice.statut}
            </Badge>{' '}
            {matrice.reference}
          </div>
        )}
        <Card titre="Délégations">
          <p className="note">
            Non disponibles : le serveur n’expose aucune route de délégation (prévues au Sprint 2).
            Les droits « par délégation » de la matrice restent donc refusés.
          </p>
        </Card>
        <Card titre="Utilisateurs">
          {r.etat === 'chargement' && <Spinner />}
          {r.etat === 'erreur' && <ErrorState message={r.message} onRetry={r.recharger} />}
          {r.etat === 'succes' && (
            <ul className="liste-simple">
              {r.donnees.elements.map((u) => (
                <li key={u.id}>
                  {u.nom_complet}{' '}
                  {u.actif ? <Badge ton="ok">Actif</Badge> : <Badge ton="erreur">Désactivé</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card titre="Créer un compte (une personne physique)">
          <p className="note">
            Le compte est créé dans Keycloak par le compte de service de l’application, puis
            rattaché à l’organisation. Il n’a pas de mot de passe : il doit être défini par Keycloak
            à la première connexion. Vous ne pouvez attribuer que les rôles Réception et Assistant :
            les rôles Autorité et Administrateur passent par l’autorisation de l’Autorité (arbitrage
            du 19/10/2026, non développé ici).
          </p>
          <form className="formulaire" onSubmit={(e) => void creer(e)}>
            <Champ id="c-prenom" libelle="Prénom">
              <input
                id="c-prenom"
                required
                maxLength={100}
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
              />
            </Champ>
            <Champ id="c-nom" libelle="Nom">
              <input
                id="c-nom"
                required
                maxLength={100}
                value={nomFamille}
                onChange={(e) => setNomFamille(e.target.value)}
              />
            </Champ>
            <Champ id="c-courriel" libelle="Courriel">
              <input
                id="c-courriel"
                type="email"
                required
                maxLength={200}
                value={courriel}
                onChange={(e) => setCourriel(e.target.value)}
              />
            </Champ>
            <Champ id="c-role" libelle="Rôle">
              <select id="c-role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="reception">Réception</option>
                <option value="assistant">Assistant</option>
              </select>
            </Champ>
            <ErreurAction erreur={creation.erreur} />
            <button type="submit" className="bouton" disabled={creation.enCours}>
              Créer le compte
            </button>
          </form>
        </Card>
        <Card titre="Rattacher un compte Keycloak existant">
          <form className="formulaire" onSubmit={(e) => void rattacher(e)}>
            <Champ id="u-sub" libelle="Identifiant Keycloak (sub)">
              <input
                id="u-sub"
                required
                maxLength={200}
                value={sub}
                onChange={(e) => setSub(e.target.value)}
              />
            </Champ>
            <Champ
              id="u-nom"
              libelle="Nom complet (une personne physique, jamais un compte partagé)"
            >
              <input
                id="u-nom"
                required
                maxLength={200}
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
            </Champ>
            <ErreurAction erreur={rattachement.erreur} />
            <button type="submit" className="bouton" disabled={rattachement.enCours}>
              Rattacher
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
