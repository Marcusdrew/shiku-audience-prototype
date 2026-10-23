export function Spinner({
  libelle = 'Chargement…',
  plein = false,
}: {
  libelle?: string;
  plein?: boolean;
}) {
  return (
    <div className={plein ? 'spinner spinner--plein' : 'spinner'} role="status" aria-live="polite">
      <span className="spinner__rond" aria-hidden="true" />
      <span>{libelle}</span>
    </div>
  );
}
