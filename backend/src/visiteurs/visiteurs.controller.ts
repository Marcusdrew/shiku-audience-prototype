import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { pagination, Valideur } from '../common/validation.js';
import { PG_POOL } from '../db/db.module.js';
import { enTransaction } from '../db/transaction.js';
import { ExigeDroit } from '../habilitation/acces.decorators.js';
import { HabilitationService } from '../habilitation/habilitation.service.js';
import { JournalService } from '../journal/journal.service.js';
import { type Contexte, ContexteCourant } from '../utilisateurs/contexte.js';
import { genreContact, masquerContact } from './contact.js';

/** Fiche complète : réservée aux profils qui qualifient et modifient (Assistant, Autorité). */
export interface VisiteurComplet {
  id: string;
  nom_complet: string;
  prenom: string | null;
  nom: string | null;
  contact: string | null;
  qualite: string | null;
}
/** Résultat minimal (Réception, et tout signalement de doublon) : nom et contact masqué. */
export interface VisiteurMinimal {
  id: string;
  nom_complet: string;
  contact_masque: string | null;
}

interface Ligne {
  id: string;
  nom_complet: string;
  prenom: string | null;
  nom: string | null;
  contact: string | null;
  qualite: string | null;
}

const COLONNES = 'id, nom_complet, prenom, nom, contact, qualite';
const MOTIFS_DOUBLON = ['homonyme_distinct'] as const;

const minimal = (l: Ligne): VisiteurMinimal => ({
  id: l.id,
  nom_complet: l.nom_complet,
  contact_masque: masquerContact(l.contact),
});
const complet = (l: Ligne): VisiteurComplet => ({
  id: l.id,
  nom_complet: l.nom_complet,
  prenom: l.prenom,
  nom: l.nom,
  contact: l.contact,
  qualite: l.qualite,
});

/**
 * Visiteurs : identité minimale (nom, prénom, un moyen de contact) et détection des doublons.
 *
 * Réponses de M. Jordan du 22/10/2026 (Q-12), règles provisoires HYPOTHESE(DEC-36) :
 * - la Réception reçoit un résultat minimal : nom et contact masqué, jamais le contact complet ni la
 *   qualification ; seuls les profils qui ont le droit `visiteur.modifier` voient la fiche complète ;
 * - un doublon est signalé, jamais fusionné : même contact normalisé → la création exige le motif
 *   « homonyme distinct » ; même nom normalisé → la création exige une confirmation. La comparaison
 *   se fait ici, côté serveur, sur les clés calculées par la base ;
 * - l'Assistant et l'Autorité modifient une fiche ; la Réception crée mais ne modifie pas.
 * Données restituées limitées à ce que la fonction exige (D03-12) : pas de dossier relationnel ici.
 */
