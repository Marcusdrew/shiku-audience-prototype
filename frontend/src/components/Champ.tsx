import type { ReactNode } from 'react';

/** Étiquette + contrôle, reliés pour l'accessibilité. */
export function Champ({
  id,
  libelle,
  children,
}: {
  id: string;
  libelle: string;
  children: ReactNode;
}) {
  return (
    <div className="champ">
      <label htmlFor={id}>{libelle}</label>
      {children}
    </div>
  );
}
