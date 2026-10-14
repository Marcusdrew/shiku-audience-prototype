import { useCallback } from 'react';
import { Link } from 'react-router';
import { lireMoi } from '../api/moi';
import { lireSante } from '../api/sante';
import { useRequete } from '../api/useRequete';
import { useAuth } from '../auth/AuthContext';
import { LIBELLES_ROLES } from '../auth/roles';
import { Badge, Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { useDroits } from '../auth/DroitsContext';
import { entreesVisibles } from '../navigation';

export function DashboardPage() {
  const { nom, identifiant, email, roles, jeton } = useAuth();
  const droits = useDroits();
  const charger = useCallback((signal: AbortSignal) => lireSante(signal), []);
  const sante = useRequete(charger);
  const chargerMoi = useCallback((signal: AbortSignal) => lireMoi(jeton, signal), [jeton]);
  const moi = useRequete(chargerMoi);

  return (
    <>
      <h1>Tableau de bord</h1>
      <p className="lead">
        Bonjour {nom ?? identifiant ?? ''}. Les indicateurs d’audience (EF03-17) seront affichés ici
        lorsque le backend les fournira.
      </p>

      <div className="grille">
        <Card titre="État du service">
          {sante.etat === 'chargement' && <Spinner libelle="Interrogation de l’API…" />}
          {sante.etat === 'succes' && (
            <ul className="liste-simple">
              <li>
                API :{' '}
                <Badge ton={sante.donnees.statut === 'ok' ? 'ok' : 'erreur'}>
                  {sante.donnees.statut}
                </Badge>
              </li>
              <li>
                Base de données :{' '}
                <Badge ton={sante.donnees.base === 'ok' ? 'ok' : 'erreur'}>
                  {sante.donnees.base}
                </Badge>
              </li>
            </ul>
          )}
          {sante.etat === 'erreur' && (
            <ErrorState
              titre="API indisponible"
              message={sante.message}
              onRetry={sante.recharger}
            />
          )}
        </Card>

        <Card titre="Ma session">
          <dl className="definitions">
            <dt>Identifiant</dt>
            <dd>{identifiant ?? '—'}</dd>
            <dt>Courriel</dt>
            <dd>{email ?? '—'}</dd>
            <dt>Rôles du jeton</dt>
            <dd>
              {roles.length ? roles.map((r) => LIBELLES_ROLES[r]).join(', ') : 'Aucun rôle SHIKU'}
            </dd>
          </dl>
          <p className="note">
            Lus dans le jeton, sans vérification de signature, pour l’affichage seulement : seule
            l’identité confirmée par le serveur fait foi.
          </p>
        </Card>

        <Card titre="Identité confirmée par le serveur">
          {moi.etat === 'chargement' && <Spinner libelle="Vérification par le serveur…" />}
          {moi.etat === 'succes' && (
            <>
              <dl className="definitions">
                <dt>Identifiant</dt>
                <dd>{moi.donnees.identifiant ?? '—'}</dd>
                <dt>Compte applicatif</dt>
                <dd>
                  {droits.etat === 'chargement'
                    ? '…'
                    : droits.compteActif
                      ? 'Actif'
                      : 'Aucun compte actif rattaché'}
                </dd>
                <dt>Rôles vérifiés</dt>
                <dd>
                  {moi.donnees.roles.length ? moi.donnees.roles.join(', ') : 'Aucun rôle SHIKU'}
                </dd>
              </dl>
              <p className="note">
                Jeton vérifié par le backend. Cette identité n’accorde aucun droit métier : les
                droits sont décidés par le serveur, action par action (matrice provisoire).
              </p>
            </>
          )}
          {moi.etat === 'erreur' && (
            <ErrorState
              titre="Identité non confirmée"
              message={moi.message}
              onRetry={moi.recharger}
            />
          )}
        </Card>

        <Card titre="Modules">
          <ul className="liste-simple">
            {entreesVisibles(roles, droits.etat === 'pret' ? droits.peut : undefined).map((e) => (
              <li key={e.chemin}>
                <Link to={e.chemin}>{e.libelle}</Link>{' '}
                {e.implemente ? (
                  <Badge ton="ok">API disponible</Badge>
                ) : (
                  <Badge ton="attention">API absente</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
