import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Badge, Card } from '../components/Card';
import { NAVIGATION } from '../navigation';

/**
 * Écran d'un module dont l'API n'existe pas encore. Aucune donnée n'est affichée ni simulée :
 * la page dit ce qui manque, pour que l'écart reste visible.
 */
export function ModulePage() {
  const { pathname } = useLocation();
  const { roles } = useAuth();
  const entree = NAVIGATION.find((e) => e.chemin === pathname);
  if (!entree) return <Navigate to="/introuvable" replace />;
  const masque = entree.roles && !entree.roles.some((r) => roles.includes(r));

  return (
    <>
      <h1>{entree.libelle}</h1>
      <p className="lead">{entree.resume}</p>
      {masque && (
        <div className="alerte alerte--info" role="note">
          Cette entrée est normalement masquée pour votre rôle. Le menu n’est qu’une aide : tant que
          le backend ne contrôle pas les droits, ce masquage n’est pas une protection.
        </div>
      )}
      <Card titre="État du module">
        <p>
          <Badge ton="attention">API non disponible</Badge> Le backend n’expose pas encore les
          routes nécessaires à cet écran. Aucune donnée n’est affichée, aucune donnée de
          démonstration n’est utilisée.
        </p>
        <dl className="definitions">
          <dt>Exigences</dt>
          <dd>{entree.exigences.join(', ')}</dd>
          <dt>Stories du backlog</dt>
          <dd>{entree.stories.join(', ')}</dd>
          <dt>API à créer (proposition, non contractuelle)</dt>
          <dd>
            <ul>
              {entree.api.map((a) => (
                <li key={a}>
                  <code>{a}</code>
                </li>
              ))}
            </ul>
          </dd>
        </dl>
      </Card>
    </>
  );
}
