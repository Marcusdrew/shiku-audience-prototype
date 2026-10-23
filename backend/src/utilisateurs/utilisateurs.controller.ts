import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { pagination, Valideur } from '../common/validation.js';
import { PG_POOL } from '../db/db.module.js';
import { enTransaction } from '../db/transaction.js';
import { ExigeDroit } from '../habilitation/acces.decorators.js';
import {
  KEYCLOAK_ADMIN,
  KeycloakConflitError,
  type KeycloakAdminService,
  KeycloakIndisponibleError,
} from '../keycloak/keycloak-admin.service.js';
import { ROLES, ROLES_ATTRIBUABLES_PAR_ADMINISTRATEUR } from '../habilitation/roles.js';
import { JournalService } from '../journal/journal.service.js';
import { type Contexte, ContexteCourant } from './contexte.js';

const COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Gestion des comptes : acte d'administration explicite, jamais automatique (H6). Le droit de
 * l'Administrateur est vérifié ICI avec son propre jeton ; ensuite seulement le compte de service
 * appelle Keycloak (il ne sert à rien d'autre et ne se connecte jamais). Le journal garde
 * l'Administrateur comme auteur. Le premier administrateur est posé par scripts/amorcer-donnees-test.mjs.
 */
@Controller('utilisateurs')
export class UtilisateursController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly journal: JournalService,
    @Inject(KEYCLOAK_ADMIN) private readonly keycloak: KeycloakAdminService,
  ) {}

  @Get()
  @ExigeDroit('utilisateur.administrer')
  async lister(@ContexteCourant() ctx: Contexte, @Query() q: Record<string, unknown>) {
    const { limite, decalage } = pagination(q);
    const { rows } = await this.pool.query(
      `SELECT id, nom_complet, actif, cree_le FROM utilisateur
        WHERE organisation_id = $1 ORDER BY nom_complet LIMIT $2 OFFSET $3`,
      [ctx.organisationId, limite, decalage],
    );
    return { elements: rows, limite, decalage };
  }

  /** Traduit les pannes Keycloak sans exposer de détail interne. */
  private traduire(e: unknown): never {
    if (e instanceof KeycloakConflitError) throw new ConflictException(e.message);
    if (e instanceof KeycloakIndisponibleError)
      throw new ServiceUnavailableException('Gestion des comptes indisponible (Keycloak).');
    throw e;
  }

  /**
   * Crée la personne dans Keycloak (compte de service) PUIS la rattache à l'organisation, dans cet
   * ordre. Si l'enregistrement local échoue, le compte Keycloak créé est retiré (pas d'orphelin).
   * Le rôle attribué est un rôle grossier du jeton ; la base reste la source de vérité des droits.
   */
  @Post()
  @ExigeDroit('utilisateur.administrer')
  async creer(@ContexteCourant() ctx: Contexte, @Body() corps: unknown) {
    const v = new Valideur(corps);
    const prenom = v.texte('prenom', { requis: true, max: 100 });
    const nom = v.texte('nom', { requis: true, max: 100 });
    const courriel = v.texte('courriel', { requis: true, max: 200 });
    const role = v.enumeration('role', ROLES, true);
    if (courriel !== null && !COURRIEL.test(courriel))
      v.erreur('courriel', 'Adresse de courriel invalide.');
    v.fin();
    // Liste blanche (arbitrage du 19/10/2026, point 2), vérifiée AVANT tout appel à Keycloak.
    if (!(ROLES_ATTRIBUABLES_PAR_ADMINISTRATEUR as readonly string[]).includes(role!))
      throw new ForbiddenException(
        'Rôle non attribuable par l’Administrateur : seuls Réception et Assistant le sont. ' +
          'Autorité et Administrateur passent par l’autorisation de l’Autorité.',
      );
    const nomComplet = `${prenom!} ${nom!}`;
    let sub: string;
    try {
      sub = await this.keycloak.creerUtilisateur({
        courriel: courriel!.toLowerCase(),
        prenom: prenom!,
        nom: nom!,
        role: role!,
      });
    } catch (e) {
      return this.traduire(e);
    }
    try {
      return await this.rattacher(ctx, sub, nomComplet, { mode: 'creation', role: role! });
    } catch (e) {
      await this.keycloak.supprimer(sub);
      throw e;
    }
  }

  /**
   * Rattache à l'organisation un compte Keycloak DÉJÀ existant. Le `sub` est vérifié auprès de
   * Keycloak : un identifiant inventé est refusé (US-05-002). Aucune auto-attribution.
   */
  @Post('rattachement')
  @ExigeDroit('utilisateur.administrer')
  async rattachement(@ContexteCourant() ctx: Contexte, @Body() corps: unknown) {
    const v = new Valideur(corps);
    const sub = v.texte('keycloak_sub', { requis: true, max: 200 });
    const nom = v.texte('nom_complet', { requis: true, max: 200 });
    v.fin();
    if (sub === ctx.identite.sub)
      throw new ConflictException('Un administrateur ne peut pas se rattacher lui-même.');
    let existe: boolean;
    try {
      existe = await this.keycloak.existe(sub!);
    } catch (e) {
      return this.traduire(e);
    }
    if (!existe)
      throw new UnprocessableEntityException(
        'Aucun compte Keycloak ne correspond à cet identifiant.',
      );
    return this.rattacher(ctx, sub!, nom!, { mode: 'rattachement' });
  }

  private rattacher(
    ctx: Contexte,
    sub: string,
    nomComplet: string,
    contexte: { mode: 'creation' | 'rattachement'; role?: string },
  ) {
    return enTransaction(this.pool, async (c) => {
      let id: string;
      try {
        const r = await c.query<{ id: string }>(
          `INSERT INTO utilisateur (organisation_id, keycloak_sub, nom_complet)
           VALUES ($1, $2, $3) RETURNING id`,
          [ctx.organisationId, sub, nomComplet],
        );
        id = r.rows[0]!.id;
      } catch (e) {
        if ((e as { code?: string }).code === '23505')
          throw new ConflictException('Ce compte Keycloak est déjà rattaché.');
        throw e;
      }
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId, // l'Administrateur, jamais le compte de service
        action: contexte.mode === 'creation' ? 'utilisateur.creer' : 'utilisateur.rattacher',
        objetType: 'utilisateur',
        objetId: id,
        contexte: { nom_complet: nomComplet, ...contexte, via: 'compte de service' },
      });
      return { id, nom_complet: nomComplet, actif: true };
    });
  }
}
