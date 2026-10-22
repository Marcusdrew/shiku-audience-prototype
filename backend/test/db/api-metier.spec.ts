import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MODULES_METIER } from '../../src/app.module.js';
import { AuthModule } from '../../src/auth/auth.module.js';
import { DbModule } from '../../src/db/db.module.js';
import type { Matrice } from '../../src/habilitation/matrice.js';
import { SanteController } from '../../src/sante/sante.controller.js';
import { MUTATIONS_JOURNALISEES } from '../habilitation/mutations-journalisees.js';
import { demarrerFauxKeycloak, type FauxKeycloak, SECRET_ESSAI } from './faux-keycloak.js';
import { CLIENT, ISSUER, creerCles, revendications, signer } from '../auth/outils.js';

// Tests d'INTÉGRATION des API métier : vraie base PostgreSQL migrée (rôles + migrations), vrai
// serveur HTTP, jetons RS256 réellement signés (clés de test). Ne prouvent PAS le fonctionnement
// avec un vrai Keycloak : voir scripts/verifier-auth.mjs. Données fictives uniquement, dans une
// organisation créée pour ce test et nettoyée à la fin (par le superutilisateur, hors application).
// Prérequis : voir docs/dev/PREUVES-AJOUT-SEUL.md (pnpm test:db après init-local.sh et les migrations).

function exiger(nom: string): string {
  const v = process.env[nom];
  if (!v) throw new Error(`Variable ${nom} manquante : lancez "pnpm test:db" après init-local.sh.`);
  return v;
}
const hote = process.env.PGHOST ?? '127.0.0.1';
const port = Number(process.env.POSTGRES_PORT ?? 5432);
const base = process.env.POSTGRES_DB ?? 'shiku';
const MARQUE = `TEST-API-${randomUUID()}`;

// Réponses JSON de l'API : forme libre, vérifiée par les assertions de chaque test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corps = Record<string, any>;

type Role = 'reception' | 'assistant' | 'authority' | 'administrator';
interface Acteur {
  role: Role;
  sub: string;
  id: string;
}

async function demarrer(matrice?: Matrice) {
  const cles = await creerCles();
  @Module({
    imports: [
      DbModule,
      AuthModule.register({
        config: { issuer: ISSUER, jwksUrl: 'http://inutilise.invalid/certs', clientId: CLIENT },
        resolveurCles: cles.resolveur,
        ...(matrice ? { matrice } : {}),
      }),
      ...MODULES_METIER,
    ],
    controllers: [SanteController],
  })
  class ModuleEssai {}
  const app = await NestFactory.create(ModuleEssai, { logger: false });
  await app.listen(0, '127.0.0.1');
  return { app, url: await app.getUrl(), cles };
}

