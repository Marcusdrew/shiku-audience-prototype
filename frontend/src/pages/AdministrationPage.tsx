import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { creerUtilisateur, listerUtilisateurs } from '../api/metier';
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
  const { enCours, erreur, executer } = useAction();
  const [sub, setSub] = useState('');
  const [nom, setNom] = useState('');
  async function ajouter(e: FormEvent) {
    e.preventDefault();
    if (
      await executer(() => creerUtilisateur(jeton, { keycloak_sub: sub.trim(), nom_complet: nom }))
    ) {
      setSub('');
      setNom('');
      r.recharger();
    }
  }
  return (
    <>
      <h1>Administration</h1>
      <p className="lead">
        Comptes applicatifs rattachés à l’organisation. Délégations : non développées.
      </p>
      <div className="pile">
        {matrice && (
          <div className="alerte alerte--info" role="note">
            Matrice de droits : <Badge ton="attention">{matrice.statut}</Badge> {matrice.reference}
          </div>
        )}
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
        <Card titre="Rattacher un compte Keycloak">
          <form className="formulaire" onSubmit={(e) => void ajouter(e)}>
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
            <ErreurAction erreur={erreur} />
            <button type="submit" className="bouton" disabled={enCours}>
              Rattacher
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
