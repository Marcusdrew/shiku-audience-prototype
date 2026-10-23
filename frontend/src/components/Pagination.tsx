/**
 * Pagination par décalage, alignée sur les paramètres `limite` et `decalage` des routes de liste.
 * Sans total connu (journal), la page suivante est proposée tant qu'une page est pleine.
 */
export function Pagination({
  decalage,
  taille,
  affiches,
  total,
  onChanger,
}: {
  decalage: number;
  taille: number;
  affiches: number;
  total?: number;
  onChanger: (decalage: number) => void;
}) {
  const suivante = total !== undefined ? decalage + affiches < total : affiches === taille;
  if (decalage === 0 && !suivante) return null;
  return (
    <nav className="actions" aria-label="Pagination">
      <button
        type="button"
        className="bouton bouton--secondaire"
        disabled={decalage === 0}
        onClick={() => onChanger(Math.max(0, decalage - taille))}
      >
        Page précédente
      </button>
      <span className="note">
        {affiches === 0 ? 'Aucun élément' : `Éléments ${decalage + 1} à ${decalage + affiches}`}
        {total !== undefined ? ` sur ${total}` : ''}
      </span>
      <button
        type="button"
        className="bouton bouton--secondaire"
        disabled={!suivante}
        onClick={() => onChanger(decalage + taille)}
      >
        Page suivante
      </button>
    </nav>
  );
}
