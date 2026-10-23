import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { LIBELLES_ROLES } from '../auth/roles';
import { useDroits } from '../auth/DroitsContext';
import { entreesVisibles } from '../navigation';

export function AppShell() {
  const { nom, identifiant, roles, deconnecter } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const { peut, etat } = useDroits();
  const entrees = entreesVisibles(roles, etat === 'pret' ? peut : undefined);
  const fermer = () => setOuvert(false);

  return (
    <div className="shell">
      <a className="lien-evitement" href="#contenu">
        Aller au contenu
      </a>
      <header className="entete">
        <button
          type="button"
          className="bouton bouton--icone menu-bouton"
          aria-expanded={ouvert}
          aria-controls="navigation"
          onClick={() => setOuvert((o) => !o)}
        >
          Menu
        </button>
        <span className="entete__marque">SHIKU Audience</span>
        <div className="entete__session">
          <span className="entete__nom">{nom ?? identifiant ?? 'Utilisateur'}</span>
          {roles.length > 0 && (
            <span className="entete__roles">{roles.map((r) => LIBELLES_ROLES[r]).join(', ')}</span>
          )}
          <button
            type="button"
            className="bouton bouton--secondaire"
            onClick={() => void deconnecter()}
          >
            Se déconnecter
          </button>
        </div>
      </header>
      <nav
        id="navigation"
        className={ouvert ? 'nav nav--ouverte' : 'nav'}
        aria-label="Navigation principale"
      >
        <NavLink to="/" end onClick={fermer}>
          Tableau de bord
        </NavLink>
        {entrees.map((e) => (
          <NavLink key={e.chemin} to={e.chemin} onClick={fermer}>
            {e.libelle}
          </NavLink>
        ))}
      </nav>
      <main id="contenu" className="contenu">
        <Outlet />
      </main>
    </div>
  );
}
