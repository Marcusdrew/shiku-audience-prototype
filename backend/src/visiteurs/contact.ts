// Contact d'un visiteur : forme attendue et masquage (réponses de M. Jordan du 22/10/2026, DEC-36).
// La comparaison des doublons se fait dans la base, sur la clé normalisée (`shiku_cle_contact`) :
// ce module ne sert qu'à valider la saisie et à masquer l'affichage.

const COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type GenreContact = 'courriel' | 'telephone';

/** Courriel, ou téléphone d'au moins 6 chiffres (espaces, +, points, tirets et parenthèses admis). */
export function genreContact(c: string): GenreContact | null {
  if (c.includes('@')) return COURRIEL.test(c) ? 'courriel' : null;
  if (!/^[0-9+().\s-]+$/.test(c)) return null;
  return c.replace(/\D/g, '').length >= 6 ? 'telephone' : null;
}

/**
 * Masquage pour un profil qui ne doit pas voir le contact (la Réception) :
 * courriel `j***@g***.com` ; téléphone : les deux derniers chiffres seulement.
 */
export function masquerContact(c: string | null): string | null {
  if (c === null || c.trim() === '') return null;
  const t = c.trim();
  const at = t.lastIndexOf('@');
  if (at > 0) {
    const local = t.slice(0, at);
    const domaine = t.slice(at + 1);
    const point = domaine.lastIndexOf('.');
    const debutDomaine = domaine.slice(0, 1);
    const extension = point > 0 ? domaine.slice(point) : '';
    return `${local.slice(0, 1)}***@${debutDomaine}***${extension}`;
  }
  const chiffres = t.replace(/\D/g, '');
  return chiffres.length >= 2 ? `***${chiffres.slice(-2)}` : '***';
}
