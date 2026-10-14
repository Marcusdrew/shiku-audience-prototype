import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';

export function LoginPage() {
  const { etat, erreur, connecter } = useAuth();
  const lieu = useLocation();
  const retour = (lieu.state as { retour?: string } | null)?.retour ?? '/';

  if (etat === 'chargement') return <Spinner plein libelle="Vérification de la session…" />;
  if (etat === 'connecte') return <Navigate to={retour} replace />;

  return (
    <main className="connexion">
      <h1>SHIKU Audience</h1>
      <p>Gestion des audiences et du protocole. Connexion par compte nominatif.</p>
      {erreur && <ErrorState titre="Connexion" message={erreur} />}
      <button type="button" className="bouton" onClick={() => void connecter(retour)}>
        Se connecter
      </button>
    </main>
  );
}
