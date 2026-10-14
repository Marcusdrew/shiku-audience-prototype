import type { ReactNode } from 'react';

export function Card({
  titre,
  children,
  pied,
}: {
  titre: string;
  children: ReactNode;
  pied?: ReactNode;
}) {
  return (
    <section className="carte" aria-label={titre}>
      <h2 className="carte__titre">{titre}</h2>
      <div className="carte__corps">{children}</div>
      {pied && <div className="carte__pied">{pied}</div>}
    </section>
  );
}

export type Ton = 'ok' | 'erreur' | 'neutre' | 'attention';

/** Le statut est toujours dit en texte : la couleur ne porte jamais seule l'information (ENF03-09). */
export function Badge({ ton, children }: { ton: Ton; children: ReactNode }) {
  return <span className={`badge badge--${ton}`}>{children}</span>;
}
