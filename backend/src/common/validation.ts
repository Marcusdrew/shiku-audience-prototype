import { BadRequestException } from '@nestjs/common';

export interface ErreurChamp {
  champ: string;
  message: string;
}

/** 400 avec la liste des champs invalides. Aucun détail interne n'est exposé. */
export class ErreurValidation extends BadRequestException {
  constructor(erreurs: ErreurChamp[]) {
    super({ message: 'Données invalides.', erreurs });
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const estUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

interface OptionsTexte {
  requis?: boolean;
  max?: number;
}

/**
 * Valideur de corps JSON sans dépendance : accumule les erreurs, refuse les champs inconnus.
 * Les valeurs vides ("" ou espaces) d'un champ facultatif sont traitées comme absentes (null).
 */
export class Valideur {
  private readonly erreurs: ErreurChamp[] = [];
  private readonly vus = new Set<string>();
  private readonly corps: Record<string, unknown>;

  constructor(corps: unknown) {
    if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
      this.erreurs.push({ champ: '(corps)', message: 'Un objet JSON est attendu.' });
      this.corps = {};
    } else this.corps = corps as Record<string, unknown>;
  }

  private brut(champ: string): unknown {
    this.vus.add(champ);
    return this.corps[champ];
  }

  a(champ: string): boolean {
    return champ in this.corps && this.corps[champ] !== undefined;
  }

  texte(champ: string, { requis = false, max = 2000 }: OptionsTexte = {}): string | null {
    const v = this.brut(champ);
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      if (requis) this.erreurs.push({ champ, message: 'Champ obligatoire.' });
      return null;
    }
    if (typeof v !== 'string') {
      this.erreurs.push({ champ, message: 'Texte attendu.' });
      return null;
    }
    const t = v.trim();
    if (t.length > max) {
      this.erreurs.push({ champ, message: `Au plus ${max} caractères.` });
      return null;
    }
    return t;
  }

  uuid(champ: string, requis = false): string | null {
    const v = this.brut(champ);
    if (v === undefined || v === null) {
      if (requis) this.erreurs.push({ champ, message: 'Champ obligatoire.' });
      return null;
    }
    if (!estUuid(v)) {
      this.erreurs.push({ champ, message: 'Identifiant invalide.' });
      return null;
    }
    return v;
  }

  entier(champ: string, min: number, max: number, requis = false): number | null {
    const v = this.brut(champ);
    if (v === undefined || v === null) {
      if (requis) this.erreurs.push({ champ, message: 'Champ obligatoire.' });
      return null;
    }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      this.erreurs.push({ champ, message: `Entier entre ${min} et ${max} attendu.` });
      return null;
    }
    return v;
  }

  /** Date-heure ISO 8601 AVEC fuseau (Z ou ±hh:mm), pour éviter toute ambiguïté. */
  dateHeure(champ: string, requis = false): Date | null {
    const v = this.brut(champ);
    if (v === undefined || v === null) {
      if (requis) this.erreurs.push({ champ, message: 'Champ obligatoire.' });
      return null;
    }
    const ok =
      typeof v === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v) &&
      !Number.isNaN(Date.parse(v));
    if (!ok) {
      this.erreurs.push({ champ, message: 'Date-heure ISO 8601 avec fuseau attendue.' });
      return null;
    }
    return new Date(v);
  }

  enumeration<T extends string>(champ: string, valeurs: readonly T[], requis = false): T | null {
    const v = this.brut(champ);
    if (v === undefined || v === null) {
      if (requis) this.erreurs.push({ champ, message: 'Champ obligatoire.' });
      return null;
    }
    if (typeof v !== 'string' || !(valeurs as readonly string[]).includes(v)) {
      this.erreurs.push({ champ, message: `Valeur attendue : ${valeurs.join(', ')}.` });
      return null;
    }
    return v as T;
  }

  booleen(champ: string): boolean {
    const v = this.brut(champ);
    if (v === undefined || v === null) return false;
    if (typeof v !== 'boolean') {
      this.erreurs.push({ champ, message: 'Booléen attendu (true ou false).' });
      return false;
    }
    return v;
  }

  erreur(champ: string, message: string): void {
    this.erreurs.push({ champ, message });
  }

  /** À appeler en dernier : refuse les champs non prévus, puis lève ErreurValidation s'il y a lieu. */
  fin(): void {
    for (const k of Object.keys(this.corps))
      if (!this.vus.has(k)) this.erreurs.push({ champ: k, message: 'Champ non autorisé.' });
    if (this.erreurs.length) throw new ErreurValidation(this.erreurs);
  }
}

/** Paramètres de pagination de requête (chaînes) → bornes sûres. */
export function pagination(q: Record<string, unknown>): { limite: number; decalage: number } {
  const n = (v: unknown, def: number, min: number, max: number) => {
    if (v === undefined || v === '') return def;
    const x = Number(v);
    if (!Number.isInteger(x) || x < min || x > max)
      throw new ErreurValidation([
        { champ: 'pagination', message: `Valeur entre ${min} et ${max}.` },
      ]);
    return x;
  };
  return { limite: n(q.limite, 50, 1, 200), decalage: n(q.decalage, 0, 0, 1_000_000) };
}

export function exigerUuidParam(champ: string, v: string): string {
  if (!estUuid(v)) throw new ErreurValidation([{ champ, message: 'Identifiant invalide.' }]);
  return v;
}
