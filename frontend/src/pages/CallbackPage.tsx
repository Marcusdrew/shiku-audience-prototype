import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import type { UserManager } from 'oidc-client-ts';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';

// Le code d'autorisation est à usage unique : en mode strict React, l'effet s'exécute deux fois.
// On mémorise donc la promesse par URL pour ne consommer le code qu'une seule fois.
const traitements = new Map<string, Promise<string>>();

function traiter(gestionnaire: UserManager, url: string): Promise<string> {
  let p = traitements.get(url);
  if (!p) {
    p = gestionnaire
      .signinCallback(url)
      .then((u) => (u?.state as { retour?: string } | undefined)?.retour ?? '/');
    traitements.set(url, p);
  }
  return p;
}

export function CallbackPage({ gestionnaire }: { gestionnaire: UserManager }) {
  const [cible, setCible] = useState<string | null>(null);
  const [echec, setEchec] = useState<string | null>(null);
  // Refus renvoyé par Keycloak dans l'URL de retour : lu au rendu, pas dans l'effet.
  const params = new URLSearchParams(window.location.search);
  const erreurKc = params.get('error_description') ?? params.get('error');
  const erreur = erreurKc ? `Keycloak a refusé la connexion : ${erreurKc}` : echec;

  useEffect(() => {
    let actif = true;
    if (new URLSearchParams(window.location.search).has('error')) return;
    traiter(gestionnaire, window.location.href)
      .then((retour) => actif && setCible(retour))
      .catch(
        (e: unknown) =>
          actif && setEchec(e instanceof Error ? e.message : 'Échec de la connexion.'),
      );
    return () => {
      actif = false;
    };
  }, [gestionnaire]);

  if (cible) return <Navigate to={cible} replace />;
  if (erreur) {
    return (
      <main className="connexion">
        <ErrorState titre="Échec de l’authentification" message={erreur} />
        <Link className="bouton" to="/connexion">
          Revenir à la connexion
        </Link>
      </main>
    );
  }
  return <Spinner plein libelle="Finalisation de la connexion…" />;
}
