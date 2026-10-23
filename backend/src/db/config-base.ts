/**
 * Lit et valide l'URL de la base AU DÉMARRAGE (T0-10) : l'application refuse de démarrer, avec un
 * message clair, plutôt que d'échouer plus tard à la première requête. Ne reproduit jamais l'URL
 * (elle contient un mot de passe) dans le message d'erreur.
 */
export class ConfigurationBaseInvalideError extends Error {
  constructor(message: string) {
    super(`Configuration de la base invalide : ${message}`);
    this.name = 'ConfigurationBaseInvalideError';
  }
}

export function lireUrlBase(env: NodeJS.ProcessEnv = process.env): string {
  const brute = env.DATABASE_URL?.trim();
  if (!brute)
    throw new ConfigurationBaseInvalideError(
      'DATABASE_URL est absente ou vide (voir .env.example et docs/dev/ENV-LOCAL.md).',
    );
  let url: URL;
  try {
    url = new URL(brute);
  } catch {
    throw new ConfigurationBaseInvalideError('DATABASE_URL n’est pas une URL valide.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:')
    throw new ConfigurationBaseInvalideError('DATABASE_URL doit commencer par postgres://.');
  if (!url.hostname) throw new ConfigurationBaseInvalideError('DATABASE_URL : hôte manquant.');
  if (!url.username) throw new ConfigurationBaseInvalideError('DATABASE_URL : rôle manquant.');
  if (url.pathname.length <= 1)
    throw new ConfigurationBaseInvalideError('DATABASE_URL : nom de base manquant.');
  return brute;
}