@Controller('visiteurs')
export class VisiteursController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly journal: JournalService,
    private readonly habilitation: HabilitationService,
  ) {}

  private ficheComplete(ctx: Contexte): boolean {
    return this.habilitation.estAutorise(ctx.identite.roles, 'visiteur.modifier');
  }

  private presenter(ctx: Contexte, l: Ligne): VisiteurComplet | VisiteurMinimal {
    return this.ficheComplete(ctx) ? complet(l) : minimal(l);
  }

  @Get()
  @ExigeDroit('visiteur.rechercher')
  async rechercher(@ContexteCourant() ctx: Contexte, @Query() q: Record<string, unknown>) {
    const { limite, decalage } = pagination(q);
    const terme = typeof q.q === 'string' ? q.q.trim().slice(0, 100) : '';
    const { rows } = await this.pool.query<Ligne>(
      `SELECT ${COLONNES} FROM visiteur
        WHERE organisation_id = $1
          AND ($2 = '' OR nom_complet ILIKE '%' || $2 || '%'
               OR (shiku_cle_nom($3) IS NOT NULL AND cle_nom LIKE '%' || shiku_cle_nom($3) || '%'))
        ORDER BY lower(nom_complet) LIMIT $4 OFFSET $5`,
      [ctx.organisationId, terme.replace(/[%_\\]/g, (m) => `\\${m}`), terme, limite, decalage],
    );
    return { elements: rows.map((l) => this.presenter(ctx, l)), limite, decalage };
  }

  /**
   * Arbitrage du 19/10/2026 (DEC-19) : Réception, Assistant et Autorité créent un visiteur. La
   * qualification (champ `qualite`) reste à l'Assistant, ou à l'Autorité : contrôlé ici, côté serveur.
   */
  @Post()
  @ExigeDroit('visiteur.creer')
  async creer(@ContexteCourant() ctx: Contexte, @Body() corps: unknown) {
    const v = new Valideur(corps);
    const prenom = v.texte('prenom', { requis: true, max: 100 });
    const nom = v.texte('nom', { requis: true, max: 100 });
    const contact = v.texte('contact', { requis: true, max: 300 });
    const qualite = v.texte('qualite', { max: 200 });
    const confirmation = v.booleen('confirmer_homonyme');
    const motif = v.enumeration('motif_doublon', MOTIFS_DOUBLON);
    if (contact !== null && genreContact(contact) === null)
      v.erreur('contact', 'Courriel ou numéro de téléphone (au moins 6 chiffres) attendu.');
    if (qualite !== null && !this.ficheComplete(ctx))
      v.erreur(
        'qualite',
        'La qualification du visiteur est réservée à l’Assistant ou à l’Autorité.',
      );
    v.fin();
    const nomComplet = `${prenom} ${nom}`;

    return enTransaction(this.pool, async (c) => {
      const proches = await c.query<Ligne & { meme_contact: boolean }>(
        `SELECT ${COLONNES}, cle_contact = shiku_cle_contact($2) AS meme_contact
           FROM visiteur
          WHERE organisation_id = $1
            AND (cle_contact = shiku_cle_contact($2) OR cle_nom = shiku_cle_nom($3))
          ORDER BY meme_contact DESC, lower(nom_complet) LIMIT 10`,
        [ctx.organisationId, contact, nomComplet],
      );
      const memeContact = proches.rows.some((l) => l.meme_contact);
      const doublons = proches.rows.map(minimal);
      if (memeContact && motif !== 'homonyme_distinct')
        throw new ConflictException({
          message:
            'Un visiteur a déjà ce contact. Choisissez la fiche existante, ou confirmez qu’il ' +
            's’agit d’une autre personne (motif « homonyme distinct »).',
          code: 'doublon_contact',
          doublons,
        });
      if (proches.rows.length && !memeContact && !confirmation && motif === null)
        throw new ConflictException({
          message:
            'Un visiteur porte déjà ce nom. Vérifiez qu’il ne s’agit pas de la même personne, ' +
            'puis confirmez la création.',
          code: 'doublon_nom',
          doublons,
        });

      const { rows } = await c.query<Ligne>(
        `INSERT INTO visiteur (organisation_id, nom_complet, prenom, nom, contact, qualite, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLONNES}`,
        [ctx.organisationId, nomComplet, prenom, nom, contact, qualite, ctx.utilisateurId],
      );
      const cree = rows[0]!;
      // Identifiants et codes seulement : jamais l'identité ni le contact du visiteur.
      const contexte = proches.rows.length
        ? {
            doublon: memeContact ? 'contact' : 'nom',
            doublons_ids: proches.rows.map((l) => l.id),
            ...(memeContact ? { motif: 'homonyme_distinct' } : { confirmation: true }),
          }
        : undefined;
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'visiteur.creer',
        objetType: 'visiteur',
        objetId: cree.id,
        ...(contexte ? { contexte } : {}),
      });
      return this.presenter(ctx, cree);
    });
  }

  /**
   * Modification par l'Assistant ou l'Autorité (HYPOTHESE(DEC-36), « Modifier visiteur » ajouté à la
   * matrice par un acte à venir). Les champs modifiés sont journalisés par leur NOM : les valeurs avant
   * et après, demandées par M. Jordan, attendent la réponse à Q-5 (le journal ne contient que des
   * identifiants et l'action ; jamais l'identité du visiteur).
   */
  @Patch(':id')
  @ExigeDroit('visiteur.modifier')
  async modifier(
    @ContexteCourant() ctx: Contexte,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() corps: unknown,
  ) {
    const v = new Valideur(corps);
    const champs: Partial<Record<'prenom' | 'nom' | 'contact' | 'qualite', string | null>> = {};
    if (v.a('prenom')) champs.prenom = v.texte('prenom', { requis: true, max: 100 });
    if (v.a('nom')) champs.nom = v.texte('nom', { requis: true, max: 100 });
    if (v.a('contact')) {
      champs.contact = v.texte('contact', { requis: true, max: 300 });
      if (champs.contact && genreContact(champs.contact) === null)
        v.erreur('contact', 'Courriel ou numéro de téléphone (au moins 6 chiffres) attendu.');
    }
    if (v.a('qualite')) champs.qualite = v.texte('qualite', { max: 200 });
    if (!Object.keys(champs).length)
      v.erreur('(corps)', 'Aucun champ modifiable fourni (prenom, nom, contact, qualite).');
    v.fin();

    return enTransaction(this.pool, async (c) => {
      const cur = await c.query<Ligne>(
        `SELECT ${COLONNES} FROM visiteur WHERE id = $1 AND organisation_id = $2 FOR UPDATE`,
        [id, ctx.organisationId],
      );
      if (!cur.rows[0]) throw new NotFoundException('Visiteur introuvable.');
      const avant = cur.rows[0];
      const apres = { ...avant, ...champs };
      if ('prenom' in champs || 'nom' in champs) {
        // Une fiche antérieure n'a qu'un nom complet : le prénom et le nom sont alors exigés ensemble.
        if (apres.prenom === null || apres.nom === null)
          throw new ConflictException(
            'Cette fiche n’a qu’un nom complet : saisissez le prénom et le nom ensemble.',
          );
        apres.nom_complet = `${apres.prenom} ${apres.nom}`;
      }
      const modifies = (['prenom', 'nom', 'contact', 'qualite'] as const).filter(
        (k) => k in champs && apres[k] !== avant[k],
      );
      if (!modifies.length) return complet(avant);
      const { rows } = await c.query<Ligne>(
        `UPDATE visiteur
            SET prenom = $3, nom = $4, nom_complet = $5, contact = $6, qualite = $7,
                modifie_par = $8, modifie_le = now()
          WHERE id = $1 AND organisation_id = $2
          RETURNING ${COLONNES}`,
        [
          id,
          ctx.organisationId,
          apres.prenom,
          apres.nom,
          apres.nom_complet,
          apres.contact,
          apres.qualite,
          ctx.utilisateurId,
        ],
      );
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'visiteur.modifier',
        objetType: 'visiteur',
        objetId: id,
        contexte: { champs: modifies },
      });
      return complet(rows[0]!);
    });
  }
}
