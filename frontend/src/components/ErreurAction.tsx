export function ErreurAction({
  erreur,
}: {
  erreur: { message: string; details: string[] } | null;
}) {
  if (!erreur) return null;
  return (
    <div className="alerte alerte--erreur" role="alert">
      <strong>{erreur.message}</strong>
      {erreur.details.length > 0 && (
        <ul>
          {erreur.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
