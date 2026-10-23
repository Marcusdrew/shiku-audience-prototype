export function ErrorState({
  titre = 'Une erreur est survenue',
  message,
  onRetry,
}: {
  titre?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="alerte alerte--erreur" role="alert">
      <strong>{titre}</strong>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="bouton bouton--secondaire" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}
