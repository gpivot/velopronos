# VéloPronos

Jeu de pronostics cyclisme, reconstruit à partir du code de
[Biathlonpronos](https://github.com/gpivot/biathlonpronos) (copie du 04/11/2026). Voir
`docs/velopronos/` et `CLAUDE.md`. Le reste de ce fichier est hérité de Biathlonpronos.

---

# (Hérité) Biathlonpronos

Jeu de pronostics biathlon, dans la continuité de [VéloPronos](https://velopronos.fr),
reconstruit indépendamment de base44.

Contexte produit complet dans `docs/` : `reglement.md` (référence pour le scoring),
`cahier-des-charges.md` (périmètre, identité, calendrier), `architecture-technique.md`
(modèle de données, moteur de scoring détaillé, **état d'avancement du code — à lire en
premier**).

## Mise en route

1. **Créer un projet Supabase** sur [supabase.com](https://supabase.com).
2. Copier `.env.example` en `.env.local` et renseigner les clés depuis
   *Project Settings > API*.
3. Exécuter les migrations, dans l'ordre, dans l'éditeur SQL Supabase :
   `supabase/migrations/0001_init.sql` à `0015_pepites_per_sex.sql`, puis
   (optionnel, données d'exemple) `supabase/seed.sql`. Deux points d'attention :
   - `0003`/`0006` posent des contraintes d'unicité — si `seed.sql` a déjà été exécuté
     plusieurs fois avant, dédoublonne `odds` manuellement avant de les lancer.
   - `0008` et `0009` doivent être exécutées dans deux requêtes séparées (Postgres
     interdit d'utiliser une valeur d'enum tout juste ajoutée dans la même transaction).
4. Dans *Authentication > Providers > Email*, décoche *Confirm email* pour tester en
   local sans vérification par lien envoyé par mail (à réactiver avant la prod).
5. Une fois un compte créé via `/fr/sign-in`, passe-le admin :
   `update profiles set is_admin = true where id = '<uuid>';` dans l'éditeur SQL.
6. `npm install && npm run dev`, puis ouvrir `http://localhost:3000`.
7. Déploiement : connecter le dépôt à [Vercel](https://vercel.com) et renseigner les
   mêmes variables d'environnement dans les réglages du projet Vercel.

## Structure

```
src/
  middleware.ts                routing i18n (négociation de langue, préfixe /fr, /en...)
  i18n/                        routing.ts, navigation.ts, request.ts (next-intl)
  app/
    [locale]/                  écrans joueur (traduits FR/EN)
      page.tsx                  accueil (dashboard : saison/rang/points, en ce moment,
                                  prochaine course, aperçu classement)
      (auth)/sign-in/page.tsx   connexion + inscription (email/mdp + Google/Apple)
      courses/                  liste des courses + écran de pronostic (individuel/relais)
      classement/               classement général de la saison active
      ligues/                   créer/rejoindre une ligue par code, classement privé
      pronos/                   mes pronostics (en cours + à venir) — onglet "Ma saison"
      globes/                   pronostics de saison (globes) + Pépite
      compte/                   pseudo, équipe favorite, cartes bonus, déconnexion
      regles/                   règlement condensé
    admin/                      back-office (protégé par profiles.is_admin, hors i18n)
      seasons/, athletes/, relais/, stages/[stageId]/   pilotage : saisons, athlètes,
                                                          cotes (individuelles et relais),
                                                          étapes, courses
      races/[raceId]/          saisie des résultats → déclenche le calcul des scores
      globes/, import/         classement final des globes, import CSV des cotes
    auth/callback/route.ts     callback OAuth (hors [locale], pas de traduction)
  components/                 icônes SVG, navigation basse (6 entrées + Admin conditionnel),
                                LocaleSwitcher, AdminNav
  lib/
    scoring/                  moteur de scoring pur (testé, sans dépendance Supabase)
    admin/                    orchestration back-office (écrit dans Supabase)
    supabase/                 clients Supabase (browser / serveur / admin)
    leaderboard.ts            agrégation du classement général, partagée accueil/classement
    nationFlags.ts            code nation (alpha-3) → drapeau emoji
    types/domain.ts           types TypeScript miroir du schéma SQL
messages/
  fr.json, en.json            traductions par langue (un namespace par écran)
supabase/
  migrations/                 schéma + évolutions, dans l'ordre numéroté
  seed.sql                    données d'exemple pour tester en local
```

## Internationalisation

Basée sur [next-intl](https://next-intl.dev), routing par préfixe (`/fr/...`, `/en/...`).
FR et EN sont actifs ; les autres langues des nations biathlon (DE, NO, SV, IT, RU) s'ajoutent
en deux étapes : ajouter le code dans `src/i18n/routing.ts` (`locales`), puis créer le fichier
`messages/<code>.json` correspondant (copier `en.json` et traduire). Aucun autre changement de
code n'est nécessaire — le routing, la négociation de langue du navigateur et le sélecteur de
langue s'adaptent automatiquement à la liste. Le back-office (`/admin`) est volontairement hors
i18n (outil interne).

## Tests

`npm test` (Vitest) — moteur de scoring uniquement (`src/lib/scoring/`), aucune dépendance à
Supabase. Voir `docs/architecture-technique.md` pour les choix d'interprétation du règlement
retenus dans ce moteur.

## Limites connues (voir `docs/architecture-technique.md` pour le détail à jour)

- **Chat Noir** : carte retirée du jeu le 01/11/2026 (réservée à VéloPronos).
- **Classements annexes** : le Dossard Rouge est porté par le leader de chaque étape (classement
  « Par étapes ») ; liste des meilleures séries 10/10. Un classement par type de course (sprint/poursuite/individuel/mass start/relais) était
  envisagé mais mis en suspens pour l'instant.
- **Imports CSV du back-office** (calendrier, cotes, résultats) : logique couverte par les tests
  unitaires et écrans vérifiés dans le navigateur sur des données factices ; l'import des cotes
  (qui remplace les cotes en cours) n'a pas encore été rejoué sur la vraie base.
- Google/Apple OAuth configurés dans le code mais jamais testés (nécessitent des credentials réels).
- Pas d'emplacements publicitaires ni de bannière de consentement cookies (prévu dans l'architecture,
  pas encore posé dans le layout).
