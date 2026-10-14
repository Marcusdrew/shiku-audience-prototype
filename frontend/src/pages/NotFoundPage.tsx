import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <>
      <h1>Page introuvable</h1>
      <p>
        <Link to="/">Retour au tableau de bord</Link>
      </p>
    </>
  );
}