describe('API métier sur PostgreSQL réel', () => {
  let serveur: Awaited<ReturnType<typeof demarrer>>;
  let kc: FauxKeycloak;
  let admin: pg.Client; // superutilisateur : préparation et nettoyage UNIQUEMENT
  let appBase: pg.Client; // rôle applicatif : pour prouver ce que la base refuse
  let orgId: string;
  let autreOrgId: string;
  const acteurs = {} as Record<Role | 'autreOrg' | 'sansCompte' | 'inactif', Acteur>;

  async function creerActeur(
    cle: keyof typeof acteurs,
    role: Role,
    organisation: string,
    actif = true,
    avecCompte = true,
  ) {
    const sub = `${MARQUE}-${cle}`;
    let id = '';
    if (avecCompte) {
      const r = await admin.query<{ id: string }>(
        `INSERT INTO utilisateur (organisation_id, keycloak_sub, nom_complet, actif)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [organisation, sub, `Fictif ${cle}`, actif],
      );
      id = r.rows[0]!.id;
    }
    acteurs[cle] = { role, sub, id };
  }

  async function appel(
    qui: keyof typeof acteurs | null,
    methode: string,
    chemin: string,
    corps?: unknown,
    s = serveur,
  ) {
    const headers: Record<string, string> = {};
    if (qui) {
      const a = acteurs[qui];
      headers.Authorization = `Bearer ${await signer(s.cles, revendications([a.role]), { sub: a.sub })}`;
    }
    if (corps !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(`${s.url}${chemin}`, {
      method: methode,
      headers,
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    const texte = await r.text();
    return { statut: r.status, corps: texte ? (JSON.parse(texte) as Corps) : {} };
  }

  const compter = async (sql: string, params: unknown[] = []) =>
    Number((await admin.query<{ n: string }>(sql, params)).rows[0]!.n);

  let agendaId: string;
  let visiteurId: string;

  beforeAll(async () => {
    const dbApp = `postgres://shiku_app:${encodeURIComponent(exiger('DB_APP_PASSWORD'))}@${hote}:${port}/${base}`;
    process.env.DATABASE_URL = dbApp;
    admin = new pg.Client({
      host: hote,
      port,
      database: base,
      user: process.env.POSTGRES_SUPERUSER ?? 'postgres',
      password: exiger('POSTGRES_SUPERUSER_PASSWORD'),
    });
    await admin.connect();
    appBase = new pg.Client({ connectionString: dbApp });
    await appBase.connect();

    orgId = (
      await admin.query<{ id: string }>(`INSERT INTO organisation (nom) VALUES ($1) RETURNING id`, [
        `${MARQUE} (fictive)`,
      ])
    ).rows[0]!.id;
    autreOrgId = (
      await admin.query<{ id: string }>(`INSERT INTO organisation (nom) VALUES ($1) RETURNING id`, [
        `${MARQUE} autre (fictive)`,
      ])
    ).rows[0]!.id;
    await creerActeur('reception', 'reception', orgId);
    await creerActeur('assistant', 'assistant', orgId);
    await creerActeur('authority', 'authority', orgId);
    await creerActeur('administrator', 'administrator', orgId);
    await creerActeur('autreOrg', 'authority', autreOrgId);
    await creerActeur('inactif', 'assistant', orgId, false);
    await creerActeur('sansCompte', 'assistant', orgId, true, false);

    kc = await demarrerFauxKeycloak();
    Object.assign(process.env, {
      KEYCLOAK_ADMIN_URL: kc.url,
      KEYCLOAK_REALM: 'shiku',
      KEYCLOAK_SERVICE_CLIENT_ID: 'shiku-service',
      KEYCLOAK_SERVICE_CLIENT_SECRET: SECRET_ESSAI,
    });
    serveur = await demarrer();
  });

  afterAll(async () => {
    await serveur?.app.close();
    await kc?.fermer();
    // Nettoyage hors application (le rôle applicatif n'a pas DELETE, par conception).
    if (admin) {
      // Nettoyage des données d'essai par le superutilisateur : les déclencheurs (dont le refus de
      // purge avant 6 ans) sont désactivés pour cette SESSION seulement. Ce n'est PAS un chemin applicatif.
      await admin.query('SET session_replication_role = replica').catch(() => undefined);
      for (const o of [orgId, autreOrgId].filter(Boolean)) {
        for (const t of [
          'journal',
          'audience',
          'decision',
          'demande',
          'compteur_reference',
          'visiteur',
          'agenda',
          'utilisateur',
        ])
          await admin
            .query(`DELETE FROM ${t} WHERE organisation_id = $1`, [o])
            .catch(() => undefined);
        await admin.query(`DELETE FROM organisation WHERE id = $1`, [o]).catch(() => undefined);
      }
      await admin.end();
    }
    await appBase?.end();
  });

  describe('compte applicatif : l’identité ne vaut pas droit métier', () => {
    it('un jeton valide sans compte applicatif ne peut rien faire et /moi ne crée aucun compte', async () => {
      const avant = await compter(`SELECT count(*) n FROM utilisateur WHERE organisation_id=$1`, [
        orgId,
      ]);
      const r = await appel('sansCompte', 'GET', '/agendas');
      expect(r.statut).toBe(403);
      expect(r.corps.message).toBe('Aucun compte applicatif actif.');
      const moi = await appel('sansCompte', 'GET', '/moi');
      expect(moi.statut).toBe(200);
      expect(
        await compter(`SELECT count(*) n FROM utilisateur WHERE organisation_id=$1`, [orgId]),
      ).toBe(avant);
      expect(
        await compter(`SELECT count(*) n FROM utilisateur WHERE keycloak_sub=$1`, [
          acteurs.sansCompte.sub,
        ]),
      ).toBe(0);
    });
    it('un compte désactivé est refusé', async () => {
      expect((await appel('inactif', 'GET', '/agendas')).statut).toBe(403);
    });
    it('sans jeton : 401, avec jeton mais sans droit : 403', async () => {
      expect((await appel(null, 'GET', '/demandes')).statut).toBe(401);
      expect((await appel('reception', 'GET', '/journal')).statut).toBe(403);
    });
  });

  describe('administration : comptes et agendas', () => {
    it('l’administrateur crée un agenda ; la réception ne le peut pas ; doublon = 409', async () => {
      expect((await appel('reception', 'POST', '/agendas', { nom: 'X' })).statut).toBe(403);
      const r = await appel('administrator', 'POST', '/agendas', { nom: `Agenda ${MARQUE}` });
      expect(r.statut).toBe(201);
      agendaId = r.corps.id;
      expect(
        (await appel('administrator', 'POST', '/agendas', { nom: `Agenda ${MARQUE}` })).statut,
      ).toBe(409);
      const liste = await appel('reception', 'GET', '/agendas');
      expect(liste.statut).toBe(200);
      expect(liste.corps.elements.map((a: { id: string }) => a.id)).toContain(agendaId);
    });
    describe('comptes : compte de service Keycloak (décision de M. Jordan, 16/10/2026)', () => {
      const valide = (courriel: string) => ({
        prenom: 'Fictive',
        nom: 'Personne',
        courriel,
        role: 'assistant',
      });

      it('l’Administrateur crée un compte : Keycloak d’abord (compte de service), puis rattachement ; journalisé à son nom', async () => {
        const avant = kc.appels.length;
        const r = await appel('administrator', 'POST', '/utilisateurs', valide('a1@example.test'));
        expect(r.statut).toBe(201);
        expect(r.corps.nom_complet).toBe('Fictive Personne');
        const ligne = await admin.query(
          `SELECT keycloak_sub FROM utilisateur WHERE id=$1 AND organisation_id=$2`,
          [r.corps.id, orgId],
        );
        const sub = ligne.rows[0]!.keycloak_sub as string;
        expect(kc.utilisateurs.get(sub)).toEqual({
          courriel: 'a1@example.test',
          roles: ['assistant'],
        });
        // Les appels Keycloak portent le jeton du COMPTE DE SERVICE, jamais celui de l'Administrateur.
        const nouveaux = kc.appels.slice(avant).filter((a) => a.chemin.startsWith('/admin/'));
        expect(nouveaux.length).toBeGreaterThan(0);
        for (const a of nouveaux) expect(kc.jetonsEmis.has(a.autorisation!.slice(7))).toBe(true);
        const j = await admin.query(
          `SELECT utilisateur_id, contexte FROM journal WHERE objet_id=$1 AND action='utilisateur.creer'`,
          [r.corps.id],
        );
        expect(j.rowCount).toBe(1);
        expect(j.rows[0]!.utilisateur_id).toBe(acteurs.administrator.id);
        expect(j.rows[0]!.contexte).toEqual({
          nom_complet: 'Fictive Personne',
          mode: 'creation',
          role: 'assistant',
          via: 'compte de service',
        });
        // Le courriel (donnée personnelle) n'est pas recopié dans le journal.
        expect(JSON.stringify(j.rows[0]!.contexte)).not.toContain('example.test');
      });

      it('seul l’Administrateur peut créer un compte ; sinon 403 et Keycloak n’est même pas appelé', async () => {
        const avant = kc.appels.length;
        for (const q of ['reception', 'assistant', 'authority'] as const)
          expect((await appel(q, 'POST', '/utilisateurs', valide('x@example.test'))).statut).toBe(
            403,
          );
        expect(kc.appels.length).toBe(avant);
      });

      it('liste blanche (arbitrage du 19/10) : Autorité et Administrateur refusés (403) avant tout appel Keycloak ; Réception acceptée', async () => {
        const avant = kc.appels.length;
        for (const role of ['authority', 'administrator']) {
          const r = await appel('administrator', 'POST', '/utilisateurs', {
            ...valide(`${role}@example.test`),
            role,
          });
          expect(r.statut, role).toBe(403);
        }
        expect(kc.appels.length).toBe(avant);
        const ok = await appel('administrator', 'POST', '/utilisateurs', {
          ...valide('rec@example.test'),
          role: 'reception',
        });
        expect(ok.statut).toBe(201);
      });

      it('valide les entrées : rôle inconnu, courriel invalide, champ en trop (anti mass-assignment)', async () => {
        const avant = kc.appels.length;
        const mauvais = [
          { ...valide('b@example.test'), role: 'protocole' },
          { ...valide('pas-un-courriel') },
          { ...valide('c@example.test'), actif: false },
          { ...valide('d@example.test'), keycloak_sub: 'impose' },
          { prenom: '', nom: 'X', courriel: 'e@example.test', role: 'assistant' },
        ];
        for (const c of mauvais)
          expect((await appel('administrator', 'POST', '/utilisateurs', c)).statut).toBe(400);
        expect(kc.appels.length).toBe(avant);
      });

      it('un courriel déjà utilisé dans Keycloak : 409, rien n’est créé en base', async () => {
        const n = await compter(`SELECT count(*) n FROM utilisateur WHERE organisation_id=$1`, [
          orgId,
        ]);
        const r = await appel('administrator', 'POST', '/utilisateurs', valide('a1@example.test'));
        expect(r.statut).toBe(409);
        expect(
          await compter(`SELECT count(*) n FROM utilisateur WHERE organisation_id=$1`, [orgId]),
        ).toBe(n);
      });

      it('si l’enregistrement local échoue, le compte Keycloak créé est retiré (pas d’orphelin)', async () => {
        kc.prochainSub = acteurs.reception.sub; // déjà rattaché : la base refuse (unicité)
        const r = await appel(
          'administrator',
          'POST',
          '/utilisateurs',
          valide('orphelin@example.test'),
        );
        expect(r.statut).toBe(409);
        expect(
          [...kc.utilisateurs.values()].some((u) => u.courriel === 'orphelin@example.test'),
        ).toBe(false);
      });

      it('Keycloak en panne : 503 sans détail interne et rien en base', async () => {
        kc.indisponible = true;
        try {
          const n = await compter(`SELECT count(*) n FROM utilisateur WHERE organisation_id=$1`, [
            orgId,
          ]);
          const r = await appel('administrator', 'POST', '/utilisateurs', valide('p@example.test'));
          expect(r.statut).toBe(503);
          expect(JSON.stringify(r.corps)).not.toMatch(/panne simulée|127\.0\.0\.1/);
          expect(
            await compter(`SELECT count(*) n FROM utilisateur WHERE organisation_id=$1`, [orgId]),
          ).toBe(n);
        } finally {
          kc.indisponible = false;
        }
      });

      it('compte de service non configuré : 503 (échec fermé), pas de repli sur une autre identité', async () => {
        const sauve = process.env.KEYCLOAK_SERVICE_CLIENT_SECRET;
        delete process.env.KEYCLOAK_SERVICE_CLIENT_SECRET;
        const s2 = await demarrer();
        try {
          const r = await appel(
            'administrator',
            'POST',
            '/utilisateurs',
            valide('n@example.test'),
            s2,
          );
          expect(r.statut).toBe(503);
        } finally {
          process.env.KEYCLOAK_SERVICE_CLIENT_SECRET = sauve;
          await s2.app.close();
        }
      });

      it('mauvais secret du compte de service : refusé par Keycloak, donc 503', async () => {
        const sauve = process.env.KEYCLOAK_SERVICE_CLIENT_SECRET;
        process.env.KEYCLOAK_SERVICE_CLIENT_SECRET = 'mauvais';
        const s2 = await demarrer();
        try {
          const r = await appel(
            'administrator',
            'POST',
            '/utilisateurs',
            valide('m@example.test'),
            s2,
          );
          expect(r.statut).toBe(503);
        } finally {
          process.env.KEYCLOAK_SERVICE_CLIENT_SECRET = sauve;
          await s2.app.close();
        }
      });

      it('rattachement : le sub doit exister dans Keycloak ; inconnu = 422 ; doublon = 409 ; jamais soi-même', async () => {
        const sub = randomUUID();
        kc.utilisateurs.set(sub, { courriel: 'existant@example.test', roles: ['assistant'] });
        const inconnu = await appel('administrator', 'POST', '/utilisateurs/rattachement', {
          keycloak_sub: randomUUID(),
          nom_complet: 'Inventé Fictif',
        });
        expect(inconnu.statut).toBe(422);
        const ok = await appel('administrator', 'POST', '/utilisateurs/rattachement', {
          keycloak_sub: sub,
          nom_complet: 'Existant Fictif',
        });
        expect(ok.statut).toBe(201);
        expect(
          (
            await appel('administrator', 'POST', '/utilisateurs/rattachement', {
              keycloak_sub: sub,
              nom_complet: 'Doublon',
            })
          ).statut,
        ).toBe(409);
        const soi = await appel('administrator', 'POST', '/utilisateurs/rattachement', {
          keycloak_sub: acteurs.administrator.sub,
          nom_complet: 'Moi-même',
        });
        expect(soi.statut).toBe(409);
        expect(
          (
            await appel('assistant', 'POST', '/utilisateurs/rattachement', {
              keycloak_sub: sub,
              nom_complet: 'y',
            })
          ).statut,
        ).toBe(403);
        expect(
          await compter(
            `SELECT count(*) n FROM journal WHERE objet_id=$1 AND action='utilisateur.rattacher'`,
            [ok.corps.id],
          ),
        ).toBe(1);
      });

      it('la base refuse un nom vide même si l’API était contournée (contrainte, lot 2)', async () => {
        await expect(
          appBase.query(
            `INSERT INTO utilisateur (organisation_id, keycloak_sub, nom_complet) VALUES ($1,$2,'  ')`,
            [orgId, `${MARQUE}-vide`],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      });
    });
  });

  describe('visiteurs (US-05-029, DEC-19 tranchée le 19/10)', () => {
    it('la Réception crée une fiche minimale (identité, contact) ; la qualification lui est refusée par le serveur', async () => {
      const refus = await appel('reception', 'POST', '/visiteurs', {
        nom_complet: 'Fiche Réception fictive',
        qualite: 'Titre fictif',
      });
      expect(refus.statut).toBe(400);
      expect(refus.corps.erreurs.map((e: { champ: string }) => e.champ)).toEqual(['qualite']);
      const ok = await appel('reception', 'POST', '/visiteurs', {
        nom_complet: 'Fiche Réception fictive',
        contact: 'reception@exemple.invalid',
      });
      expect(ok.statut).toBe(201);
      expect(ok.corps.qualite).toBeNull();
      const j = await admin.query(
        `SELECT utilisateur_id, contexte FROM journal WHERE objet_id=$1 AND action='visiteur.creer'`,
        [ok.corps.id],
      );
      expect(j.rows).toHaveLength(1);
      expect(j.rows[0]!.utilisateur_id).toBe(acteurs.reception.id);
      expect(JSON.stringify(j.rows[0]!.contexte)).not.toContain('Réception fictive');
    });
    it('l’Autorité crée un visiteur avec qualification ; l’Administrateur ne crée pas de visiteur', async () => {
      const r = await appel('authority', 'POST', '/visiteurs', {
        nom_complet: 'Fiche Autorité fictive',
        qualite: 'Titre fictif',
      });
      expect(r.statut).toBe(201);
      expect(
        (await appel('administrator', 'POST', '/visiteurs', { nom_complet: 'Fiche fictive' }))
          .statut,
      ).toBe(403);
    });
    it('l’assistant crée un visiteur qualifié ; la réception le retrouve par la recherche', async () => {
      const r = await appel('assistant', 'POST', '/visiteurs', {
        nom_complet: `Visiteur ${MARQUE}`,
        contact: 'contact@exemple.invalid',
        qualite: 'Délégué fictif',
      });
      expect(r.statut).toBe(201);
      visiteurId = r.corps.id;
      const q = await appel('reception', 'GET', `/visiteurs?q=${encodeURIComponent(MARQUE)}`);
      expect(q.corps.elements.map((v: { id: string }) => v.id)).toEqual([visiteurId]);
    });
    it('refuse un nom vide et un champ inconnu', async () => {
      const r = await appel('assistant', 'POST', '/visiteurs', {
        nom_complet: '  ',
        role: 'admin',
      });
      expect(r.statut).toBe(400);
      expect(r.corps.erreurs.map((e: { champ: string }) => e.champ).sort()).toEqual([
        'nom_complet',
        'role',
      ]);
    });
    it('la recherche traite % et _ comme du texte', async () => {
      const r = await appel('reception', 'GET', '/visiteurs?q=%25');
      expect(r.statut).toBe(200);
      expect(r.corps.elements).toEqual([]);
    });
  });

  describe('demandes (US-05-037 à 039)', () => {
    let demandeId: string;
    const corpsValide = () => ({
      visiteur_id: visiteurId,
      agenda_id: agendaId,
      objet: 'Objet fictif',
      contact: 'contact@exemple.invalid',
    });

    it('la réception crée une demande avec référence DEM-AAAA-NNNNNN, statut recue, responsable par défaut', async () => {
      const r = await appel('reception', 'POST', '/demandes', corpsValide());
      expect(r.statut).toBe(201);
      expect(r.corps.reference).toMatch(/^DEM-\d{4}-000001$/);
      expect(r.corps.statut).toBe('recue');
      expect(r.corps.responsable_suivi_id).toBe(acteurs.reception.id);
      expect(r.corps.cree_par).toBe(acteurs.reception.id);
      demandeId = r.corps.id;
      const r2 = await appel('reception', 'POST', '/demandes', corpsValide());
      expect(r2.corps.reference).toMatch(/^DEM-\d{4}-000002$/);
    });
    it('exige objet et (contact ou dérogation justifiée) ; la dérogation permet l’absence de contact', async () => {
      const sans = await appel('reception', 'POST', '/demandes', {
        ...corpsValide(),
        contact: undefined,
      });
      expect(sans.statut).toBe(400);
      const der = await appel('reception', 'POST', '/demandes', {
        ...corpsValide(),
        contact: undefined,
        derogation: 'Visiteur sans contact connu (fictif)',
      });
      expect(der.statut).toBe(201);
      expect(
        (await appel('reception', 'POST', '/demandes', { ...corpsValide(), objet: '' })).statut,
      ).toBe(400);
    });
    it('refuse statut, référence ou auteur imposés par le client, et les références inconnues', async () => {
      const r = await appel('reception', 'POST', '/demandes', {
        ...corpsValide(),
        statut: 'validee',
        reference: 'DEM-X',
        cree_par: acteurs.authority.id,
      });
      expect(r.statut).toBe(400);
      const inconnu = await appel('reception', 'POST', '/demandes', {
        ...corpsValide(),
        visiteur_id: randomUUID(),
      });
      expect(inconnu.statut).toBe(400);
    });
    it('refuse la création à l’Administrateur (matrice : « — »), appel direct hors interface', async () => {
      expect((await appel('administrator', 'POST', '/demandes', corpsValide())).statut).toBe(403);
    });
    it('liste, filtre et pagine ; consultation individuelle ; 404 et 400', async () => {
      const l = await appel('assistant', 'GET', '/demandes?statut=recue&limite=2');
      expect(l.statut).toBe(200);
      expect(l.corps.elements.length).toBe(2);
      expect(l.corps.total).toBe(3);
      const un = await appel('assistant', 'GET', `/demandes/${demandeId}`);
      expect(un.statut).toBe(200);
      expect(un.corps.visiteur_nom).toContain(MARQUE);
      expect((await appel('assistant', 'GET', `/demandes/${randomUUID()}`)).statut).toBe(404);
      expect((await appel('assistant', 'GET', '/demandes/pas-un-uuid')).statut).toBe(400);
      expect((await appel('assistant', 'GET', '/demandes?statut=inconnu')).statut).toBe(400);
      expect((await appel('assistant', 'GET', '/demandes?limite=100000')).statut).toBe(400);
    });
    it('cloisonnement par organisation : une autre organisation ne voit rien et ne peut pas lire', async () => {
      const l = await appel('autreOrg', 'GET', '/demandes');
      expect(l.corps.total).toBe(0);
      expect((await appel('autreOrg', 'GET', `/demandes/${demandeId}`)).statut).toBe(404);
      expect(
        (
          await appel('autreOrg', 'POST', `/demandes/${demandeId}/decision`, {
            type: 'valider',
            motif: 'x',
          })
        ).statut,
      ).toBe(404);
    });
    it('modification des champs autorisés seulement, journalisée par noms de champs', async () => {
      const r = await appel('reception', 'PATCH', `/demandes/${demandeId}`, {
        objet: 'Objet corrigé fictif',
      });
      expect(r.statut).toBe(200);
      expect(r.corps.objet).toBe('Objet corrigé fictif');
      const j = await admin.query(
        `SELECT contexte FROM journal WHERE objet_id=$1 AND action='demande.modifier'`,
        [demandeId],
      );
      expect(j.rows[0]!.contexte).toEqual({ champs: ['objet'] });
      for (const interdit of [
        { statut: 'validee' },
        { reference: 'X' },
        { visiteur_id: visiteurId },
        { responsable_suivi_id: acteurs.authority.id },
      ])
        expect((await appel('reception', 'PATCH', `/demandes/${demandeId}`, interdit)).statut).toBe(
          400,
        );
      expect((await appel('reception', 'PATCH', `/demandes/${demandeId}`, {})).statut).toBe(400);
      expect(
        (await appel('administrator', 'PATCH', `/demandes/${demandeId}`, { objet: 'x' })).statut,
      ).toBe(403);
    });
    it('on ne peut pas retirer le contact sans dérogation', async () => {
      const r = await appel('reception', 'PATCH', `/demandes/${demandeId}`, { contact: null });
      expect(r.statut).toBe(400);
      const ok = await appel('reception', 'PATCH', `/demandes/${demandeId}`, {
        contact: null,
        derogation: 'Contact retiré à la demande du visiteur (fictif)',
      });
      expect(ok.statut).toBe(200);
    });
    it('qualification (Réception : initiale seulement), une seule fois ; l’Administrateur ne qualifie pas ; aucune décision', async () => {
      const q = await appel('reception', 'POST', `/demandes/${demandeId}/qualification`, {
        qualification: 'Demande recevable (fictif)',
      });
      expect(q.statut).toBe(200);
      expect(q.corps.statut).toBe('qualifiee');
      expect(
        (
          await appel('reception', 'POST', `/demandes/${demandeId}/qualification`, {
            qualification: 'bis',
          })
        ).statut,
      ).toBe(409);
      expect(
        (
          await appel('administrator', 'POST', `/demandes/${demandeId}/qualification`, {
            qualification: 'x',
          })
        ).statut,
      ).toBe(403);
      // L'Autorité peut qualifier (matrice : P) mais la demande l'est déjà.
      expect(
        (
          await appel('authority', 'POST', `/demandes/${demandeId}/qualification`, {
            qualification: 'bis autorité',
          })
        ).statut,
      ).toBe(409);
      expect(
        (
          await appel('reception', 'POST', `/demandes/${demandeId}/decision`, {
            type: 'valider',
            motif: 'non',
          })
        ).statut,
      ).toBe(403);
      expect(
        (await appel('reception', 'POST', `/demandes/${demandeId}/qualification`, {})).statut,
      ).toBe(400);
    });
    it('la réception ne voit ni les décisions ni l’audience dans le détail', async () => {
      const d = await appel('reception', 'GET', `/demandes/${demandeId}`);
      expect(d.corps).not.toHaveProperty('decisions');
      expect(d.corps).not.toHaveProperty('audience');
    });
    it('démarrage de la suite : mémorise la demande pour les parties suivantes', () => {
      (globalThis as Record<string, unknown>).__demandeId = demandeId;
    });
  });

  describe('décisions (US-05-043 à 046)', () => {
    it('seule l’autorité décide ; motif obligatoire ; statut mis à jour ; historique conservé', async () => {
      const id = (globalThis as Record<string, unknown>).__demandeId as string;
      for (const q of ['reception', 'assistant', 'administrator'] as const)
        expect(
          (await appel(q, 'POST', `/demandes/${id}/decision`, { type: 'valider', motif: 'x' }))
            .statut,
        ).toBe(403);
      expect(
        (await appel('authority', 'POST', `/demandes/${id}/decision`, { type: 'valider' })).statut,
      ).toBe(400);
      expect(
        (
          await appel('authority', 'POST', `/demandes/${id}/decision`, {
            type: 'peut-etre',
            motif: 'x',
          })
        ).statut,
      ).toBe(400);
      const diff = await appel('authority', 'POST', `/demandes/${id}/decision`, {
        type: 'differer',
        motif: 'Complément attendu (fictif)',
      });
      expect(diff.statut).toBe(201);
      expect(diff.corps.statut_demande).toBe('differee');
      expect(
        (
          await appel('authority', 'POST', `/demandes/${id}/decision`, {
            type: 'differer',
            motif: 'encore',
          })
        ).statut,
      ).toBe(409);
      const val = await appel('authority', 'POST', `/demandes/${id}/decision`, {
        type: 'valider',
        motif: 'Accord (fictif)',
      });
      expect(val.statut).toBe(201);
      expect(
        (
          await appel('authority', 'POST', `/demandes/${id}/decision`, {
            type: 'rejeter',
            motif: 'tard',
          })
        ).statut,
      ).toBe(409);
      const d = await appel('authority', 'GET', `/demandes/${id}`);
      expect(d.corps.statut).toBe('validee');
      expect(d.corps.decisions.map((x: { type: string }) => x.type)).toEqual([
        'differer',
        'valider',
      ]);
      expect(d.corps.decisions[0].decide_par_nom).toBe('Fictif authority');
    });
    it('une demande peut être rejetée ; la file n’affiche que les demandes en attente, de la plus ancienne', async () => {
      const a = await appel('reception', 'POST', '/demandes', {
        visiteur_id: visiteurId,
        agenda_id: agendaId,
        objet: 'À rejeter',
        contact: 'c@exemple.invalid',
      });
      const file = await appel('assistant', 'GET', '/decisions/file');
      expect(file.statut).toBe(200);
      const refs: string[] = file.corps.elements.map((e: { reference: string }) => e.reference);
      expect(refs).toContain(a.corps.reference);
      expect(refs).toEqual([...refs].sort());
      expect(
        file.corps.elements.every((e: { statut: string }) =>
          ['recue', 'qualifiee', 'differee'].includes(e.statut),
        ),
      ).toBe(true);
      expect((await appel('reception', 'GET', '/decisions/file')).statut).toBe(403);
      const rej = await appel('authority', 'POST', `/demandes/${a.corps.id}/decision`, {
        type: 'rejeter',
        motif: 'Hors périmètre (fictif)',
      });
      expect(rej.statut).toBe(201);
      expect(rej.corps.statut_demande).toBe('rejetee');
      expect(
        (
          await appel('authority', 'POST', '/audiences', {
            demande_id: a.corps.id,
            debut_prevu: '2026-11-02T09:00:00Z',
            duree_prevue_minutes: 30,
          })
        ).statut,
      ).toBe(409);
      (globalThis as Record<string, unknown>).__demandeRejetee = a.corps.id;
    });
    it('Réception : une demande rejetée apparaît « non retenue », sans motif ni auteur (arbitrage du 19/10, serveur)', async () => {
      const id = (globalThis as Record<string, unknown>).__demandeRejetee as string;
      const d = await appel('reception', 'GET', `/demandes/${id}`);
      expect(d.statut).toBe(200);
      expect(d.corps.statut).toBe('non_retenue');
      expect(d.corps.decisions).toBeUndefined();
      expect(d.corps.audience).toBeUndefined();
      const brut = JSON.stringify(d.corps);
      expect(brut).not.toContain('rejetee'); // l'objet saisi (« À rejeter ») reste, lui, visible
      expect(brut).not.toContain('Hors périmètre'); // motif
      expect(brut).not.toContain('Fictif authority'); // auteur de la décision
      // La liste projette de même ; filtrer sur « rejetee » est refusé, sur le statut neutre accepté.
      const l = await appel('reception', 'GET', '/demandes?limite=100');
      const ligne = l.corps.elements.find((e: { id: string }) => e.id === id);
      expect(ligne.statut).toBe('non_retenue');
      expect(JSON.stringify(l.corps)).not.toContain('rejetee');
      expect((await appel('reception', 'GET', '/demandes?statut=rejetee')).statut).toBe(400);
      const f = await appel('reception', 'GET', '/demandes?statut=non_retenue&limite=100');
      expect(f.statut).toBe(200);
      expect(f.corps.elements.map((e: { id: string }) => e.id)).toContain(id);
      // Un message d'erreur ne révèle pas non plus l'issue.
      const m = await appel('reception', 'PATCH', `/demandes/${id}`, { objet: 'x' });
      expect(m.statut).toBe(409);
      expect(JSON.stringify(m.corps)).not.toContain('rejetee');
      // L'Assistant et l'Autorité gardent le statut réel ; le statut neutre ne leur est pas connu.
      expect((await appel('assistant', 'GET', `/demandes/${id}`)).corps.statut).toBe('rejetee');
      expect((await appel('authority', 'GET', '/demandes?statut=non_retenue')).statut).toBe(400);
    });
    it('la base interdit à l’application de modifier ou supprimer une décision', async () => {
      await expect(appBaseQuery(`UPDATE decision SET motif='x'`)).rejects.toMatchObject({
        code: '42501',
      });
      await expect(appBaseQuery(`DELETE FROM decision`)).rejects.toMatchObject({ code: '42501' });
    });
  });

  async function appBaseQuery(sql: string) {
    return appBase.query(sql);
  }

  describe('audiences : planification, réalisation, clôture (US-05-047, 056)', () => {
    let audienceId: string;
    let demandeId: string;
    const debut = '2026-11-02T09:00:00Z';

    it('seule l’Autorité planifie (l’Assistant : D, refusé sans délégation), uniquement une demande validée, avec dates valides', async () => {
      demandeId = (globalThis as Record<string, unknown>).__demandeId as string;
      const corps = { demande_id: demandeId, debut_prevu: debut, duree_prevue_minutes: 45 };
      for (const q of ['reception', 'assistant', 'administrator'] as const)
        expect((await appel(q, 'POST', '/audiences', corps)).statut).toBe(403);
      expect(
        (
          await appel('authority', 'POST', '/audiences', {
            ...corps,
            debut_prevu: '2026-11-02 09:00',
          })
        ).statut,
      ).toBe(400);
      expect(
        (await appel('authority', 'POST', '/audiences', { ...corps, duree_prevue_minutes: 0 }))
          .statut,
      ).toBe(400);
      expect(
        (await appel('authority', 'POST', '/audiences', { ...corps, demande_id: randomUUID() }))
          .statut,
      ).toBe(404);
      const r = await appel('authority', 'POST', '/audiences', corps);
      expect(r.statut).toBe(201);
      expect(r.corps.statut).toBe('planifiee');
      expect(r.corps.agenda_id).toBe(agendaId);
      expect(r.corps.responsable_suivi_id).toBe(acteurs.authority.id);
      audienceId = r.corps.id;
      expect((await appel('authority', 'GET', `/demandes/${demandeId}`)).corps.statut).toBe(
        'planifiee',
      );
      expect((await appel('authority', 'POST', '/audiences', corps)).statut).toBe(409);
    });
    it('planning d’un agenda sur une période', async () => {
      const dans = await appel(
        'authority',
        'GET',
        `/audiences?agenda_id=${agendaId}&du=2026-11-01T00:00:00Z&au=2026-11-03T00:00:00Z`,
      );
      expect(dans.statut).toBe(200);
      expect(dans.corps.elements.map((a: { id: string }) => a.id)).toEqual([audienceId]);
      const hors = await appel(
        'authority',
        'GET',
        `/audiences?agenda_id=${agendaId}&du=2026-12-01T00:00:00Z`,
      );
      expect(hors.corps.elements).toEqual([]);
      expect((await appel('authority', 'GET', '/audiences?du=hier')).statut).toBe(400);
      expect((await appel('reception', 'GET', '/audiences')).statut).toBe(403);
    });
    it('ordre strict : terminer avant démarrer refusé, puis démarrer, puis terminer avec résultat', async () => {
      expect(
        (await appel('assistant', 'POST', `/audiences/${audienceId}/terminer`, { resultat: 'x' }))
          .statut,
      ).toBe(409);
      expect((await appel('reception', 'POST', `/audiences/${audienceId}/demarrer`)).statut).toBe(
        403,
      );
      const d = await appel('assistant', 'POST', `/audiences/${audienceId}/demarrer`);
      expect(d.statut).toBe(200);
      expect(d.corps.statut).toBe('en_cours');
      expect(d.corps.debut_reel).toBeTruthy();
      expect((await appel('assistant', 'POST', `/audiences/${audienceId}/demarrer`)).statut).toBe(
        409,
      );
      expect(
        (await appel('assistant', 'POST', `/audiences/${audienceId}/terminer`, {})).statut,
      ).toBe(400);
      const t = await appel('assistant', 'POST', `/audiences/${audienceId}/terminer`, {
        resultat: 'Entretien tenu, suite à donner (fictif)',
      });
      expect(t.statut).toBe(200);
      expect(t.corps.statut).toBe('terminee');
      expect(typeof t.corps.duree_reelle_minutes).toBe('number');
      expect(t.corps.duree_prevue_minutes).toBe(45);
      expect((await appel('assistant', 'GET', `/demandes/${demandeId}`)).corps.statut).toBe(
        'realisee',
      );
    });
    it('la clôture est refusée à la Réception et à l’Administrateur, sans effet de bord', async () => {
      for (const q of ['reception', 'administrator'] as const)
        expect((await appel(q, 'POST', `/audiences/${audienceId}/cloturer`)).statut).toBe(403);
      const a = await appel('assistant', 'GET', `/audiences/${audienceId}`);
      expect(a.corps.statut).toBe('terminee');
      expect(a.corps.cloturee_le).toBeNull();
    });
    it('l’Assistant clôture (arbitrage du 19/10) : conservation de 5 ans, trace nominative, chaîne complète lisible', async () => {
      const c = await appel('assistant', 'POST', `/audiences/${audienceId}/cloturer`);
      expect(c.statut).toBe(200);
      expect(c.corps.statut).toBe('cloturee');
      // Trace de clôture : auteur nominatif, identifiants et durées ; jamais le texte du résultat.
      const j = await admin.query(
        `SELECT utilisateur_id, contexte FROM journal WHERE objet_id=$1 AND action='audience.cloturer'`,
        [audienceId],
      );
      expect(j.rows).toHaveLength(1);
      expect(j.rows[0]!.utilisateur_id).toBe(acteurs.assistant.id);
      expect(j.rows[0]!.contexte).toEqual({
        demande_id: demandeId,
        duree_prevue_minutes: 45,
        duree_reelle_minutes: c.corps.duree_reelle_minutes,
      });
      expect(JSON.stringify(j.rows[0]!.contexte)).not.toContain('Entretien');
      const attendu = (
        await admin.query<{ d: string }>(
          `SELECT ((SELECT cloturee_le FROM audience WHERE id=$1) + interval '5 years')::date::text AS d`,
          [audienceId],
        )
      ).rows[0]!.d;
      expect(c.corps.conservation_echeance).toBe(attendu);
      expect((await appel('assistant', 'POST', `/audiences/${audienceId}/cloturer`)).statut).toBe(
        409,
      );
      const d = await appel('authority', 'GET', `/demandes/${demandeId}`);
      expect(d.corps.statut).toBe('cloturee');
      // Chaîne Demande → Décisions → Audience (US-05-017), y compris objet clos.
      expect(d.corps.decisions.length).toBe(2);
      expect(d.corps.audience.id).toBe(audienceId);
      // Responsable de suivi de l'AUDIENCE (par défaut : qui a planifié, ici l'Autorité), pas celui de la demande.
      expect(d.corps.audience.responsable_suivi_id).toBe(acteurs.authority.id);
      expect(d.corps.audience.responsable_suivi_nom).toBe('Fictif authority');
      expect(d.corps.audience.statut).toBe('cloturee');
    });
  });

  describe('journal d’audit (US-05-010, US-05-011)', () => {
    it('retrace la chaîne complète d’une demande, attribuée, dans l’ordre', async () => {
      const id = (globalThis as Record<string, unknown>).__demandeId as string;
      const r = await appel('authority', 'GET', `/journal?objet_id=${id}&objet_type=demande`);
      expect(r.statut).toBe(200);
      const actions = r.corps.elements.map((e: { action: string }) => e.action).reverse();
      expect(actions).toEqual([
        'demande.creer',
        'demande.modifier',
        'demande.modifier',
        'demande.qualifier',
        'decision.differer',
        'decision.valider',
      ]);
      expect(r.corps.elements[0].utilisateur_nom).toBe('Fictif authority');
      expect((await appel('assistant', 'GET', '/journal')).statut).toBe(403);
      // Administrateur : « D » dans la matrice, donc refusé tant qu'aucune délégation n'existe.
      expect((await appel('administrator', 'GET', '/journal')).statut).toBe(403);
      expect((await appel('autreOrg', 'GET', `/journal?objet_id=${id}`)).corps.elements).toEqual(
        [],
      );
    });
    it('exhaustivité : chaque action de mutation inventoriée a produit au moins une entrée attribuée à une personne', async () => {
      const { rows } = await admin.query<{ action: string; n: number; sans_auteur: number }>(
        `SELECT action, count(*)::int AS n, count(*) FILTER (WHERE utilisateur_id IS NULL)::int AS sans_auteur
           FROM journal WHERE organisation_id=$1 GROUP BY action`,
        [orgId],
      );
      const vues = new Map(rows.map((r) => [r.action, r]));
      for (const [route, actions] of Object.entries(MUTATIONS_JOURNALISEES))
        // La décision peut prendre trois formes ; au moins une doit avoir été exercée par la suite.
        expect(
          actions.some((a) => (vues.get(a)?.n ?? 0) > 0),
          `aucune entrée de journal pour ${route} (${actions.join(', ')})`,
        ).toBe(true);
      for (const r of rows) expect(r.sans_auteur, r.action).toBe(0);
      // Aucune entrée ne porte une action absente de l'inventaire (action écrite en cachette).
      const connues = new Set(Object.values(MUTATIONS_JOURNALISEES).flat());
      for (const r of rows)
        expect(connues.has(r.action), `action hors inventaire : ${r.action}`).toBe(true);
    });
    it('chaque entrée porte auteur, organisation et horodatage de la base', async () => {
      const { rows } = await admin.query(
        `SELECT count(*)::int AS n, count(utilisateur_id)::int AS u FROM journal WHERE organisation_id=$1`,
        [orgId],
      );
      expect(rows[0].n).toBeGreaterThan(10);
      expect(rows[0].u).toBe(rows[0].n);
    });
    it('aucune route HTTP ne modifie ou ne supprime le journal', async () => {
      for (const m of ['PUT', 'PATCH', 'DELETE', 'POST'])
        expect([404, 405]).toContain(
          (await appel('administrator', m, '/journal/1', m === 'DELETE' ? undefined : {})).statut,
        );
      expect([404, 405, 403]).toContain(
        (await appel('administrator', 'DELETE', '/journal')).statut,
      );
    });
    it('la base refuse à l’application de modifier ou supprimer une entrée', async () => {
      await expect(appBaseQuery(`UPDATE journal SET action='x'`)).rejects.toMatchObject({
        code: '42501',
      });
      await expect(appBaseQuery(`DELETE FROM journal`)).rejects.toMatchObject({ code: '42501' });
      await expect(appBaseQuery(`TRUNCATE journal`)).rejects.toMatchObject({ code: '42501' });
    });
    it('les déclencheurs arrêtent aussi un UPDATE ou un TRUNCATE du superutilisateur (sans le désactiver ; les limites L1 à L5 restent valables)', async () => {
      await admin.query('BEGIN');
      await expect(
        admin.query(`UPDATE journal SET action='x' WHERE organisation_id=$1`, [orgId]),
      ).rejects.toThrow(/ajout seul/);
      await admin.query('ROLLBACK');
      await admin.query('BEGIN');
      await expect(admin.query(`TRUNCATE journal`)).rejects.toThrow(/ajout seul/);
      await admin.query('ROLLBACK');
    });
    it('l’horodatage est celui du serveur de base : une date imposée par l’application est ignorée', async () => {
      const { rows } = await appBase.query<{ horodatage: Date }>(
        `INSERT INTO journal (organisation_id, utilisateur_id, horodatage, action, objet_type)
         VALUES ($1,$2,'2000-01-01T00:00:00Z','essai.horodatage','essai') RETURNING horodatage`,
        [orgId, acteurs.authority.id],
      );
      expect(Math.abs(rows[0]!.horodatage.getTime() - Date.now())).toBeLessThan(60_000);
    });
    it('l’action métier et son entrée de journal sont validées ensemble : si le journal échoue, rien n’est écrit', async () => {
      const nom = `essai_atomicite_${randomUUID().replaceAll('-', '')}`;
      await admin.query(
        `ALTER TABLE journal ADD CONSTRAINT ${nom} CHECK (action <> 'visiteur.creer') NOT VALID`,
      );
      try {
        const avant = await compter(`SELECT count(*) n FROM visiteur WHERE organisation_id=$1`, [
          orgId,
        ]);
        const r = await appel('assistant', 'POST', '/visiteurs', {
          nom_complet: 'Ne doit pas exister',
        });
        expect(r.statut).toBe(500);
        expect(
          await compter(`SELECT count(*) n FROM visiteur WHERE organisation_id=$1`, [orgId]),
        ).toBe(avant);
      } finally {
        await admin.query(`ALTER TABLE journal DROP CONSTRAINT ${nom}`);
      }
    });
  });
});
