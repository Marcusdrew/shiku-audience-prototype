import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import { Spinner } from '../components/Spinner';

/**
 * Garde de navigation (confort d'usage). Ce n'est PAS une protection : toute donnée servie par
 * l'API devra être refusée par le backend si le droit manque (CONTRIBUTING § 4.1).
 */
export function RequireAuth() {
  const { etat } = useAuth();
  const lieu = useLocation();
  if (etat === 'chargement') return <Spinner libelle="Vérification de la session…" plein />;
  if (etat === 'deconnecte') {
    return <Navigate to="/connexion" replace state={{ retour: lieu.pathname + lieu.search }} />;
  }
  return <Outlet />;
}
