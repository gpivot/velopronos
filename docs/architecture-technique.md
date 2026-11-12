# Biathlonpronos — Architecture technique

Ce document traduit le règlement (`reglement.md`) en modèle de données et en logique de moteur de scoring. Décisions actées : reconstruction indépendante de base44, un seul mode de jeu (3 biathlètes), monétisation par pub future uniquement.

## Stack

- **Next.js (App Router, TypeScript)** — front web + back-office admin dans la même app.
- **Supabase** — Postgres managé, auth native (email / Google / Apple), row-level security, cron jobs (pg_cron) pour le verrouillage des pronostics et la réévaluation des cotes.
- **Hébergement Vercel.** Paliers gratuits suffisants pour la phase de tests d'octobre ; passer sur Vercel Pro (~20$/mois) + Supabase Pro (~25$/mois) avant le lancement grand public fin novembre si l'audience le justifie.
- Emplacements publicitaires et bannière de consentement cookies posés dès le départ dans le layout (non activés au lancement).

## Modèle de données (entités principales)

Implémenté dans `supabase/migrations/0001_init.sql` — s'y référer pour le schéma SQL exact (colonnes, contraintes, policies RLS).

- **Season**, **Nation**, **Athlete**, **Odds** (historisées, cote par athlète ou par couple nation+sexe pour "meilleure nation"), **Stage**, **Race**, **RaceResult**, **Prediction**, **SeasonPrediction** (globes), **FavoriteTeam**, **Pepite**, **BonusCard**, **StreakCounter**, **GrilledState**, **League** / **LeagueMembership**, **ScoreLedger** (source de vérité du classement), **Profile** (miroir de `auth.users`).

## Règles confirmées par Guillaume

- **Bonus Team Nation** : le doublement s'applique uniquement à l'athlète de la nation favorite de l'utilisateur qu'il a **effectivement pronostiqué** ce jour-là (pas un score séparé indépendant du pronostic).
- **Bonus Aspiration** : indépendant du pronostic de l'utilisateur — comme on ne peut parier que sur 3 athlètes, ce bonus récompense la performance collective réelle de l'équipe favorite (4 athlètes ou plus en Top 10 → bonus), même si l'utilisateur n'a pas pu tous les jouer.
- **Cote "meilleure nation"** : une cote par couple (nation, sexe), les niveaux pouvant différer fortement entre hommes et femmes d'un même pays.

## Moteur de scoring — séquence par course (à implémenter)

1. À la saisie des résultats par l'admin : figer la cote effective de chaque athlète pour cette course (recalcul spécifique pour la poursuite, à partir des écarts du sprint).
2. Pour chaque pronostic déposé sur la course : points de base = cote × multiplicateur de rang (0 si hors Top 10, sauf courses spéciales).
3. Bonus de combinaison (podium / top 5 / top 10 / prono parfait) évalués sur l'ensemble des 3 choix.
4. Malus des courses spéciales (tour de péna / brouillard / t'es collé) si la course est marquée comme telle.
5. Effets des bonus actifs de l'utilisateur : bonus ×2 saison, carte "Ça farte" (×3 sur un athlète), carte "Balle de pioche" (4 choix, 3 meilleurs comptent).
6. Coefficient ×2 Mondiaux/JO appliqué à l'ensemble du score de la course (non cumulable avec le bonus ×2 personnel).
7. **Bonus Team Nation** : si l'un des athlètes pronostiqués par l'utilisateur appartient à sa nation/sexe favori(te) ET que la course a lieu dans le pays de cette nation, les points obtenus via cet athlète (étapes 2-6 comprises) sont doublés.
8. **Bonus Aspiration** : calculé indépendamment des choix de l'utilisateur, à partir du nombre d'athlètes de sa nation/sexe favori(te) classés Top 10 sur la course (2 → +20, 3 → +50, 4+ → +100), et ajouté à son score.
9. Bonus Fusée / Gâchette si l'un des athlètes choisis correspond à la performance du jour.
10. Mise à jour du compteur de série 10/10.
11. Écriture du résultat détaillé dans le ScoreLedger ; le classement général et les classements annexes sont des agrégats du ScoreLedger, jamais recalculés "à la main".

**Implémenté** dans `src/lib/scoring/` (fonction pure TypeScript, testée avec Vitest —
`npm test` — sans dépendre de Supabase, voir `src/lib/scoring/__tests__/`). Reste à écrire :
la route API / fonction Postgres qui appelle ce moteur avec les données réelles d'une course
et écrit le résultat dans `score_ledger` (back-office de saisie de résultats, non construit).

### Décisions d'implémentation du moteur de scoring (confirmées par Guillaume)

Le règlement laissait plusieurs points d'interprétation ouverts pour l'implémentation. Choix
retenus dans `src/lib/scoring/individualRace.ts`, confirmés par Guillaume le 2026-09-11 :

- **Bonus de combinaison (podium/top5/top10)** : mutuellement exclusifs, seul le palier le
  plus élevé atteint est payé (pas de cumul). Ne s'applique que sur un pronostic complet de
  3 choix comptés.
  **Depuis fin octobre 2026 (demande de Guillaume) : le Prono parfait remplace le bonus
  Top 3/Top 5/Top 10, il ne s'y ajoute pas.** Les bonus sont affichés « Bonus Top 3 / Top 5 /
  Top 10 » (le palier est retrouvé à partir du montant enregistré). Les courses déjà notées avant
  ce changement gardent leurs points tant qu'elles ne sont pas renotées.
- *(Depuis le 04/11/2026, Fusée et Gâchette sont des cartes à points fixes, hors Prono parfait et
  doublées par le seul bonus ×2 perso : voir « Cartes Fusée, Gâchette et Talent » en fin de document. Les trois
  points ci-dessous qui les citent décrivent l'ancien bonus automatique.)*
- **Fusée / Gâchette** : attribués par athlète (et non plus comme un bonus global de fin de
  calcul), sur l'ensemble des biathlètes réellement pronostiqués. Le filtrage "3 meilleurs sur
  4" de la carte "Balle de pioche" s'applique **après** l'ajout de ce bonus — un athlète
  auteur d'un sans-faute peut donc être "sauvé" par ce bonus au moment de la sélection.
- **Carte "Balle de pioche"** : le 4e choix exclu est celui dont le score (cote × rang + malus
  éventuels + Fusée/Gâchette) est le plus faible des 4 — pas nécessairement celui avec le plus
  mauvais classement brut.
- **Prono parfait** : évalué en comparant les 3 athlètes effectivement comptés (donc, avec la
  Balle de pioche, les 3 meilleurs des 4 choix — puisque ce sont mécaniquement les 3 qui
  comptent pour l'étape) à la combinaison des 3 athlètes du Top 10 qui rapportent objectivement
  le plus de points (cote × rang + Fusée/Gâchette).
- **Bonus Team Nation** (§10) : le doublement porte sur le score total réellement gagné par cet
  athlète — base (cote × rang, malus spéciaux inclus) **+ son bonus Fusée/Gâchette s'il y est
  éligible** — mais pas les bonus/malus de niveau pronostic (combinaison, "t'es collé(e)") qui
  ne sont pas attribuables à un athlète en particulier.
- **Carte "Ça farte" (×3) non cumulable avec un ×2** : quel qu'il soit — coefficient
  Mondiaux/JO, bonus ×2 personnel, ou Team Nation. L'athlète ciblé par "Ça farte" reçoit
  uniquement le ×3, jamais ×6 ni davantage.
- **"T'es collé(e)"** : le malus à -200 ne s'applique qu'en l'absence totale de pronostic sur
  la course ; choisir 1 ou 2 biathlètes applique le malus progressif normal (-30/-100/-300) en
  traitant les choix manquants comme hors Top 10, conformément à la formulation du règlement.

### Relais (§5) — décisions confirmées par Guillaume (2026-09-11)

- **Cotes de relais** (`relais_h`, `relais_f`, `relais_mixte`, `relais_mixte_simple`, ajoutées à
  l'enum `odds_format` par les migrations 0008/0009) : ce sont des cotes **course**, par nation,
  réévaluées aux mêmes pauses de saison que sprint/individuel/mass start — *pas* des cotes saison
  fixes. Implémenté dans `src/lib/scoring/relay.ts` (`computeRelayScore`) : cote × multiplicateur
  de rang (§5, top 5 uniquement), coefficient Mondiaux/JO et bonus ×2 personnel (§7 : utilisable
  sur un relais), mutuellement exclusifs comme pour les courses individuelles. Aucun bonus de
  combinaison ni malus de course spéciale (non mentionnés pour les relais dans le règlement — à
  confirmer si un besoin apparaît).
- **Relais mixte et mixte simple** : cote distincte par nation pour chacun des deux formats (pas
  de cote partagée), et pas de sexe associé (`nation_sex` NULL) puisqu'une nation aligne une seule
  équipe mixte.
- **Cote "meilleure nation"** (§6, pronostic de saison) : reste indépendante des cotes de relais —
  c'est une cote **saison** par (nation, sexe), fixée une fois en début de saison et ne bougeant
  plus (déjà correctement modélisée depuis 0001_init.sql, aucun changement nécessaire).
- Écrans : `/admin/athletes` (cotes par nation et par format, ex-`/admin/relais`), écran de pronostic joueur
  (`RelayPredictionForm.tsx`, sélection d'une nation), saisie des résultats admin (mode "nation"
  dans `ResultsForm.tsx`) — tout branché sur `scoreRace()` (`src/lib/admin/raceResults.ts`), y
  compris la mise à jour du 10/10 (§12 : "hommes et femmes confondus ainsi que relais").
- **Import CSV des cotes** : fichier unique depuis octobre 2026, cf. « Réorganisation du
  back-office ».

### Hors périmètre de cette première version du moteur

- **Globes de saison** (gros globe / meilleur jeune / meilleure nation, §6) et **Pépite** (§14) :
  implémentés depuis, voir plus bas. La carte **Chat Noir** (§13) a été retirée du jeu le 01/11/2026.
- **Grillage** (§2) : n'est pas un calcul de points, mais une contrainte de sélection à
  vérifier côté écran de pronostic (empêcher de choisir un biathlète grillé) — pas traité ici.

## État d'avancement du code

Projet installé, buildé et testé en conditions réelles sur un vrai projet Supabase (npm install fait,
compilation propre, `npm test` = 27 tests verts sur le moteur de scoring).

**Présent et testé de bout en bout** :
- authentification email (inscription + connexion, confirmation désactivée en dev) — Google/Apple
  configurés mais pas testés (nécessitent des credentials OAuth réels)
- internationalisation FR/EN (next-intl, routing par préfixe `/fr`, `/en` — voir README)
- 7 écrans joueur (nav basse + satellites) : accueil, étapes/courses, écran de pronostic
  (individuel et relais), classement général, ligues (créer/rejoindre par code, classement
  privé), pronos (mes pronostics + courses à jouer), compte (équipe favorite), règles
- moteur de scoring courses individuelles ET relais (`src/lib/scoring/`), toutes les règles
  confirmées par Guillaume — voir "Décisions d'implémentation" ci-dessus
- back-office complet (`/admin`, protégé par `profiles.is_admin`) : gestion des saisons, des
  athlètes et de leurs cotes (individuelles et relais), des étapes et des courses, saisie des
  résultats (individuels et relais) → calcul automatique des scores de tous les pronostics +
  cascade de la cote poursuite (§4) + mise à jour du 10/10
- 9 migrations SQL appliquées (`supabase/migrations/0002` à `0009`) corrigeant des bugs trouvés en
  testant en réel (lecture publique des tables de jeu, unicité des cotes courantes et des lignes
  de score, trigger de création du profil à l'inscription, rôle admin, lecture publique du
  classement) et ajoutant les cotes de relais

**Absent** : pages publicitaires/RGPD (la carte Chat Noir a été retirée du jeu le 01/11/2026).

**Cartes bonus — implémentées et testées de bout en bout.** Confirmé par Guillaume (2026-09-11) :
au 10/10, **le joueur choisit lui-même** le type de carte (pas de tirage aléatoire) parmi les 4,
sauf s'il détient déjà un exemplaire non utilisé de ce type (grisé jusqu'à consommation) —
`streak_counters.cards_earned` sert de compteur de crédits, `/compte` affiche le sélecteur
(`ClaimCardPicker`) dès qu'un crédit n'est pas encore réclamé. Écran de pronostic : sélecteur
"Aucune / Balle de pioche / Ça farte" (mutuellement exclusifs, cf. colonne unique
`predictions.bonus_card_used`), sélection de la cible du ×3 pour Ça farte, bouton dédié "Utiliser
Fondue" sur l'écran de course. Bonus ×2 personnel (§7) : compteur "3 par saison" calculé à la volée,
désactivé sur les courses spéciales et les étapes Mondiaux/JO. **Chat Noir** retirée du jeu (01/11/2026).

**Globes de saison (§6) et Pépite (§14) — implémentés et testés de bout en bout.**
`src/lib/scoring/seasonPredictions.ts` : barème gros globe vs jeune/nation (`GROS_GLOBE_MULTIPLIERS`
/ `PETIT_GLOBE_MULTIPLIERS`). Écran joueur `/globes` (lien depuis `/pronos`) : 6 pronostics de
saison + choix de la Pépite. Écran admin `/admin/globes` (section « Globes de saison » de `/admin` depuis octobre 2026) : saisie du classement final officiel
(jusqu'à 5 rangs) par catégorie, déclenche le calcul. **Pas encore fait** : verrouillage des globes
avant le début de saison au niveau base (la page affiche un message mais rien n'empêche une écriture
directe).

Depuis le 02/11/2026, chaque intitulé du formulaire `/globes` a un bouton ⓘ qui déplie une
explication du classement (clés `Globes.info_*`, 5 langues). Définitions retenues : gros globe =
vainqueur(e) du classement général de la Coupe du monde ; meilleur(e) jeune = biathlète de moins
de 25 ans le/la mieux classé(e) au général (classement U25) ; meilleure nation = vainqueur de la
Coupe des nations (points cumulés individuels + relais). **À confirmer** par Guillaume,
notamment la limite d'âge du « meilleur jeune ».

**Pépite (§14) — mécanique corrigée par Guillaume, une par sexe.** Ce n'est pas un bonus fixe au
1er Top 10 : c'est un **pronostic caché**, actif sur chaque course individuelle jusqu'à son 1er
Top 10 de la saison. À ce moment-là, `computePepiteBonus` (cote de la course × multiplicateur de
rang, même barème que §1) calcule le score qu'elle aurait rapporté sur cette course, et ce score
s'ajoute en bonus au score du joueur (`applyPepiteBonuses` dans `scoreRace()`, indépendamment des
pronostics du joueur sur cette course). Ensuite, `bonus_claimed = true` et elle redevient un
athlète normal — plus aucun bonus automatique sur les courses suivantes. Une Pépite homme et une
Pépite femme par joueur/saison (`pepites` a désormais une clé `(user_id, season_id, sex)`, migration
`0015_pepites_per_sex.sql` — colonne `sex` ajoutée, backfillée depuis l'athlète, puis PK recréée).
Écran `/globes` : deux sélecteurs (Femmes / Hommes), chacun verrouillé une fois validé.

**Pépite cachée (04/11/2026, demande de Guillaume).** La Pépite s'appelle désormais « Pépite
cachée » (5 langues). Changements :
- **Éligibilité** : toutes les cotes courantes du biathlète pour la saison (sprint, poursuite,
  individuel, mass start, gros globe, meilleur jeune) doivent être ≥ 30, et non plus la seule cote
  du sprint (ex. Ponsiluoma : sprint 30 mais poursuite 15, donc plus éligible). Lecture de la
  règle confirmée par Guillaume le 04/11/2026.
  `isPepiteEligibleOdds` côté code, `pepite_is_eligible` côté base. `odds_at_pick` = la plus basse
  de ses cotes. Une Pépite déjà choisie qui n'est plus éligible peut être remplacée (le formulaire
  `/globes` se rouvre, la base l'autorise) ; sinon le choix reste définitif.
- **Hors des pronostics de saison** : l'accordéon « Mes pronostics de saison » ne compte plus que
  les 6 globes. Nouvel encadré permanent `HiddenPepiteCard` entre cet accordéon et la Série en
  cours (Femmes / Hommes, « Révélée » ou « Pas encore révélée », bouton « Choisir » si vide).
  L'invitation de l'accueil (8 choix sur `/globes`) compte toujours les 2 Pépites.
- **Visibilité** : inchangée côté base (0018, lisible par les autres seulement une fois
  `bonus_claimed`). Une fois révélée : ❄️ au classement (déjà en place) et son nom en haut du
  pop-up joueur (`SeasonView.pepites`).
- **Pas dans les pronostics de course** tant qu'elle n'est pas révélée : grisée dans le
  formulaire (« ta Pépite cachée »), refusée par la base (trigger `predictions_no_hidden_pepite`).
- **Résultat d'une course** (accueil, étape de la semaine, page de la course) : la révélation est
  mise en avant dans un encadré `PepiteReveal` (place, nom, points ajoutés), à la place de la
  ligne « Bonus Pépite » des extras ; ❄️ devant les points dans l'étape de la semaine. Affiché même
  sans pronostic sur la course. `score_ledger.breakdown.pepiteAthleteId` est enregistré depuis le
  04/11/2026 ; avant, la Pépite est retrouvée parmi les révélées classées dans le Top 10.
- **Points** : inchangés, `applyPepiteBonuses` ajoutait déjà les points de la Pépite (cote de la
  course × barème du rang) au score de la course de son premier Top 10.
- Migration **0035_pepite_cachee.sql** : fonctions/triggers `pepite_is_eligible`, `pepites_check`
  (éligibilité, sexe, choix définitif, `bonus_claimed` et `odds_at_pick` jamais fixés par le
  joueur) et `predictions_no_hidden_pepite`. Le back-office (service_role) n'est pas concerné.

**Classements annexes (Dossard Rouge) — une seule dimension implémentée, le reste mis en suspens.**
L'idée initiale de Guillaume était un classement par type de course (sprint/poursuite/individuel/
mass start/relais) ; **mise en suspens pour l'instant, à reprendre plus tard**. Seule la meilleure
série 10/10 en cours (`/classement`, section rouge) est implémentée aujourd'hui.

**Import CSV des cotes — première version (`/admin/import`), remplacée en octobre 2026 par un fichier unique (cf. « Réorganisation du back-office »).** En-têtes
confirmés par Guillaume : fichiers femmes/hommes (`nom, prénom, nationalité, globe, jeune, nation,
sprint, poursuite, individuel, mass, relais`) et fichier relais mixtes (`nation, mixte, simple`).
Crée les athlètes manquants, met à jour les cotes des existants (recherche par nom+prénom+nation),
déduplique les cotes de nation répétées par ligne. Ré-exécutable sans dupliquer (même mécanisme
`setCurrentOdds` que partout ailleurs). Testé en conditions réelles via un script ponctuel appelant
directement `importAthleteOddsCsv` (upload de fichier non automatisable avec les outils de test
actuels) — logique validée, écran `/admin/import` non testé interactivement par Claude.

**Corrigé en testant le grillage** : la policy RLS `predictions: update own before lock` ne
vérifiait en réalité jamais `locks_at` malgré son nom — un pronostic restait modifiable après le
départ de la course (migration 0010). Le grillage (§2) est maintenant implémenté : à chaque
pronostic soumis sur une course individuelle, `grilled_states` est entièrement remplacé pour
l'étape avec les 3 athlètes choisis (migration 0011 pour l'autoriser en écriture côté client) ;
l'écran de pronostic désactive les athlètes grillés. Le dégrillage au changement d'étape est
automatique par construction (`grilled_states` est scopé par `stage_id`) ; la carte "Fondue"
(dégrillage anticipé) reste à câbler une fois les cartes bonus construites.

**Grillage recalculé à partir des pronostics (27/10/2026)** : `grilled_states` mélangeait les
courses (il contenait toujours les choix du dernier pronostic enregistré, y compris celui de la
course affichée), ce qui grillait ses propres choix et empêchait de modifier un pronostic avant le
départ. Désormais l'écran de course calcule les grillés à la volée (`src/lib/grilling.ts`) : ce
sont les biathlètes choisis par le joueur sur la course individuelle précédente de la même étape,
**du même sexe** (les relais et les courses de l'autre sexe sont ignorés — *à confirmer*). La
carte Fondue est rattachée à la course où elle est jouée (`bonus_cards.used_on_race_id`) et y
supprime le grillage. Un biathlète grillé déjà présent dans le pronostic peut en être retiré. La
table `grilled_states` n'est plus utilisée (aucune migration nécessaire).

## Refonte UI — dashboard d'accueil et navigation basse

**Point de départ : demande de Guillaume de repartir de la structure de VéloPronos** (captures
d'écran de son dashboard réel) pour ne pas perdre les joueurs habitués à cette app sœur, tout en
gardant la palette hivernale propre à Biathlonpronos.

**Navigation basse — 6 entrées au lieu de 5** (`src/components/BottomNav.tsx`, désormais un
composant serveur async) : Accueil / Calendrier / Classement / Ma saison / Ligues, plus **Admin**
en 6e position, affiché uniquement si `profiles.is_admin` (vérifié à chaque rendu via une requête
Supabase dans le composant lui-même, pas de prop à faire descendre depuis chaque page). Le lien
Admin est un `<a>` natif (pas le `Link` i18n) car `/admin` est hors routing `[locale]`.

**Dashboard d'accueil refait** (`src/app/[locale]/page.tsx`) :
- Carte saison : badge "Saison {label}", nation favorite (si définie) avec drapeau emoji, rang +
  points au classement général, boutons "Classement" / "Ma saison". **Décision : pas d'équivalent
  à l'« équipe de cœur » de VéloPronos** (le vélo a des équipes trade en plus des nations ; le
  biathlon n'a que des équipes nationales, donc la nation favorite *est* déjà l'équivalent complet
  de "nation + équipe" côté vélo) — à confirmer par Guillaume si un autre sens était voulu.
- Section "En ce moment" : étape dont la date du jour tombe dans `[starts_on, ends_on]` (pas de
  statut "en cours" en base pour les courses, seulement `upcoming/locked/finished` — c'est une
  lecture de date sur l'étape, pas de la course).
- Section "Prochainement" : prochaine course non verrouillée (`locks_at` croissant), lien direct
  vers l'écran de pronostic.
- Aperçu du classement (top 5) + bouton vers `/classement` complet.
- Section "Dernier résultat" (`src/components/LastResultCard.tsx`, données `src/lib/lastResult.ts`,
  modèle VéloPronos) : dernière course notée (`status = finished`, `locks_at` passé selon l'horloge
  simulée), total de points, place du joueur sur la course (parmi les lignes `score_ledger` de la
  course, ex aequo à la même place), badges Bonus ×2 / carte, chacun de ses choix avec sa place et
  ses points (en rouge si négatifs), bonus hors athlète (combinaison, prono parfait, malus, aspiration,
  Pépite) puis le podium. Les points par athlète ne sont pas stockés : ils sont **reconstitués** depuis
  `score_ledger.breakdown` en rejouant les multiplicateurs du moteur (test qui vérifie l'égalité avec
  `computeIndividualRaceScore`). Masquée tant qu'aucune course n'est notée.
- Ancienne carte promo "Pronostics à 3 biathlètes / Gratuit" et liste brute des étapes à venir
  **supprimées** (remplacées par les sections ci-dessus, plus alignées sur VéloPronos).

**Nouveaux utilitaires partagés** :
- `src/lib/leaderboard.ts` — `getLeaderboard()` extrait de `classement/page.tsx` pour être
  réutilisé par la page d'accueil (calcul du rang du joueur) sans dupliquer l'agrégation.
- `src/lib/nationFlags.ts` — `nationFlagEmoji(code)`, table de correspondance alpha-3 (codes en
  base, style IOC) → alpha-2 (pour construire l'emoji drapeau), limitée aux nations habituelles de
  la Coupe du monde de biathlon. **À étendre si une nation absente de la table apparaît en base**
  (retombe sur un drapeau blanc 🏳️ par défaut, pas d'erreur).

**Pas encore fait (mis en suspens par Guillaume pour la suite, page par page)** :
- `/courses` ("Calendrier") reste la simple liste plate actuelle — Guillaume a demandé une vue par
  étape avec menu déroulant listant les courses de chaque étape, non construite dans cette passe.
- Contenu de l'onglet "Ma saison" : pointe pour l'instant vers l'écran `/pronos` existant, inchangé
  (mes pronostics en cours + à venir). Son contenu définitif reste à définir avec Guillaume — il a
  indiqué vouloir analyser chaque page une par une.
- En-tête (logo, drapeau langue, aide, profil) : le sélecteur de langue reste un composant flottant
  global (`LocaleSwitcher`, position ajustée pour ne plus chevaucher l'icône profil) plutôt qu'un
  vrai bouton "aide" inline comme sur les maquettes VéloPronos — pas construit, pas demandé encore.

## Prochaines étapes suggérées

1. ~~`npm install`, compilation, rendu.~~ Fait.
2. ~~Moteur de scoring courses individuelles.~~ Fait, testé, règles confirmées par Guillaume.
3. ~~Back-office de saisie des résultats + pilotage (saisons/athlètes/étapes/courses).~~ Fait, testé.
4. ~~Écrans classement, ligues, pronos.~~ Fait, testés.
5. ~~Modéliser et implémenter le pronostic relais.~~ Fait, testé.
6. ~~Grillage + verrouillage réel des pronostics après le départ.~~ Fait, testé.
7. ~~Cartes bonus dans l'UI joueur + bonus ×2 saison.~~ Fait, testé — choix du joueur au 10/10,
   confirmé par Guillaume.
8. ~~Import CSV des cotes.~~ Fait, logique testée contre la vraie base (écran non testé
   interactivement — upload de fichier non automatisable ici).
9. ~~Globes de saison + Pépite.~~ Fait, testé de bout en bout ; mécanique Pépite corrigée par
   Guillaume (pronostic caché par sexe, cf. ci-dessus). Reste : verrouillage base des globes avant
   le début de saison.
10. ~~Classements annexes.~~ Une dimension (meilleure série 10/10) implémentée ; le classement par
    type de course évoqué par Guillaume est mis en suspens pour l'instant.
11. Emplacements publicitaires et bannière de consentement cookies (prévus dans l'architecture,
    jamais posés dans le layout).
12. ~~Refonte du dashboard d'accueil + navigation basse à 6 entrées.~~ Fait (cf. section
    ci-dessus).
13. ~~Refonte du Calendrier (`/courses`) en accordéon par étape + 3 statuts de course.~~ Fait, cf.
    section ci-dessous. Reste à traiter page par page avec Guillaume : définition du contenu de
    "Ma saison", en-tête (aide/profil).

## Refonte du Calendrier (`/courses`) — accordéon par étape, 3 statuts de course

**Demande de Guillaume** : liste des étapes de la saison (accordéon), chaque étape dépliée montrant
ses courses ; clic sur une course pour aller pronostiquer ; 3 statuts de course déterminant
l'affichage (à venir / en cours / terminée).

**Étapes triées par date** (`stages.starts_on` croissant) — lu "triées par lieu et par date" comme
"chaque étape affiche son lieu et sa date, dans l'ordre chronologique de la saison" plutôt qu'un tri
composite, une étape ayant un lieu unique. **À confirmer par Guillaume si un autre sens était
voulu.** `src/app/[locale]/courses/CalendarAccordion.tsx` (composant client) gère l'ouverture/
fermeture ; l'étape ouverte par défaut est la première qui contient encore une course non terminée.

**3 statuts de course — dérivés, pas stockés.** `races.status` ne passe en réalité jamais à
`"locked"` en base (aucun cron ne l'écrit, seul `scoreRace()` écrit `"finished"`). Plutôt que
d'ajouter un mécanisme d'écriture (cron, trigger), le statut affiché est **calculé à la demande**
(`src/lib/raceStatus.ts`, `getRaceDisplayStatus`) : `finished` si `races.status === "finished"`,
sinon `ongoing` si `locks_at` est passée, sinon `upcoming`. Robuste par construction (pas de tâche
de fond à faire tourner), calculé côté serveur et passé en prop pour éviter tout écart
serveur/client sur `new Date()`.

**Affichage par statut** (`courses/[raceId]/page.tsx`, réécrite) :
- **À venir** : inchangé, le formulaire de pronostic (liste des biathlètes/nations + cotes).
- **En cours** : pronostics fermés — affichage en lecture seule des biathlètes (ou de la nation)
  pronostiqués avec leurs cotes, message dédié si le joueur n'a rien pronostiqué. Bouton "Saisir
  les résultats (admin)" vers `/admin/races/{raceId}` affiché uniquement si `profiles.is_admin`.
- **Terminée** : classement complet de la course (rang, nom, drapeau) + carte "Tes points sur
  cette course" lue directement dans `score_ledger` (le total déjà calculé, pas de recalcul ni de
  détail du breakdown affiché pour l'instant — simple et robuste).

**Bug corrigé en construisant cet écran** : la clé `"M"` du namespace `Sex` dans `messages/{fr,
en}.json` ne correspondait à rien (les codes sexe en base sont `"H"`/`"F"`), donc `tSex("H")`
échouait silencieusement (fallback next-intl) sur toute course/athlète homme — invisible jusqu'ici
car les données de test n'affichaient que des courses femmes. Corrigé (`"M"` → `"H"`).

**Ma saison (`/pronos`) — flèche de retour + courses classées par étape en accordéon.** Les deux
listes plates (« à pronostiquer » / « mes pronostics ») sont fusionnées en un seul accordéon par
étape (`pronos/PronosAccordion.tsx`, étapes triées par date) : chaque course y apparaît soit comme
« À pronostiquer » (ouverte, rien de validé), soit comme pronostic déposé (biathlètes/nation
choisis + points, ou « En attente »). Seules les étapes contenant au moins une de ces courses sont
listées ; l'étape ouverte par défaut est la première qui a une course à pronostiquer. Le contenu
définitif de « Ma saison » reste à préciser avec Guillaume. Flèche de retour aussi ajoutée dans le
back-office (`AdminNav`).

**Bouton retour et import CSV du calendrier (demandes complémentaires de Guillaume).**
- Flèche de retour vers l'accueil en haut à gauche de chaque onglet de la navigation basse
  (Calendrier, Classement, Ma saison, Ligues), à la demande de Guillaume.
- Bouton "Importer le calendrier (CSV)" en haut de `/courses`, visible uniquement si
  `profiles.is_admin` (même mécanisme que le lien Admin de la navigation basse). Fichier
  d'exemple fourni par Guillaume : calendrier IBU complet 2026-27 (12 étapes Coupe du Monde +
  Otepää en Championnats du Monde).
- `src/lib/admin/calendarImport.ts` (`importCalendarCsv`) : une ligne CSV = une course ; les
  lignes partageant le même lieu forment une étape (dates min/max, coefficient ×2 si la colonne
  Catégorie contient "Championnats"/JO). **Ré-exécutable sans dupliquer** : étape retrouvée par
  `(season_id, location)`, course par `(stage_id, format, sex)` — mis à jour si trouvée, créée
  sinon. Colonnes attendues : `Lieu (ville), Pays (pour code drapeau) [alpha-2], Date, Heure de
  départ UTC, Catégorie, Type de course, Sexe`. Le code pays alpha-2 est converti en code nation
  alpha-3 (`alpha2ToAlpha3` dans `nationFlags.ts`) ; toute nation absente de la table `nations`
  est créée automatiquement (nom depuis une table figée dans le code, à défaut le code lui-même).
- Sécurité : le bouton n'est visible qu'aux admins côté UI, mais comme `/courses` n'est pas
  protégée par le layout `/admin` (qui redirige les non-admins avant même de rendre la page), la
  Server Action `runCalendarImport` (`courses/actions.ts`) **revérifie `is_admin` elle-même**
  avant d'écrire — sans quoi n'importe quel utilisateur authentifié aurait pu appeler l'action
  directement.
- **Testé contre la vraie base** avec un CSV de 3 lignes synthétiques (nettoyé après coup) :
  création d'étape + 3 courses au bon format, ré-exécution sans duplication (0 créée / tout mis à
  jour au 2e passage). Le vrai fichier calendrier 2026-27 n'a volontairement pas été importé par
  Claude — Guillaume a indiqué vouloir le tester lui-même via l'écran.

## Page d'accueil visiteur (vitrine façon VéloPronos)

**Demande de Guillaume** : page d'accueil sur le modèle de celle de VéloPronos (captures d'écran de
velopronos.fr), avec la même typographie.

- **Typographie : Poppins partout** (titres et texte), comme VéloPronos, à la place de Sora +
  Work Sans. Chargée dans `src/app/[locale]/layout.tsx` via `next/font/google`, exposée dans
  `--font-poppins` ; les classes `font-display` / `font-body` pointent toutes deux dessus, donc
  aucun composant n'a eu à changer.
- Nouveau token `blue` dans `tailwind.config.ts` (bleu vif des accents VéloPronos), utilisé avec
  `ice` pour le dégradé de l'accroche et du bouton « Commencer gratuitement ».
- `src/components/landing/Landing.tsx` (+ `AppCarousel.tsx`, composant client) : accroche,
  « Comment ça marche ? » en 3 étapes, « Pourquoi jouer ? » (6 avantages), carrousel « Découvre
  Biathlonpronos », pied de page. Affichée par `src/app/[locale]/page.tsx` **uniquement aux
  visiteurs non connectés** ; un joueur connecté voit toujours le dashboard. Pas de navigation
  basse sur la vitrine (comme VéloPronos).
- Choix à confirmer : les badges App Store / Google Play sont affichés « Bientôt disponible » et
  non cliquables (pas d'app mobile) ; l'avantage « Mode cyclo gratuit » devient « 100 % gratuit »
  (pas de freemium) et « Mode Expert » devient « Globes de saison »  ; le carrousel montre
  des emojis, pas encore de vraies captures de l'app. Les deux boutons (« Commencer » et « Se
  connecter ») mènent à `/sign-in`, qui propose connexion et inscription.
- **Pied de page : Support, Politique de confidentialité, CGU** (liens obligatoires, comme sur
  VéloPronos), vers `/support`, `/confidentialite`, `/cgu`. La page Support reprend la
  page Support de VéloPronos (bandeau en dégradé, cartes contact / délai de réponse / types de
  demandes / aide) ; Confidentialité et CGU partagent `src/components/InfoPage.tsx`, et les trois
  utilisent le bandeau `src/components/PageHeader.tsx` ; leur texte est dans les namespaces `Support` / `Privacy` /
  `Terms` des fichiers `messages/*.json`. **À confirmer** : l'adresse de contact
  `contact@biathlonpronos.fr` (clé `Support.email`) est provisoire, et les textes de
  confidentialité et de CGU sont des brouillons à faire relire avant l'ouverture au public.
- **Politique de confidentialité reprise de celle de VéloPronos** (9 sections, capture fournie par
  Guillaume), adaptée : pas d'« équipe de cœur », connexion Google/Apple + e-mail/mot de passe
  (pas de Facebook), mention du jeu gratuit. Rendue par `InfoPage` (sections avec paragraphes,
  puces, encadré et lien de contact). **À confirmer** : connexion Google/Apple citée alors que
  l'OAuth n'est pas encore finalisé, notifications « si activées » (pas encore implémentées),
  suppression des données sous 30 jours.
- **CGU reprises de celles de VéloPronos** (12 sections, capture fournie par Guillaume), adaptées :
  application web (pas encore mobile), saison 2026-27, inscription e-mail/Google/Apple (pas de
  Facebook), lien vers le règlement, mention des changements de calendrier/résultats officiels
  dans la limitation de responsabilité. **À confirmer** : âge minimum 13 ans et droit français
  repris tels quels de VéloPronos.
- **Page de connexion** : « Connectez-vous pour continuer » sous le logo ; boutons Google, Apple
  et **Facebook** (ajouté à la demande de Guillaume), chacun avec son logo. Facebook réintégré
  dans la Politique de confidentialité et les CGU. **Prérequis** : le fournisseur Facebook doit
  être activé dans Supabase (Authentication > Providers > Facebook, avec l'App ID et le secret
  d'une app Meta for Developers), comme Google et Apple ; sans ça le bouton renvoie une erreur.
  Depuis le 02/11/2026, la page vérifie avant de partir (`/auth/v1/settings` de Supabase) que le
  fournisseur est activé et affiche sinon « La connexion avec X n'est pas encore disponible » au
  lieu de la page d'erreur brute de Supabase. `/auth/callback` renvoie les échecs (refus,
  compte sans e-mail, code expiré) vers `/sign-in?oauth_error=…`, affichés sous les boutons.
  Le bouton Facebook est **masqué** depuis le 02/11/2026 (Meta bloque l'inscription développeur de
  Guillaume) : ligne commentée dans `sign-in/page.tsx`, à réactiver plus tard. Facebook est aussi
  retiré de la Politique de confidentialité et des CGU (5 langues) ; à y remettre si on le réactive.
- **Calendrier : étape des Mondiaux en doré.** Dans `CalendarAccordion`, une étape à
  `coefficient = 2` (déjà la convention « Mondiaux / JO » de la table `stages`) a un encart doré,
  le libellé « Championnats du monde » et son lieu en or. Pas de nouvelle colonne : il suffit que
  l'étape soit saisie avec le coefficient 2 (cas d'Otepää 2027).
- **Pas de course spéciale sur les Mondiaux / JO** (décision de Guillaume, 04/11/2026). Le back-office
  grise les malus et la Fête nationale sur une étape à coefficient 2, refuse côté serveur d'en créer
  (`createRace`, `updateRace`) et refuse de passer en coefficient 2 une étape qui en a déjà.
- **Accueil, « L'étape de la semaine » : étapes et courses spéciales signalées** (04/11/2026), comme
  dans Ma saison : en-tête doré « Championnats du monde » + « Coeff. ×2 », bandeau rouge des malus /
  doré de la Fête nationale sur chaque course, badge « Bonus ×2 actif ». Fête nationale : badge doré
  « ×2 » (sans 🎉) à côté du biathlète de l'équipe favorite qui a marqué.
- **Choix de la langue par drapeaux, en haut de chaque onglet** (comme VéloPronos) : bouton rond avec
  le drapeau de la langue courante, qui déroule les autres drapeaux (`LocaleSwitcher`, drapeaux
  en SVG car Windows n'affiche pas les emojis drapeaux). Affiché dans l'en-tête du dashboard (à
  côté du profil) et en haut à droite de la vitrine. **Le sélecteur FR/EN flottant présent sur
  toutes les pages a été retiré** : la langue se choisit depuis l'Accueil, puis reste dans l'URL.
- **5 langues : FR, EN, DE, IT, ES.** Menu déroulant de langue « drapeau + nom » (Français,
  English, Deutsch, Italiano, Español), langue courante cochée. `messages/de.json`, `it.json`,
  `es.json` ont été traduits par Claude depuis l'anglais/le français : **à faire relire**, en
  particulier les noms du jeu (cartes, dossards, Pépite, grillage, courses spéciales) et les
  textes légaux. Le bonus « Aspiration » / « Draft » porte un seul nom par langue
  (Windschatten-Bonus, bonus Scia, etc.).
- `src/components/HeaderActions.tsx` (langue + profil) est placé à droite du titre de chaque
  onglet de la navigation basse : Accueil, Calendrier, Classement, Ma saison, Ligues.
- **Page Profil (`/compte`) refaite sur le modèle de VéloPronos** : avatar (initiale du pseudo),
  pseudo et email ; notifications par email et apparence (interrupteurs **non fonctionnels**,
  marqués « Bientôt ») ; équipe favorite et cartes bonus (inchangés) ; langue (pastilles drapeau
  + nom, fonctionnelles) ; liens Aide & Règlement et Support ; déconnexion ; « Supprimer mon
  compte » ouvre un email au support (pas de suppression automatique). Pas de section « Mode de
  jeu » (pas de freemium sur Biathlonpronos) ni « Mes messages » (remplacé par Support).
- **Pseudo modifiable** via le crayon (`compte/PseudoEditor.tsx`, 2 à 20 caractères, contrôle
  côté interface uniquement). **Migration 0016 à coller dans Supabase** : la policy « profiles:
  update own » laissait un joueur modifier n'importe quelle colonne de son profil, y compris
  `is_admin` ; la migration limite la mise à jour côté client à la colonne `pseudo`.
- **Thème clair / sombre fonctionnel** (Profil > Apparence). Les couleurs de `tailwind.config.ts`
  pointent vers des variables CSS (`src/app/globals.css`) : palette sombre par défaut, palette
  claire sous `html.light`. Le choix est mémorisé dans le navigateur (localStorage `theme`) et
  réappliqué avant l'affichage par un petit script dans `src/app/[locale]/layout.tsx`. Le choix
  n'est pas lié au compte (à changer sur chaque appareil). Le back-office `/admin` reste sombre.

### Thème clair aux couleurs de VéloPronos (octobre 2026)

Le thème clair reprend la palette chaude de VéloPronos : fond beige (#f1ece4), cartes blanches,
barre de navigation basse blanche (token `nav`), texte brun foncé, et l'accent `ice` devient ocre
(interrupteurs, pastille de langue, onglet actif, boutons). Le texte posé sur cet accent passe par le
token `on-ice` (foncé en thème sombre, blanc en thème clair). Les dégradés de marque (avatar,
en-têtes, bouton « Commencer gratuitement ») gardent le bleu → turquoise fixe (`teal`) dans les deux
thèmes, comme VéloPronos. Le back-office `/admin` reste sombre.

### Thème clair en tons bleus (novembre 2026)

À la demande de Guillaume, le thème clair quitte le beige et l'ocre de VéloPronos pour des tons
« glace » : fond bleu très clair (#eaf2fb), cartes blanches, texte bleu nuit, accent `ice` bleu
foncé (boutons, en-têtes d'étape, onglet actif) et `gold` bleu vif (points, saison, série, cartes
bonus). Le texte posé sur un fond `gold` passe par le nouveau token `on-gold` (brun foncé en thème
sombre, inchangé ; blanc en thème clair). Le thème sombre n'est pas modifié.

### Ma saison : étapes repliées et Championnats du monde dorés (octobre 2026)

Dans l'onglet Ma saison, toutes les étapes sont repliées à l'arrivée (avant, la première étape à
pronostiquer s'ouvrait). L'étape de coefficient 2 (Otepää) reprend l'encart doré du Calendrier avec
la mention « Championnats du monde · Coeff. ×2 » ; la pastille « Coeff. ×2 » séparée est retirée
pour ne pas déborder sur mobile.

### Back-office : page « Joueurs & rôles » (octobre 2026)

`/admin/joueurs` liste les joueurs (pseudo, email lu dans Supabase Auth via la clé service_role),
avec une recherche et un bouton pour donner ou retirer le rôle d'admin (`profiles.is_admin`). La
Server Action `setAdminRole` revérifie que l'appelant est admin (`src/lib/admin/requireAdmin.ts`),
car une Server Action peut être appelée sans passer par le layout `/admin`. Un admin ne peut pas se
retirer son propre rôle, pour ne pas se fermer l'accès au back-office.

### Horloge simulée pour l'admin (octobre 2026)

Page `/admin/horloge` : un admin règle une date/heure fictive, en heure de Paris (saisie libre,
raccourcis « la veille à 20 h / 5 min avant / 5 min après » le départ d'une course, +1 h / +1 jour /
+1 semaine). Le décalage avec l'heure réelle est stocké dans `profiles.simulated_clock_offset_ms`
(migration 0017, écrit par le back-office avec la clé service_role, non modifiable côté client) ;
la pendule simulée continue donc d'avancer. Un cookie `bp_sim_offset` sert seulement au bandeau doré
d'avertissement et à éviter une requête au profil quand rien n'est simulé.

- Affichage : `getClock()` (`src/lib/clock.ts`) renvoie l'heure simulée pour un admin, l'heure réelle
  pour tous les autres. Statut des courses, formulaire de prono, « En ce moment » et « Prochainement »
  de l'accueil, courses ouvertes de Ma saison, verrouillage des globes.
- Base : `effective_now()` ajoute ce décalage à `now()` pour un admin ; les policies d'écriture des
  pronostics l'utilisent à la place de `now()`. Un admin peut donc saisir des pronos sur une saison
  passée pour la tester (demandé par Guillaume, octobre 2026). Les joueurs ne sont jamais concernés.

Limites : tout ce qui est saisi pendant une simulation est réel (pronos de l'admin, résultats saisis
dans le back-office). Une fois le jeu lancé, un admin qui oublie de revenir à l'heure réelle peut
enregistrer des pronos hors délai. Le décalage est lié au profil : il s'applique en base sur tous les
appareils de l'admin, mais le bandeau n'apparaît que sur le navigateur qui a réglé l'horloge.

Effet de bord voulu : « Prochainement » (accueil) ignore désormais les courses dont l'heure de départ
est passée mais pas encore notées (avant, une course en cours restait affichée comme prochaine).

« En ce moment » (accueil) : l'étape dont les dates encadrent le jour (simulé ou réel), même si sa
prochaine course n'a pas commencé (essai d'un affichage limité aux courses en cours, annulé à la
demande de Guillaume, octobre 2026).

Heures : tout l'affichage joueur est en heure de Paris (`src/lib/displayTimeZone.ts`), quel que soit
le fuseau du serveur ou du navigateur. L'import/export CSV du calendrier et les champs admin restent
en UTC (choix de Guillaume) : les heures du CSV doivent être saisies en UTC.

## Réorganisation du back-office (octobre 2026)

**Demande de Guillaume** : moins d'onglets, CSV dans chaque onglet, courses triées par étape.
Menu : **Calendrier** · **Athlètes & cotes** · **Résultats & globes** (`/admin`) · Joueurs & rôles ·
Horloge simulée. Supprimés : Saisons, Étapes & courses, Cotes de relais, Import CSV, Globes de saison
(leur contenu est repris ci-dessous). Toutes les Server Actions et routes d'export du back-office
revérifient `is_admin` (`requireAdmin`), le layout `/admin` ne protégeant que l'affichage.

**Calendrier** (`/admin/calendrier`) : saisons (création, activation) + étapes de la saison active en
accordéon, avec leurs courses et un formulaire d'ajout de course. Import CSV (même format et même
logique `importCalendarCsv` que le bouton de `/courses`, réimportable, ne supprime jamais rien) et
export au même format (`/admin/calendrier/export`), réimportable tel quel.

**Athlètes & cotes** (`/admin/athletes`) : filtres nation et sexe (paramètres d'URL), une carte par
nation avec relais mixtes, puis par sexe la ligne équipe (relais + meilleure nation) et le tableau
des athlètes (sprint, poursuite, individuel, mass start, globe, jeune), chaque ligne modifiable
(case vidée = cote retirée). **Fichier CSV unique** (`src/lib/admin/oddsCsv.ts`), séparateur `;`
ou `,`, en-têtes :
`Type;Nation;Sexe;Nom;Prénom;Relais mixte;Relais mixte simple;Relais;Meilleure nation;Sprint;Poursuite;Individuel;Mass start;Globe;Jeune`.
Par nation, dans l'ordre demandé par Guillaume : ligne `Nation` (relais mixte, mixte simple),
ligne `Équipe` F (relais, meilleure nation), lignes `Athlète` F, ligne `Équipe` H, lignes
`Athlète` H. L'import se fie aux colonnes Type/Sexe, pas à l'ordre ; Type vide = déduit (nom
renseigné → athlète, sexe seul → équipe, sinon nation). Export (`/admin/athletes/export`) au même
format, réimportable.
- **L'import remplace toutes les cotes courantes de la saison** (demande de Guillaume : « un csv
  qui efface le csv précédent ») : les anciennes sont historisées (`valid_until`), pas supprimées,
  et remises en place si l'écriture des nouvelles échoue. Un fichier avec la moindre erreur
  (nation inconnue, cote non entière, doublon, sexe manquant) n'écrit rien. Nations absentes de la
  table créées si leur nom est connu (`NATION_NAMES`).
- **À confirmer** : les athlètes absents du nouveau fichier ne sont pas supprimés (ils peuvent
  figurer dans des pronostics, résultats, Pépites) ; ils restent en base sans cote, donc ne sont
  plus proposés aux joueurs, et sont marqués « sans cote » dans le tableau.
- **À confirmer** : la cote « meilleure nation » (par sexe) est placée sur la ligne Équipe, avec
  la cote relais du même sexe.
- Attention : réimporter entre le sprint et la poursuite d'une étape écrase les cotes poursuite
  recalculées à partir des écarts du sprint (§4) par celles du fichier.
- Corrigé au passage : `setCurrentOdds` filtrait les relais mixtes sur `nation_sex = undefined` au
  lieu de `nation_sex is null` (requête invalide pour les cotes mixtes).
- Les lectures de cotes passent par `fetchAll` : Supabase plafonne une requête à 1000 lignes, seuil
  dépassé par une saison complète (≈ 6 cotes par athlète).

**Résultats & globes** (`/admin`) : étapes en accordéon comme le Calendrier joueur (ouverte : la
première avec une course non saisie), courses triées par heure, puis une section dépliable
« Globes de saison ». Sur la page d'une course, **import CSV des résultats**
(`src/lib/admin/resultsCsv.ts`) : `Rang;Nom;Prénom;Nation;Écart (s);Tours de péna;Fusée;Gâchette`
(relais : `Rang;Nation`). Alternatives acceptées : colonne `Athlète` (nom complet, dans un ordre
ou l'autre), `Fautes` (0 = Gâchette), écart en `m:ss.s`, nation en toutes lettres pour un relais.
Noms comparés sans accents ni casse. Le CSV **ne fait que pré-remplir le tableau** : l'admin relit
puis clique « Enregistrer et calculer les scores » (même chemin que la saisie manuelle). Bouton de
téléchargement du modèle (candidats ayant une cote, avec la saisie en cours). Format pensé pour être
généré par une IA à partir du classement officiel IBU.

**Récupération des résultats officiels IBU (octobre 2026, choix de Guillaume plutôt qu'une IA).**
Bouton « Récupérer les résultats officiels IBU » sur la page d'une course (`src/lib/admin/ibuResults.ts`,
action `loadIbuResults`). Lit l'API JSON publique du datacenter IBU (`biathlonresults.com/modules/sportapi/api`,
celle qu'utilise leur propre site, sans clé) : `Events` (saison `2627` déduite du label `2026-27`,
niveau 1 = Coupe du monde, Mondiaux, JO) → étape qui recouvre les dates de la nôtre (le lieu
départage) → `Competitions` → course de même discipline (SP, PU, IN, MS, RL, SR) et catégorie (SW,
SM, MX) la plus proche de l'heure de départ → `Results`. Converti au format du CSV de résultats et
appliqué comme un import : le tableau est pré-rempli, **l'admin relit puis valide les points**.
Gâchette = 0 faute (`ShootingTotal`), Fusée = rang 1 de l'analyse temps de ski (`AnalyticResults`
TypeId `CRST`, sinon à cocher à la main), écart = `Behind`, DNF/DNS ignorés, relais = lignes
d'équipe. Les noms sont comparés aussi sous forme translittérée (Öberg = OEBERG, Bø = BOE). Champ
facultatif pour forcer l'identifiant IBU de la course si la correspondance automatique échoue.
- **Non testé contre l'IBU depuis l'environnement de Claude** (accès réseau refusé) : structure de
  l'API reprise de son usage connu, logique de correspondance couverte par des tests unitaires. À
  vérifier en vrai sur la préversion Vercel. Conditions d'utilisation de l'API IBU non vérifiées.

**Calendrier & résultats fusionnés (octobre 2026, demande de Guillaume).** Un seul onglet `/admin`
(`/admin/calendrier` y redirige) : menu Calendrier & résultats · Athlètes & cotes · Joueurs & rôles ·
Horloge simulée.
- **Saisons** : chaque saison se déplie sur ses 6 globes de saison à compléter (classement final).
  Rien n'est créé en base à la création d'une saison : les formulaires de globes sont affichés
  d'office pour chaque saison et n'écrivent qu'à l'enregistrement d'un classement.
- **Étapes & courses** : chaque course garde son statut (à venir / résultats à saisir / résultats
  saisis, même règle que le Calendrier joueur, horloge simulée comprise), avec un crayon (page de la
  course : modification format, sexe, heure UTC, course spéciale + saisie des résultats) et une
  poubelle rouge (avec confirmation). Chaque étape a aussi son crayon (04/11/2026,
  `admin/stages/[stageId]`, action `updateStage`) : lieu, pays, dates, coefficient ×1/×2. Changer le
  coefficient d'une étape déjà notée ne recalcule pas les points (message d'avertissement affiché) :
  il faut réenregistrer les résultats des courses concernées.
- **Réinitialiser les résultats** (page de la course, `resetRaceResults`) : efface les résultats et
  les points de la course (`score_ledger`), rend le bonus Pépite s'il avait été gagné dessus, repasse
  la course « à venir ». Séries 10/10 et cotes poursuite recalculées (cf. ci-dessous).
- **Supprimer une course** (`deleteRace`) : réinitialisation puis suppression ; pronostics supprimés
  par cascade, carte bonus jouée dessus détachée de la course mais laissée consommée.

**Corrections de résultats : séries et cotes poursuite recalculées (octobre 2026, demande de
Guillaume, ex. disqualification après le premier classement IBU).**
- **Séries 10/10** : après chaque notation, ressaisie, réinitialisation ou suppression, toute la saison
  est rejouée (`recomputeSeasonStreaks`, `computeSeasonStreaks`) : courses notées dans l'ordre des
  départs, points des pronostics hors bonus Pépite, un joueur sans prono sur une course n'est pas
  compté (comme avant). Remplace la mise à jour incrémentale, qui réincrémentait la série à chaque
  ressaisie. `cards_earned` est recalculé aussi ; une carte déjà choisie par un joueur reste acquise
  même si le recalcul lui en retire le crédit (à confirmer).
- **Cotes poursuite** : avant de remplacer ou d'effacer les résultats d'un sprint, la cote poursuite
  de chaque athlète qui avait un écart reprend sa dernière valeur antérieure à la saisie précédente
  (`restorePursuitOdds`), puis le recalcul se fait avec les nouveaux écarts. Si la poursuite de
  l'étape était déjà notée, elle est renotée automatiquement avec ses nouvelles cotes.
- **Notation rejouable** : `scoreRace` efface d'abord les points de la course et rend le bonus Pépite
  gagné dessus. Corrigé au passage : le bonus Pépite était écrasé par les points du pronostic quand
  le même joueur avait aussi pronostiqué la course (il est maintenant appliqué après).

**Suppression d'une saison ou d'une étape (octobre 2026).** Poubelle rouge sur chaque saison et chaque
étape de `/admin`. Étape : chaque course est supprimée via `deleteRace` (points, cartes, séries
recalculées), puis l'étape (`deleteStage`). Saison : suppression en base, la cascade efface tout ce
qui en dépend (étapes, courses, athlètes, cotes, pronostics, résultats, points, ligues, cartes,
Pépites) ; il faut retaper le label de la saison pour confirmer.

## Accueil et page de pronostic — lot « page par page » (fin octobre 2026)

**Accueil.** L'encart « En ce moment » devient « L'étape de la semaine » (`WeekStageCard`,
`src/lib/weekStage.ts`) :
- étape affichée : celle en cours (dates de l'étape, jour de Paris), sinon celle qui commence dans
  les 7 jours (à confirmer) ;
- le badge « En ce moment » n'apparaît que si une course de l'étape part aujourd'hui (heure de Paris) ;
- une ligne par course « en cours » (départ passé, pas encore notée) avec les biathlètes ou la nation
  pronostiqués, ou « Pas de pronostic sur cette course ».
« Prochainement » devient « À suivre » (`NextRaceCard`) avec un compte à rebours jusqu'au départ
(= verrouillage), qui part de l'horloge du serveur (horloge simulée de l'admin comprise). Si le
joueur n'a pas encore pronostiqué cette course, un bouton « À jouer » s'affiche dans la carte
(demande de Guillaume), sinon la mention « Pronostic validé ».

**Page de pronostic d'une course.** Encart « Mon pronostic » en haut (`PredictionSummary`) : les choix
en cours avec une croix rouge pour retirer chacun, le bouton « Activer mon bonus ×2 » (nombre restant
sur la saison, mis à jour en direct) et « Valider mon pronostic ». Retirer un choix ne supprime rien en
base : le pronostic enregistré reste valable tant que le joueur n'a pas revalidé (un message le
rappelle). Le choix de carte bonus (Balle de pioche, Ça farte) reste sous la liste.

**Saisie et affichage des résultats (fin octobre 2026).** Back-office d'une course : bouton
« Enregistrer et calculer les scores » en haut et en bas du tableau, lien retour vers la page
publique de la course. Page d'une course notée (`getRaceResult` dans `src/lib/lastResult.ts`,
partagé avec l'encart « Dernier résultat ») : le pronostic du joueur dans l'ordre d'arrivée, avec la
place et les points de chaque choix, les bonus de course, et le classement complet avec les points du
barème (cote × rang + Fusée/Gâchette, sans les multiplicateurs propres à chaque joueur) pour le
Top 10 (Top 5 en relais) et pour tout athlète Fusée/Gâchette. Pictos 🚀 Fusée et 🎯 Gâchette.
Les points du barème utilisent les cotes en vigueur, comme le calcul des scores.

**Pronostic d'une poursuite.** Liste des biathlètes par ordre de départ (classement du sprint de
l'étape, même sexe ; les non-classés ensuite, par cote), affichage par défaut, ou par cote ; en tri par
cote, la position de départ reste affichée à côté de la nation. Les cotes
affichées sont les cotes poursuite réévaluées après le sprint.

**Fusée et Gâchette selon le format (fin octobre 2026, demande de Guillaume, conforme au §15 du
règlement).** La Fusée ne compte qu'au sprint et à l'individuel, la Gâchette (20/20 au tir) qu'à la
poursuite et à la mass start (`src/lib/scoring/fuseeGachette.ts`). La règle est appliquée à la saisie
(colonnes masquées dans le back-office, cases ignorées à l'enregistrement et à l'import IBU) et à la
lecture des résultats (calcul des points, affichage), pour que d'anciennes cases cochées sur un autre
format ne rapportent rien. Les courses déjà notées gardent leurs points tant qu'elles ne sont pas
renotées.

**Accueil, 2e passe.** Compte à rebours de « À suivre » en bas à droite, sous la date. « Derniers
résultats » (demande de Guillaume) : la dernière course notée de chaque sexe reste affichée 48 h
après son départ, un nouveau résultat du même sexe remplaçant le précédent ; une carte par course,
dans l'ordre des départs (`pickLastResultRaces`). Relais mixtes : catégorie à part, gardée 48 h elle
aussi (à confirmer). Sans aucun résultat dans les 48 h, la dernière course notée reste affichée seule
(à confirmer). La légende Fusée/Gâchette est masquée
sur l'accueil (gardée sur la page d'une course).
La barre d'onglets du bas (`BottomNav`) est figée en bas de l'écran pendant le défilement
(`sticky bottom-0`), sur toutes les pages qui l'affichent.

**Bouton « i » sur la page d'une course (fin octobre 2026).** En haut à droite, il ouvre une fenêtre
« Comment ça marche ? » qui résume la règle du format (`RuleInfoButton`, textes `RuleInfo.*` en
5 langues) : barème Top 10 et bonus Top 3/5/10 pour les courses individuelles, Fusée (sprint,
individuel) ou Gâchette (poursuite, mass start), départ de la poursuite, biathlètes grillés ; relais :
une équipe, points dans le Top 5 (règlement §5, alors que l'exemple de Guillaume parlait du podium) ;
bonus ×2 pour tous. Lien vers le règlement complet.
Puis, à la demande de Guillaume, le « i » devient un « ? » placé à côté du titre « Choisis une
nation » / « Choisis tes biathlètes » ; il ne reste en haut à droite que quand aucun formulaire n'est
affiché (course en cours, terminée, ou sans cotes).
Validation : quand le pronostic affiché est celui enregistré (y compris à l'ouverture de la page), la
mention « Ton pronostic est validé ! » remplace le bouton « Valider mon pronostic », qui revient dès
qu'un choix, le bonus ×2, la carte ou la cible du ×3 change.

## Fusion Calendrier + Ma saison (fin octobre 2026)

Demande de Guillaume : l'onglet « Ma saison » (`/pronos`) disparaît de la barre du bas, son contenu
passe dans le Calendrier (`/courses`), sur le modèle de l'accordéon du Calendrier. `/pronos` redirige
vers `/courses` (avec `?etape=`, qui déplie et fait défiler jusqu'à l'étape, utilisé par « L'étape de
la semaine » de l'accueil). Chaque course affiche désormais, en plus de sa date et de son statut :
les biathlètes (ou la nation) pronostiqués, le badge Bonus ×2, les points une fois notée, et un bouton
« À jouer » sous la date pour une course à venir sans pronostic. L'en-tête d'étape compte les courses
« à jouer ». En haut, l'accordéon « Mes pronostics de saison » (replié par défaut) récapitule les
6 globes et les 2 Pépites, avec un lien vers `/globes`. Le bouton « Ma saison » de l'accueil mène au
Calendrier. L'onglet de la barre du bas (`/courses`) s'appelle désormais « Ma saison » (clé
`Nav.stages`, le titre de la page reste « Calendrier »).

## Classement : série en cours et pop-up joueur (fin octobre 2026)

**Série en cours.** La notion de « Dossard Rouge » disparaît du Classement. Le joueur connecté voit
sa carte « 🔥 Série en cours x / 10 » (10 segments, « Plus que N courses pour une carte bonus »),
sur le modèle de la capture VéloPronos fournie par Guillaume. En dessous, la liste « Meilleures
séries en cours » (top 10) est gardée, aux couleurs neutres (choix pragmatique, à confirmer : la
demande parlait de l'habillage, pas de retirer la liste).

**Pop-up joueur.** Un clic sur un joueur (classement général ou séries) ouvre sa page « Ma saison »
en lecture seule : « Pronostics de saison » replié, puis ses étapes en accordéon avec pronostics,
bonus ×2 et points (`getSeasonView` dans `src/lib/seasonView.ts`, partagé avec `/courses` ;
Server Action `getPlayerSeason`). Pour qu'on ne puisse pas copier (à confirmer) : les pronostics
d'un autre joueur n'apparaissent qu'une fois la course partie, ses globes une fois la saison
commencée, et sa Pépite seulement une fois révélée (bonus obtenu), puisque c'est un pronostic caché.
Migration **0018** (règles de lecture Supabase correspondantes) à coller par Guillaume ; tant
qu'elle n'est pas appliquée, le pop-up d'un autre joueur s'affiche sans ses pronostics.

## Page d'une course terminée et noms abrégés (fin octobre 2026)

- **Points par ligne sans le ×2.** Dans « Mon pronostic », chaque choix affiche ses points sans le
  bonus ×2 perso ni le coefficient ×2 Mondiaux/JO (ex. Horn 140, Wright 51). Ce que le ×2 a
  rapporté est affiché à part, sous « Tes points sur cette course » (« Bonus ×2 actif · +191 pts ») ;
  le total (382) ne change pas. Même chose dans « Derniers résultats » de l'accueil. Ça farte ×3 et
  Team Nation ×2 restent comptés sur la ligne concernée. (`prediction.multiplier` dans `lastResult.ts`.)
- **Prono parfait.** Les 3 lignes au plus fort score du barème (Top 10, Fusée/Gâchette comprises,
  même calcul que `computeBestPossibleTrio`) ont une étoile ⭐ et un contour doré (`markPronoParfait`).
  Pas d'étoile sur les relais (pas de Prono parfait).
- **Résultats repliés.** Top 10 + les choix du joueur classés plus loin, puis « Voir tout le
  classement ».
- **Classement des joueurs.** Sous les résultats, les 10 meilleurs joueurs sur cette course (+ la
  place du joueur s'il est plus loin), déroulant pour la suite, ex æquo à la même place
  (`racePlayers.ts`). À confirmer : « classement de l'étape » interprété comme les points sur cette
  course, pas le cumul de toutes les courses de l'étape.
- **Noms abrégés.** `shortAthleteName` (`src/lib/athleteName.ts`) : initiale du prénom + nom ; un
  nom composé garde son premier nom entier et l'initiale des suivants (« J. Dale-S. »,
  « Q. Fillon M. »). Utilisé partout où les noms courts s'affichent ; les lignes étroites tronquent
  aussi proprement au lieu de déborder.

**Série en cours déplacée (fin octobre 2026).** À la demande de Guillaume, la carte « Série en
cours » quitte le Classement (où reste la liste « Meilleures séries en cours ») : elle est sur
l'accueil sous les boutons Classement / Ma saison, et dans Ma saison entre « Mes pronostics de
saison » et les étapes (`StreakCard`, `getCurrentStreak`). Le pop-up d'un joueur affiche en haut
sa place et ses points au classement général et son équipe favorite, puis ses pronostics de
saison, sa série en cours, et ses étapes. Migration **0019** : lecture des équipes favorites
ouverte à tous (rien à copier), à coller par Guillaume.

**Série remise à zéro à chaque saison (04/11/2026).** Le compteur `streak_counters` est propre à
chaque saison (clé `user_id, season_id`) : une nouvelle saison part toujours de zéro. Mais un
compteur peut rester en base alors qu'aucune course de la saison n'est plus notée (course de test
notée puis supprimée ou repassée « à venir » hors de l'admin, directement dans Supabase), d'où une
série 1/10 affichée avant le début de saison. Désormais `getCurrentStreak` renvoie `null` tant
qu'aucune course de la saison n'a le statut « finished » (`seasonHasFinishedRace`) : la carte
« Série en cours » (accueil, Ma saison, pop-up joueur) et « Meilleures séries en cours » du
Classement n'apparaissent qu'après la 1re course notée. La 1re notation recalcule ensuite toutes
les séries de la saison (`recomputeSeasonStreaks`) et remet les compteurs périmés à zéro.

## Courses malus et titre « Ma saison » (fin octobre 2026)

- **Admin** : « Brouillard » ne peut être choisi que pour un sprint ou une individuelle (option
  grisée dans le formulaire selon le format, revérifié par les actions serveur ;
  `SPECIAL_RULE_FORMATS` dans `admin/_components/labels.ts`).
- **Ma saison** : une course malus a un bandeau et un contour rouges « Course malus · <nom> » avec
  un picto par malus (modèle VéloPronos) : 🔁 Tour de péna, 🌫️ Brouillard, 📉 T'es collé(e)
  (`src/lib/specialRules.ts`, pictos à confirmer). La page de la course reprend le picto et le nom
  traduit, en rouge.
- Le titre en haut de `/courses` devient « Ma saison » (comme l'onglet).
- **Derniers résultats** (accueil) : le plus récent est toujours en haut.

## Course en cours, flèche retour, série dans l'encadré Saison (fin octobre 2026)

- **Accueil** : la série en cours passe en version réduite en bas de l'encadré « Saison »
  (`StreakCard compact`), plus de carte séparée.
- **Flèche retour d'une course** : revient à la page consultée juste avant (`BackButton` +
  `NavigationTracker`, qui compte les pages vues dans l'onglet), sinon à Ma saison.
- **En-tête d'une course** : le nom de la course quitte la barre du haut ; l'encadré affiche le
  drapeau de l'étape, le lieu et le nom de la course.
- **Course en cours** : sous « Mon pronostic », le classement général de tous les joueurs avec,
  sous chaque nom, son pronostic sur cette course (« Pas de pronostic » sinon) ; les joueurs sans
  points mais qui ont pronostiqué suivent à 0 pt (`getOngoingBoard`). Repose sur la migration 0018
  (pronostics lisibles une fois la course partie).
- **Page d'une course (suite)** : bonus Top 3/5/10 ou Prono parfait en bandeau vert au-dessus des
  choix (token `green`, modèle « Bonus Musette » VéloPronos) ; encadré du haut avec drapeau, lieu,
  nom de l'épreuve, date et heure ; boutons « Course préc. » / « Course suiv. » au milieu de la
  barre du haut (ordre chronologique de la saison, grisés en début/fin de saison).

## Classement : filtres Général / Ligue et Saison / Par étapes (fin octobre 2026)

En haut du Classement, deux paires de boutons (`classement/StandingsFilters.tsx`), portées par
l'URL (`?portee=ligue&ligue=…&periode=etapes&etape=…&course=…`) pour qu'un lien garde le filtre :

- **Général / Ligue.** « Ligue » ouvre un menu déroulant des ligues du joueur pour la saison active
  (première par ordre alphabétique par défaut). Les membres sans point y figurent à 0. Sans ligue,
  un encadré renvoie vers l'onglet Ligues.
- **Saison / Par étapes.** « Saison » : classement général (globes compris), comme avant ; la liste
  « Meilleures séries en cours » n'apparaît qu'en Général + Saison. « Par étapes » : un menu des
  étapes (par défaut la dernière étape commencée) et un menu des courses (« Toute l'étape » par
  défaut, ou une seule course). Les points sont ceux des courses de l'étape seulement.
- **Pronostics des joueurs.** Étape en cours (une course partie et une pas encore notée) : sous
  chaque joueur, ses pronostics sur les courses déjà verrouillées de l'étape. Une course choisie
  seule : ses pronostics dès qu'elle est verrouillée, même si l'étape est finie. Jamais sur une
  course pas encore partie (migration 0018). **À confirmer** : menus déroulants plutôt qu'une liste
  dépliée des étapes ; pronostics masqués sur une étape entièrement terminée.

Code : `src/lib/standings.ts` (`buildStandings`, `isStageOngoing`, `pickDefaultStandingsStageId`,
testés). Aucun SQL : ligues, adhésions, score_ledger et pronostics verrouillés sont déjà lisibles.

## Étape de la semaine, ouverture à J-7, légende et pop-up joueur des résultats (fin octobre 2026)

- **« L'étape de la semaine »** (`pickWeekFeature`, testé), par ordre de priorité : courses en
  cours (badge « En ce moment ») ; sinon le dernier résultat noté aujourd'hui, affiché sous
  l'encadré jusqu'à 23h59 (heure de Paris), chassé par le départ d'une 2e course le même jour ;
  sinon la prochaine course de l'étape avec compte à rebours (badge « Prochaine course »). Le
  résultat du jour n'apparaît dans « Derniers résultats » qu'à partir de minuit. Sans étape dans la
  semaine : « Les biathlètes sont au repos, profites-en pour farter tes skis ! » avec 🎿.
- **« À suivre »** : la course d'après celle que montre déjà l'encadré (la 2e course à venir quand
  l'encadré affiche la prochaine, sinon la prochaine).
- **Pronostics ouverts 7 jours avant l'étape** (`predictionWindow.ts`, testé) : avant, la page de
  la course affiche la date d'ouverture au lieu de la liste des biathlètes, et Ma saison / « À
  suivre » montrent « Ouvre le … » à la place de « À jouer ». **À confirmer** : contrôle côté
  interface seulement (le pronostic est enregistré par le navigateur) ; un verrou en base
  demanderait une règle RLS.
- **Page résultats** : la légende en toutes lettres (Fusée/Gâchette, Prono parfait) est remplacée
  par un bouton « ? » à côté de « Résultats » (`HelpButton`). Dans le classement des joueurs, un
  clic ouvre le pronostic détaillé du joueur sur la course (`PlayerRaceButton`, action
  `getPlayerRaceResult`, course notée seulement). `PredictionBreakdown` est devenu synchrone pour
  servir aussi côté client.

## Accueil : un seul encadré pour l'étape de la semaine (fin octobre 2026)

À la demande de Guillaume, « L'étape de la semaine » devient un encadré unique : bandeau bleu clair
(drapeau, lieu, dates de l'étape), puis toutes les courses de l'étape avec leur statut (À venir /
En cours / Terminée) et, pour chacune, un déroulant (`<details>`) : le résultat détaillé
(`ResultBody compact` : sans podium, les 3 choix en lignes serrées façon podium) pour une course notée, sinon le pronostic
du joueur (avec « À jouer » / « Modifier » et le compte à rebours avant le départ). La course du
moment (`pickWeekFeature`) est dépliée d'office. **À confirmer** : quand une étape a lieu cette
semaine, « À suivre » et « Derniers résultats » disparaissent (l'encadré les remplace) ; ils
reviennent les semaines sans étape, sous le message de repos.

## Course malus, retrait de Team Nation / Aspiration, équipe favorite (fin octobre 2026)

- **Course malus** : le contour rouge entoure l'encadré du haut de la page de la course, avec un
  bandeau rouge (gros picto, « Course malus · <nom> », phrase choc `Race.malusTagline_*`) et un
  bouton « ? » qui ouvre le barème illustré de pictos (`MALUS_SCALE`, `Race.malusScale_*`). Le
  bandeau rouge séparé disparaît.
- **Team Nation et Aspiration retirés** (point 9 du règlement affiché, §10-11 de
  `docs/reglement.md`) : `scoreIndividualPredictions` (`lib/admin/raceResults.ts`) passe `favoriteTeam: null` au moteur et n'ajoute plus
  le bonus Aspiration. Les fonctions du moteur restent (testées) mais ne sont plus appelées. Les
  sections suivantes du règlement sont renumérotées (9 à 12). Une course déjà notée garde ses
  anciens bonus jusqu'à ce que ses résultats soient réenregistrés dans l'admin.
- **Équipe favorite** : reste choisie en début de saison, pour le plaisir. Sur l'accueil, sous
  « Mon équipe favorite », ses victoires (🏆) et podiums (🏅, victoires comprises) de la saison
  (`favoriteTeamStats.ts`, testé) : biathlètes de la nation et du sexe de l'équipe, et relais de ce
  sexe (pas les relais mixtes, **à confirmer**).
- **Prochaine étape** : sous l'étape de la semaine, petit encart (drapeau, lieu, dates) vers Ma
  saison, étape dépliée (`/courses?etape=…`). C'est l'étape qui suit celle de la semaine, ou la
  prochaine à venir les semaines sans étape.
- **Détail du calcul** (page d'une course notée seulement, et pop-up d'un joueur) : sous chaque nom,
  en petit, « cote 8 × 25 » (cote en vigueur × multiplicateur de la place, `CalcDetail`), plus
  « 🚀 50 » / « 🎯 20 » le cas échéant ; « cote 6 » seule hors barème.
- **Tour de péna séparé** (demande de Guillaume) : les points d'un athlète affichés à droite sont
  ceux qu'il rapporte sans le malus ; le malus apparaît en rouge sur une 2e ligne plus petite sous
  son nom (« 🔁 2 tours de péna : -40 pts », `PenaltyLine`), sur l'accueil comme sur la page de la
  course. Calcul à l'affichage (`lastResult.ts`) : tours × malus par tour, ×3 sur la cible de
  « Ça farte » ; comme les points par choix, il est montré hors ×2 Mondiaux/JO ou bonus perso
  (affichés à part). Le total du pronostic, lui, ne change pas.

## Listes de départ poursuite et mass start (octobre 2026)

**Demande de Guillaume** : n'afficher dans le pronostic que les biathlètes qui prennent vraiment
le départ, et ne rien afficher tant que la liste n'est pas connue.

- **Règle IBU** : poursuite = 60 premiers du sprint. Mass start = 30 partants : les 25 premiers du
  classement général de la Coupe du monde + les 5 meilleurs de l'étape en cours (points marqués
  sur ses courses) non déjà qualifiés ; aux Mondiaux/JO, règle propre (15 premiers du général,
  médaillés des courses précédentes, meilleurs points de l'événement). Le classement général
  n'étant pas dans l'application, la liste de mass start ne peut pas être calculée : elle est
  récupérée sur le site de l'IBU.
- **Table `race_start_lists`** (migration `0020_race_start_lists.sql`) : `(race_id, athlete_id)`,
  place de départ et dossard. Lecture publique, écriture admin (clé service).
- **Résolution** (`src/lib/startList.ts`, `resolveStartList`, testée) : la liste IBU enregistrée
  prime ; à défaut, la poursuite reprend les 60 premiers du sprint saisi (même sexe, même étape) ;
  sinon la liste est « inconnue » et la page de la course affiche un message à la place du
  formulaire (pronostics fermés).
- **Back-office** (`/admin/races/{id}`, encart « Liste de départ », poursuite et mass start) :
  bouton « Récupérer la liste de départ IBU ». Lecture directe de l'API publique
  biathlonresults.com (la même que pour les résultats, `fetchIbuStartList`), pas une IA : plus
  fiable (pas d'erreur de recopie), gratuit et instantané. Les biathlètes sont rapprochés par
  nom (`matchStartList`) des athlètes ayant une cote pour ce format ; **les cotes ne sont pas
  modifiées**. Ré-exécutable ; bouton « Effacer la liste IBU ».
- **Automatique après la course précédente** : valider les résultats d'une course individuelle
  (non relais) tente aussi de récupérer la liste IBU de la mass start suivante de l'étape, même
  sexe, si elle n'en a pas encore. Si l'IBU ne l'a pas encore publiée, le message le signale et
  le bouton manuel reste disponible. La liste n'est pas calculée par l'application (règle IBU
  25 + 5, général de la Coupe du monde non stocké).
- **À confirmer** : un biathlète de la liste IBU sans cote dans le jeu n'est pas pronostiquable
  (il est seulement signalé à l'admin). La restriction est faite par l'écran de pronostic, pas par
  une règle de la base (un pronostic écrit directement en base n'est pas vérifié).

## Applis Android / iOS et notifications (fin octobre 2026)

Guillaume veut de vraies applis sur Google Play et l'App Store (pas une PWA comme VéloPronos), avec
des notifications : elles serviront aux questions bonus posées pendant les courses.

- **Capacitor 8, dossier `mobile/`** (son propre `package.json`, hors build Vercel et hors
  `tsconfig`). L'appli ouvre `https://www.biathlonpronos.fr/` dans une vue web native
  (`server.url`) : toute mise à jour du site arrive dans l'appli sans repasser par les stores.
  Seuls les changements natifs (plugins, icône, écran de démarrage) demandent un nouveau build.
  Identifiant : `fr.biathlonpronos.app`. Hors connexion, l'appli affiche `mobile/www/offline.html`.
- **Notifications : Firebase Cloud Messaging**, plugin natif `@capacitor-firebase/messaging`
  (Android + iOS ; Firebase relaie vers Apple avec la clé APNs déposée dans la console Firebase).
  Le site n'embarque que `@capacitor/core` et déclare lui-même la partie du plugin utilisée
  (`src/lib/native/firebaseMessaging.ts`) : dans un navigateur ordinaire, rien ne se passe.
- **Inscription du téléphone** (`PushRegistrar`, dans le layout) : au lancement de l'appli,
  demande d'autorisation puis envoi du jeton par Server Action (`src/lib/push/actions.ts`).
  Tant que personne n'est connecté, le serveur refuse et on réessaie à chaque changement de page.
  À la déconnexion, le jeton est retiré puis l'appli recharge la page de connexion.
  Profil : encadré « Notifications de l'appli » (seulement dans l'appli) pour les activer ou
  expliquer comment les réautoriser dans les réglages du téléphone.
- **Table `push_tokens`** (migration 0021) : jeton (clé), joueur, plateforme, langue, dates.
  Accès réservé au serveur (RLS sans policy, comme 0020). Un jeton passe au dernier joueur
  connecté sur le téléphone.
- **Envoi** (`src/lib/push/fcm.ts`, `send.ts`) : API FCM HTTP v1, jeton d'accès Google signé avec
  le compte de service Firebase (variable `FIREBASE_SERVICE_ACCOUNT` sur Vercel, JSON complet),
  sans dépendance supplémentaire. Les jetons périmés (appli désinstallée) sont supprimés.
  Back-office `/admin/notifications` : envoi « moi seulement » (test) ou à tous les joueurs ; le
  lien est une page sans langue (`/courses`), ouverte dans la langue du joueur.
- **Connexion dans l'appli** : Google refuse les vues web intégrées, donc Google et Apple passent
  par la fenêtre native du téléphone (plugin `@capgo/capacitor-social-login`,
  `src/lib/native/socialLogin.ts`) puis `supabase.auth.signInWithIdToken`. Apple sur iPhone
  seulement (sur Android il faudrait un serveur de redirection) ; Google sur les deux (projet
  Google Cloud `biathlonpronos-6eae5` : client Web « Biathlon Pronos », client iOS « Client iOS 1 »,
  clients Android « Client Android 1 » avec le SHA-1 de la clé d'importation `99:12:53:…` et
  « Client Android 2 » avec le SHA-1 de la clé de signature Play `C7:CE:D6:4A:…`, indispensable
  pour les installations depuis le Play Store, sinon erreur `[16] Account reauth failed`). L'écran
  de consentement doit être publié (« En production »), sinon seuls les testeurs déclarés passent.
  Les ID Web et iOS sont dans `socialLogin.ts`, le client iOS inversé est l'URL scheme de
  `Info.plist`. Côté Supabase, le fournisseur Apple doit lister `fr.biathlonpronos.app` dans ses
  « Client IDs », le fournisseur Google les ID Web et iOS, avec « Skip nonce checks » activé. Facebook n'est
  pas embarqué.
- **Builds : Codemagic** (`codemagic.yaml` à la racine), lancés à la main. Android : AAB signé
  (clé « Biathlonpronos » dans Codemagic) ; le premier envoi sur Google Play se fait à la
  main, l'envoi automatique est ensuite à décommenter. iOS : signature automatique via la clé API
  App Store Connect, envoi sur TestFlight. Les numéros de version suivent le numéro de build.
- **Fichiers Firebase** (projet `biathlonpronos-6eae5`, ajoutés le 03/11/2026) : `mobile/android/app/google-services.json`
  et `mobile/ios/App/App/GoogleService-Info.plist` (déjà référencé dans le projet Xcode).
- **Icône et écran de démarrage provisoires** générés depuis le logo (cible) : sources dans
  `mobile/assets/`, regénérés par `npm run assets` dans `mobile/`.
- **À confirmer / à faire** : questions bonus (le contenu des notifications, envoi automatique),
  textes de notification par langue (la langue de chaque téléphone est déjà stockée), suppression
  de compte depuis l'appli (Apple l'exige ; aujourd'hui c'est un email au support).

## Cartes bonus du 10/10 : choix, 4e choix, une carte à la fois (fin octobre 2026)

**Constat de Guillaume** : Hugo a atteint 10/10, la série est repartie à 0 et rien ne s'est passé.
Le crédit de carte était bien compté (`streak_counters.cards_earned`), mais le choix était caché en
bas du Profil. Décisions de Guillaume (30/10/2026) :

- **Choix de la carte** dans l'encadré « Série en cours » de l'accueil et de Ma saison (plus dans le
  Profil) : bouton doré « 10/10 ! Choisis ta carte bonus » qui ouvre un pop-up ; sur l'accueil le
  pop-up s'ouvre tout seul une fois par visite (« Plus tard » le referme). Seules deux cartes sont
  proposées : **Ça farte** et **4e choix** (`balle_de_pioche` en base). Fondue reste
  dans le code mais ne se choisit plus (Chat noir a depuis été retirée, 01/11/2026).
- **Rappel des cartes** sous la série : dorée « disponible », contour doré « active » (jouée, une
  course couverte pas encore notée ; « active, 2/4 courses » pour le 4e choix), grisée et barrée
  « utilisée ». Mêmes pastilles en haut du pop-up d'un joueur du Classement.
- **4e choix** : jusqu'à 4 biathlètes (3 suffisent), les 3 meilleurs comptent, sur la course où il
  est joué puis les suivantes de la saison, relais exclus, jusqu'à **2 courses par sexe** (4 au
  total, moins en fin de saison). Une course oubliée compte dans les 4 (à confirmer). Les courses H et
  F au même horaire : la course d'activation passe d'abord. (`quatriemeChoixWindow`, même règle en
  SQL `quatrieme_choix_window`.)
- **Ça farte** : courses individuelles seulement, ×3 jamais cumulé avec un ×2 (inchangé).
- **Une seule carte à la fois** : pas de Ça farte sur une course couverte par un 4e choix, pas de
  4e choix dont la fenêtre couvrirait un Ça farte déjà posé.
- Une carte jouée est définitive (elle ne revient pas si le joueur change d'avis).

**Sécurité / scoring** (migration **0022**, à coller par Guillaume) : les écritures directes dans
`bonus_cards` (0012, 0013) sont retirées — un joueur pouvait s'attribuer n'importe quelle carte ou
remettre une carte jouée à « disponible ». Choisir passe par `claim_bonus_card` (crédit restant
obligatoire, Ça farte ou 4e choix seulement), jouer par `play_bonus_card` (course pas partie,
individuelle, une carte à la fois ; sert aussi au bouton Fondue). Lecture des cartes ouverte à tous
pour le pop-up du Classement. À la notation, ce sont les cartes jouées qui font foi
(`resolvePredictionCard`) : sans 4e choix actif, seuls les 3 premiers biathlètes d'un pronostic
comptent ; le ×3 ne s'applique que sur la course où Ça farte a été joué.

Code : `src/lib/bonusCards.ts` (testé), `src/components/StreakCard.tsx`, `ClaimCardPicker.tsx`,
`BonusCardsList.tsx`, formulaire de pronostic (`PredictionForm`, props `playableCards` /
`activeCard`).

**Précisions de Guillaume (30/10/2026, après mise en ligne).**
- Le choix de la carte bonus est en haut du formulaire de pronostic (au-dessus de « Mon pronostic »).
- **Le 4e choix s'active tout seul** dès qu'il est choisi au 10/10 : sur la prochaine course
  individuelle pas encore partie et les suivantes (2 par sexe). Il ne se joue plus depuis le
  formulaire. Ça farte reste en main et se joue quand le joueur veut. Migration **0023**
  (`claim_bonus_card` modifiée, `next_individual_race`, et activation des 4e choix déjà pris mais pas
  joués), à coller par Guillaume.
- Si le 4e choix couvre une course où Ça farte avait déjà été posé, Ça farte l'emporte sur cette
  course (choix pragmatique, à confirmer).

## Fautes au tir et course « Tour de péna » (fin octobre 2026)

- **Bug corrigé** : à la course « Tour de péna », aucun tour n'était compté. Le moteur lisait bien
  `race_results.penalty_laps`, mais la récupération des résultats IBU laissait la colonne « Tours
  de péna » vide (seul le CSV fait main la remplissait). Règle confirmée par Guillaume : **tours de
  péna = nombre de fautes au tir de l'athlète**. L'import IBU remplit désormais cette colonne avec
  `ShootingTotal` ; à défaut, la somme des fautes par tir sert de tours de péna (CSV, saisie admin,
  enregistrement et calcul des points). Pour une course déjà notée, relancer « Récupérer les
  résultats officiels IBU » puis « Enregistrer et calculer les scores ».
- **Fautes par tir** : nouvelle colonne `race_results.shootings smallint[]` (migration 0024), lue
  dans le champ IBU `Shootings` (« 0+1+0+2 »), colonne « Tirs » du CSV et du tableau de saisie.
  Affichées en ronds noirs chiffrés en blanc (`ShootingDots`, comme biathlonworld) à côté de chaque
  athlète dans le classement d'une course terminée et dans le détail des pronostics : 2 ronds au
  sprint et en relais, 4 sinon (`shootingCount`).
- **Relais (à confirmer)** : 2 ronds pour l'équipe = fautes au couché et au debout, tous relayeurs
  additionnés ; chaque balle de pioche utilisée compte comme une faute (le format IBU d'un tir de
  relais est « tours de péna + balles de pioche »). Le format exact renvoyé par l'IBU pour la ligne
  d'équipe n'a pas pu être vérifié (site injoignable depuis l'environnement de développement) :
  le code accepte la ligne d'équipe ou, à défaut, additionne les lignes des relayeurs.

## Pictos des joueurs (octobre 2026)

**Demande de Guillaume** (sur le modèle de VéloPronos) : voir d'un coup d'œil, à côté du pseudo,
les bonus et victoires de chaque joueur. `src/lib/playerBadges.ts` + `PlayerBadgesRow` :

- **Dossard jaune** (SVG `LeaderBib`, comme le leader de la Coupe du monde) : 1er du classement
  affiché (général, ligue, étape ou course selon les filtres) avec des points. Dans la pop-up d'un
  joueur et sur l'accueil : leader du général.
- **⚡ 1/3** : bonus ×2 utilisés sur les 3 de la saison. Ceux joués sur une course pas encore
  partie restent invisibles pour les autres joueurs (pronostics cachés, 0018).
- **🍾 n** : courses gagnées, c'est-à-dire terminées meilleur pronostiqueur (plus de points sur la
  course, depuis `score_ledger`). Ex æquo : chacun compte une victoire (à confirmer).
- **❄️** : Pépite révélée (bonus obtenu), avec le nombre si les deux le sont. Remplace la goutte
  du porteur d'eau de VéloPronos.

Affichés dans le Classement (légende dans un « ? » à côté du titre), la pop-up d'un joueur, la
carte de rang et le Top 5 de l'accueil. Mêmes pictos ailleurs : ⚡ devant les mentions du bonus ×2
(bouton, badges, gain), 🍾 pour « meilleur pronostiqueur » (dernier résultat) et le 1er du
classement des joueurs d'une course, ❄️ devant la Pépite (Globes, pronostics de saison, bonus).
Pas de SQL : tout se lit avec les droits existants.

## Cartes bonus au fil de la saison : Fondue, Aspiration, Équipe (30/10/2026)

Demande de Guillaume, précisions validées le jour même :
- **Cinq cartes au choix au 10/10** : Fondue, Ça farte, 4e choix, Aspiration, Équipe. **Une même
  carte ne se prend pas sur deux 10/10 d'affilée** (grisée « Prise au dernier 10/10 », de nouveau
  possible au suivant). La règle « déjà en main » (grisée tant qu'un exemplaire n'est pas utilisé)
  disparaît.
- **Fondue** : dès le début de la saison, gardée en main, jouée depuis la page de la course (bouton
  existant). Se cumule avec les autres cartes.
- **Aspiration** : débloquée quand la 1re course de la **4e étape** (ordre des dates) est partie.
  Gardée en main, jouée sur une course individuelle comme Ça farte. Chaque biathlète pronostiqué
  compte une place plus haut : le 1er reste 1er, un 11e devient 10e et marque, les bonus Top 3/5/10
  et le Prono parfait suivent ces places (`computeIndividualRaceScore`, carte `aspiration`). Avec
  Brouillard, le malus suit aussi la place remontée.
- **Équipe** : débloquée quand la 1re course de **l'étape qui suit les Mondiaux/JO** (coefficient 2)
  est partie ; la 7e étape si la saison n'en a pas. Active dès qu'elle est choisie, sur la prochaine
  course pas encore partie et toutes les suivantes. Chaque biathlète de l'équipe favorite (nation +
  sexe) dans le Top 10 ajoute **une fois sa cote**, sans coefficient ; sur le relais hommes ou
  femmes de l'équipe, la nation dans le Top 10 ajoute une fois la cote du relais (`computeEquipeBonus`,
  `breakdown.equipeBonus`). Ces points comptent pour la série (confirmé). La cote s'ajoute pour
  chaque biathlète de l'équipe dans le Top 10, qu'il soit dans le pronostic (en plus de ses points
  normaux) ou non (confirmé, exemple de Guillaume : Perrot pronostiqué 2e à 8 = 8 × 18 + 8,
  Jacquelin et Claude non pronostiqués = 12 + 24). **À confirmer** : il faut avoir déposé un
  pronostic sur la course pour toucher le bonus ; sans équipe favorite, la carte ne rapporte rien.
- **Cumuls sur une course** (Guillaume, 30/10/2026) : **Ça farte se pose sur un des 4 choix d'un
  4e choix** (effet `balle_de_pioche` avec `caFarteTargetAthleteId`) ; le ×3 compte pour désigner
  les 3 meilleurs des 4 : un 4e triplé peut passer devant un 3e (confirmé). **Aspiration ne se cumule ni avec un 4e choix ni avec Ça
  farte.** Si un 4e choix, activé tout seul au 10/10, couvre une course où Aspiration est déjà posée,
  Aspiration l'emporte sur cette course (à confirmer). Fondue et Équipe se cumulent avec tout.
  Migration **0027** : `play_bonus_card` applique ces règles.

Migrations **0025** (nouvelles valeurs `aspiration`, `equipe` du type `bonus_card_type`, à exécuter
seule d'abord) et **0026** (`claim_bonus_card` : règle des deux 10/10, déblocage par étape,
activation automatique du 4e choix et d'Équipe ; `play_bonus_card` : Aspiration, Équipe non
jouable ; `bonus_card_unlocked`, `next_race`). Aucune nouvelle table ni colonne.

## Invitation aux pronostics de saison sur l'accueil (octobre 2026)

**Demande de Guillaume** : en début de saison, tant que la 1re course n'a pas eu lieu, le bas de
l'encadré « Saison » de l'accueil invite à saisir ses pronostics de saison (`SeasonPicksInvite`,
compteur sur 8 = 6 globes + 2 Pépites, bouton vers `/globes`) à la place de la « Série en cours ».
Masquée aussi dès que `/globes` se verrouille (`seasons.starts_on` passé), pour ne pas inviter
vers une page fermée. La série reprend sa place ensuite.

## Équipe favorite définitive, invitations à compléter (30/10/2026)

**Demandes de Guillaume** :
- **Ma saison** : sur chaque pronostic de saison pas encore choisi, un bouton « Compléter » (vers
  `/globes`) remplace « Pas encore choisi », tant que les pronostics de saison sont modifiables
  (avant `seasons.starts_on`). Dans la pop-up d'un autre joueur, le texte reste.
- **Saisie des pronostics de saison** (`/globes`) : athlètes, nations et Pépites triés par cote
  croissante (puis par nom à cote égale).
- **Équipe favorite définitive** : choisie une seule fois pour la saison, à tout moment tant que la
  carte Équipe du joueur n'est pas active (`bonus_cards` de type `equipe` au statut `used`).
  Confirmation au moment du choix (« définitif pour la saison, servira avec la carte Équipe »),
  puis affichage en lecture seule dans le Profil. L'accueil invite à la choisir tant qu'elle ne
  l'est pas (lien vers `/compte#equipe-favorite`). Migration **0028** : la politique « write own »
  est remplacée par une insertion seule, refusée si la carte Équipe est active ; plus de
  modification ni de suppression par le joueur. Les équipes déjà choisies restent telles quelles.
  À confirmer : un joueur dont la carte Équipe est active sans équipe favorite ne peut plus en
  choisir (la carte ne lui rapporte rien).

## Dossard rouge par étape, pictos, retrait de Chat noir (01/11/2026)

Décisions de Guillaume du 01/11/2026 :
- **Dossard rouge** (`StageLeaderBib`, `PlayerBadgesRow` prop `stageLeader`) : dans le Classement
  filtré « Par étapes » sur « Toute l'étape », le 1er (avec des points) porte le dossard rouge au lieu
  du jaune. Le **dossard jaune est réservé au classement de la saison** (général, ou ligue sur la
  saison) ; sur une seule course, ni jaune ni rouge (le 🍾 désigne déjà le vainqueur).
- **Étapes gagnées** (`countStageWins`, testé) : dossard rouge avec le nombre d'étapes gagnées
  écrit sur le dossard (1, 2, 3…, demande du 04/11/2026), à côté du pseudo
  (Classement, pop-up joueur, carte de rang et Top 5 de l'accueil). Une étape compte quand **toutes
  ses courses sont notées** ; le vainqueur est le joueur qui a le plus de points sur l'ensemble de
  ses courses (bonus Pépite compris, comme pour les courses gagnées), ex æquo tous vainqueurs.
  Depuis le 04/11/2026, le leader de l'étape en cours porte aussi le rouge sur le classement
  « Saison » (Classement uniquement), à côté d'un 🔥 n pour la série en cours (10/10).
  **À confirmer** : l'étape en cours ne compte pas dans le nombre d'étapes gagnées tant que toutes ses
  courses ne sont pas notées ; le leader d'étape est calculé sur le général, même en vue Ligue.
- **Par étapes** : sur « Toute l'étape », plus de pronostics dans les lignes (ils restent dans le
  pop-up du joueur) ; sur une course choisie et partie, une seule ligne de pronostic sous le pseudo.
- **⭐ n pronos parfaits** : nombre de lignes de `score_ledger` avec `breakdown.pronoParfaitBonus`
  positif. Pictos conservés : ⚡ ×2 (avec le nombre), 🍾 courses gagnées, ❄️ Pépite.
- **Chat noir retirée** (réservée au vélo) : supprimée du règlement, des textes et du type
  `BonusCardType`. La valeur `chat_noir` reste dans l'enum `bonus_card_type` en base (retirer une
  valeur d'enum Postgres est lourd et inutile : aucune fonction ne la propose).

## Fête nationale, jokers de fin de saison, parcours d'invité (01/11/2026)

Décisions de Guillaume du 01/11/2026 (PR à fusionner, migrations 0029 à 0031).

### Fête nationale (course bonus)
- Nouvelle valeur `fete_nationale` de l'enum `special_rule` (migration **0029**, à exécuter seule),
  choisie par l'admin sur une **course individuelle** (`SPECIAL_RULE_FORMATS`).
- Moteur (`computeIndividualRaceScore`, entrée `nationalDayTeam`, testé) : un biathlète pronostiqué
  de l'**équipe favorite** du joueur (nation + sexe) **classé dans le Top 10** voit ses points
  (cote × rang + Fusée/Gâchette) passer à ×2. `breakdown.nationalDayBoostedAthleteIds`.
- Non cumulable : ni avec le bonus ×2 perso, ni avec le coefficient Mondiaux/JO (jamais ×4) ; la
  cible de Ça farte reste à ×3. Comme toute course spéciale, le bonus ×2 perso n'y est pas proposé.
  Les bonus de combinaison et la carte Équipe ne sont pas doublés.
- Affichage doré (bandeau « Course bonus · Fête nationale » sur la page de la course et dans le
  calendrier, barème illustré dans le « ? »), « 🎉×2 » à côté du biathlète doublé dans le détail.
- **À confirmer** : le Top 10 est lu après la carte Aspiration (un 11e remonté 10e est doublé) ; sans
  équipe favorite, aucun bonus ; Fête nationale impossible sur un relais.

### Jokers de fin de saison
- `src/lib/jokers.ts` (`selectJokers`, `computeSeasonJokers`, testés) : par joueur, les 3 plus
  mauvais résultats de courses individuelles et les 2 plus mauvais relais **parmi les courses
  notées**, hors Mondiaux/JO (coefficient 2) et hors courses malus/bonus (`races.special_rule`
  renseigné, décision de Guillaume du 04/11/2026). Ordre : courses non jouées d'abord (pas de pronostic),
  puis les plus petits scores, puis la plus ancienne.
- Effacer = retirer les points de la course du total (un 0 ne change rien, un petit score positif est
  retiré). Le bonus Pépite gagné sur une course n'est jamais effacé.
- **Application** : calcul à la lecture, rien n'est supprimé de `score_ledger`. L'admin active les
  jokers en fin de saison (bouton « Appliquer les jokers » dans la saison, `/admin`, colonne
  `seasons.jokers_applied`, migration **0030**, réversible). `getLeaderboard` (général, ligues, carte
  de rang, pop-up) retire alors les points effacés ; le classement « Par étapes » reste brut.
- **Aperçu** dans Classement, encadré « Mon classement » (`JokersCard`, `getPlayerJokers`) : résultats qui seraient effacés si la saison
  s'arrêtait aujourd'hui, et l'effet sur le total.
- **À confirmer** : relais des Mondiaux/JO exclus aussi ; « étapes malus et bonus » lu comme les
  courses à règle spéciale (le malus/bonus est porté par la course, pas par l'étape) ; une course non jouée est prise en
  priorité même si une course jouée a un malus plus lourd (lecture littérale de la règle) ; un
  joueur arrivé en cours de saison a les courses d'avant son inscription comptées comme non jouées.

### Parcours d'invité (connexion anonyme Supabase)
- Accueil visiteur : le bouton « Jouer » mène à `/jouer`, qui ouvre une session anonyme
  (`signInAnonymously`) puis la prochaine course où l'on peut pronostiquer (`findNextPlayableRace` :
  pas partie, pronostics ouverts, cotes saisies, liste de départ connue).
- À la validation du premier pronostic (`PredictionForm` / `RelayPredictionForm`), un invité (ou
  un visiteur arrivé directement sur une course) voit `GuestSignupDialog` : pseudo, prénom, nom,
  e-mail → `updateUser({ email, data })` envoie un code → `verifyOtp({ type: "email_change" })`. Le
  compte anonyme devient permanent **avec le même identifiant**, sans mot de passe ; le pseudo est
  écrit dans `profiles`, prénom et nom restent privés (métadonnées Supabase Auth, visibles dans
  `/admin/joueurs`). Le pronostic n'est enregistré qu'après la confirmation.
- Connexion ensuite : « Se connecter avec un code reçu par e-mail » sur la page de connexion
  (`signInWithOtp`, `shouldCreateUser: false`).
- Après la course : sur la page d'une course notée, un joueur qui a pronostiqué et n'a aucune ligue
  voit « Et les autres ? » (sa place, liens vers le classement de la course et les ligues). Juste
  après la création du compte, un encart « Bienvenue » propose déjà de rejoindre une ligue.
- Un invité est traité comme un visiteur ailleurs (accueil vitrine, Profil, Ligues, Globes, Ma
  saison, notifications).
- **Navigation bloquée (10/11/2026)** : tant qu'il n'a pas de vrai compte, l'invité reste sur sa
  course (`GuestNavGuard`, monté dans le layout). Les éléments marqués `data-guest-lock` (barre
  basse, flèche retour, course précédente/suivante, rond du profil) sont grisés ; tout clic vers une
  autre page (sauf accueil, `/jouer`, connexion, règlement, CGU, confidentialité, support) ouvre la
  pop-up « Inscris-toi gratuitement en cliquant ici… », qui ouvre le formulaire d'inscription
  (`GuestSignupDialog` en mode « account ») ou renvoie vers la connexion. Une page interdite ouverte
  par son adresse affiche la même pop-up ; la fermer ramène à la course (`/jouer`).
- **Parcours « e-mail seulement » (10/11/2026, migration 0045 dans Biathlonpronos, 0060 dans VéloPronos, remplace la création de compte à
  la validation)** : pour valider son pronostic, l'invité ne donne que son e-mail (« Dès la fin de
  la course, reçois ton code privé par e-mail pour découvrir ton score », `GuestEmailDialog`).
  L'adresse est rattachée côté serveur à son compte anonyme (`registerGuestEmail`, clé service,
  sans code) : le compte n'est plus anonyme et le pronostic s'enregistre, mais il reste « en
  attente d'inscription » (`profiles.signup_pending`) : absent des classements (filtre dans
  `leaderboard.ts`, `standings.ts`, `racePlayers.ts`, `bonusQuestions.ts`), sans rappels ni récap
  par e-mail (`player_emails`), navigation bloquée sur sa course (`GuestNavGuard`). À la saisie
  des résultats, `notifyGuestResults` lui envoie « Ton score est prêt » (Resend) avec un lien de
  connexion (`/auth/confirm`, jeton `generateLink` magiclink) vers la course et le même code privé
  (à saisir dans Connexion > code > « J'ai déjà un code »). Sur la course : son score, puis
  « Crée ton compte gratuitement… » à la place du classement des joueurs, vers `/inscription`
  (pseudo, prénom, nom et mot de passe, `completeGuestSignup`) ; ses points sont conservés.
  Depuis le 11/11/2026, la pop-up de navigation bloquée mène aussi à `/inscription`, y compris pour
  un invité anonyme (il y donne alors son e-mail en plus) : un seul formulaire, avec mot de passe,
  qui garde l'identifiant du compte invité.
  Après la validation du pronostic par e-mail, l'invité arrive sur une page d'attente
  (`/courses/[raceId]/attente`) : heure de départ, ses choix, compte à rebours, bouton « Modifier
  mon pronostic » (retour à la course) et saisie du code privé (« Dès l'officialisation des
  résultats, reviens saisir ton code pour découvrir ton score »). Une fois la course partie, la page
  renvoie vers la course. Inscriptions jamais
  terminées : supprimées après 60 jours sans pronostic. **Validé par Guillaume (10/11/2026)** : l'e-mail n'est pas
  vérifié au moment où il est donné (il l'est au retour par le code) ; le score n'est pas écrit
  dans l'e-mail (il se découvre dans l'appli) ; les invités en attente n'apparaissent pas dans les
  classements tant qu'ils n'ont pas de pseudo.
- **Jeton périmé** : après la conversion, le jeton de session garde `is_anonymous` jusqu'à son
  renouvellement, et la base refusait le pronostic (« pronostics fermés » en rouge). La session est
  désormais renouvelée après le code, et avant chaque enregistrement si le jeton dit encore
  « anonyme » (`lib/supabase/guestToken.ts`).
- **Base (migration 0031)** : profil « Invité » créé pour un compte sans e-mail (`handle_new_user`) ;
  `is_guest()` ; règles RLS **restrictives** : un invité ne peut rien écrire (pronostics, globes,
  Pépites, équipe favorite, ligues, pseudo) tant que son compte n'est pas confirmé ; garde-fou de
  300 comptes invités par heure pour tout le site (trigger sur `auth.users`) ; purge des invités de
  plus de 7 jours (`purge_anonymous_users`, chaque nuit par pg_cron s'il est activé, et bouton dans
  `/admin/joueurs`).
- **Réglages Supabase à faire par Guillaume** : activer les connexions anonymes ; limite par
  adresse IP (Authentication > Rate Limits) ; modèles d'e-mail « Change Email Address » et « Magic
  Link » avec `{{ .Token }}` (le code) ; longueur du code e-mail à 6 chiffres ; pg_cron.
- **À confirmer** : le format exact du jeton envoyé à un compte anonyme qui ajoute un e-mail
  (modèle « Change Email Address ») est à vérifier au premier test réel ; un e-mail déjà inscrit
  renvoie vers la connexion et le pronostic est à revalider ; pas de CAPTCHA pour l'instant.

## Page course : compte à rebours et « L'avis de Biathlonpronos » (02/11/2026)

- **Compte à rebours** (`RaceCountdown.tsx`) en haut de la page d'une course à venir : temps
  restant pour pronostiquer, jusqu'au départ (= verrouillage). Doré dans la dernière heure ; à zéro,
  la page se recharge. Il part de l'heure du serveur, donc respecte l'horloge simulée de l'admin.
  Pas de décompte vers l'ouverture des pronos : elle dépend de la réception des listes de départ
  (décision de Guillaume, 02/11/2026).
- **L'avis de Biathlonpronos** : colonne `races.opinion` (migration 0032), saisie dans le
  back-office (`/admin/races/[id]`, encadré dédié). Affiché sous l'en-tête de la course, quel que
  soit son statut ; vide = rubrique masquée. Le titre est traduit dans les 5 langues, le texte
  lui-même est affiché tel que saisi (une seule langue, *à confirmer* si une version par langue
  est souhaitée).
## Questions bonus avant le départ et live (02/11/2026)

- **Deux sortes** (`bonus_questions.kind`) : `pre_race` (2 à 4 réponses, publiée tout de suite,
  visible sur la page de la course dès l'ouverture des pronostics à J-7, réponses jusqu'à
  `races.locks_at`, pas de notification) et `live` (2 réponses, préparée en brouillon puis lancée
  par l'admin pendant la course pour 1 à 60 min, 5 par défaut ; `opens_at` / `closes_at` en heure
  réelle même si l'horloge est simulée).
- **Back-office** : rubrique « Questions bonus » de `/admin/races/[id]` (création, « Lancer +
  notifier », « Fermer maintenant », bonne réponse, suppression, nombre de réponses par option).
- **Réponse du joueur** : fonction `answer_bonus_question` (security definer, migration 0033) qui
  vérifie que la question est ouverte ; réponse modifiable tant qu'elle l'est. Un invité non
  confirmé ne peut pas répondre (comme pour les pronostics).
- **Points (décision de Guillaume)** : 20 pts pour une bonne réponse, 0 sinon. L'admin saisit la
  bonne réponse une fois la question fermée (`setBonusQuestionAnswer`) : les lignes de
  `score_ledger` de la question (colonne `bonus_question_id`, `race_id` vide) sont réécrites. Le
  classement général les compte d'office ; le classement d'étape et celui des joueurs d'une course
  les ajoutent via `getBonusQuestionLedger` (jointure sur `bonus_questions.race_id`). Les jokers ne
  les effacent pas (ils ne portent que sur les lignes de course). **À confirmer.**
- **Affichage** : encadré par question sur la page de la course (bonne réponse en vert, mauvaise en
  rouge) ; course notée : ligne verte « ❓ Questions bonus +20 pts » sous les points du pronostic.
- **Total de la course (04/11/2026)** : les points des questions bonus s'ajoutent au total de la
  course partout où il est affiché (« Tes points sur cette course », accueil, Ma saison, pop-up d'un
  joueur) via `getUserBonusQuestionPointsByRace` ; `prediction.points` de `getRaceResult` est ce
  total, `bonusQuestionPoints` en donne la part. La place du joueur sur la course suit
  `getRacePlayers` (questions comprises). Aucune donnée ni migration modifiée : le classement
  général les comptait déjà.
- **Questions live côté joueur** : encadré rouge en tête de l'accueil et pop-up sur les autres pages
  (`LiveQuestionPopup` dans le layout, relu à chaque page et toutes les minutes, « Plus tard » le
  masque pour cette question), avec le temps restant et un bouton vers la course.
- **Notifications** : `sendPush` (Firebase, cf. « Applis Android / iOS ») au lancement, à tous les
  téléphones enregistrés, ouvrant `/courses/[id]`. Tant que Firebase n'est pas configuré, la question
  s'ouvre quand même et le back-office l'indique. Pas de notification navigateur (web push).
- **Limites** : la question et les réponses sont saisies dans une seule langue (pas de traduction).

## Notifications des joueurs : appli et e-mail (02/11/2026)

Détail et mise en route dans `docs/notifications.md`. En bref :

- **Profil > Notifications** remplace les interrupteurs « Bientôt » hérités de VéloPronos : 4 types
  de message (rappel, résultats, questions live, nouvelles), chacun avec un interrupteur Appli et
  un interrupteur E-mail (pas d'e-mail pour les questions live). Table `notification_preferences`
  (migration 0034), réservée au serveur ; pas de ligne = valeurs par défaut.
- **Rappel** 2 h avant une course non pronostiquée (appli + e-mail par défaut), plusieurs courses
  regroupées en un message ; **résultats** sur l'appli à la saisie, avec les points du joueur ;
  **récap e-mail du lundi** (désactivé par défaut) ; **nouvelles** depuis `/admin/notifications`,
  par e-mail seulement aux joueurs qui l'ont accepté (RGPD). Trace `notification_sends` : jamais
  deux fois le même envoi.
- **Horloge** : pg_cron de Supabase appelle `/api/notifications/cron` tous les quarts d'heure
  (Vercel Hobby limite ses tâches planifiées à une par jour). E-mails par l'API Resend.
- **À confirmer** : défauts (rappel e-mail activé, récap e-mail désactivé), créneau du récap
  (lundi 8 h-midi, courses des 7 derniers jours), pas de notification « résultats » pour une
  course de plus de 3 jours, rappels envoyés à tous les comptes (même ceux qui n'ont encore jamais
  joué).


## Échelle des cotes (novembre 2026, demande de Guillaume)

Cotes recalculées à partir des résultats des 3 dernières saisons (2023-24 à 2025-26), l'équipe de
France saisie à la main par Guillaume servant de référence.

- **Courses** : de 8 (ultra favori) à 50 (coureur lambda). 8-15 : multi-vainqueurs du format ;
  15-22 : déjà vainqueur ou souvent sur le podium ; 23-30 : déjà sur le podium, souvent Top 10 ;
  30-40 : déjà Top 10, souvent Top 20 ; au-delà de 40 : pas de Top 10, nouveaux, outsiders.
- **Globes, meilleur jeune, meilleure nation** : de 10 (ultra favori) à 500 (aucune chance) ;
  tenants du titre (Jeanmonnot, Perrot) autour de 20, soit 100 pts au gros globe (× 5).
- **Relais** : même échelle que les courses (8 à 50).
- Méthode (reproductible) : classement du format en Coupe du monde pondéré 50 % / 30 % / 20 %
  (saison la plus récente d'abord), converti en cote selon le rang, puis borné par les victoires
  et podiums du format sur les 3 saisons (Mondiaux et JO compris). Globe : classement général
  pondéré 70 / 20 / 10. Nations : Coupe des nations et classements relais pondérés 60 / 40.
- **Cote poursuite** : le plafond passe de 40 à 50, le haut de la nouvelle échelle, et ne fait
  plus jamais baisser une cote de base (avant, un athlète coté 45 serait tombé à 40 en
  poursuite). **À confirmer.**

## Appli Android : points Play Console à traiter (03/11/2026)

La version 4 (1.0.4) est en examen pour la production. Play Console signale, sans bloquer :
- optimisation du code DEX insuffisante (obscurcissement 1 %), à corriger d'ici février 2027 :
  activer `minifyEnabled true` (R8) dans `mobile/android/app/build.gradle`, avec des règles
  `proguard-rules.pro` pour Capacitor et ses plugins, puis tester toute l'appli avant envoi ;
- deux recommandations sur l'affichage bord à bord (Android 15) : API obsolètes à remplacer.
- Notifications iOS : la clé APNs doit être créée chez Apple en **Sandbox & Production** (une
  clé « Sandbox » seule donne `401 THIRD_PARTY_AUTH_ERROR Invalid APNs credential` sur
  TestFlight et l'App Store). Clé actuelle « Biathlonpronos Push Prod », importée dans Firebase en
  développement et en production. `/admin/notifications` affiche la raison des échecs Firebase.

## Recherche dans les listes de pronostics (04/11/2026)

Demande de Guillaume : pouvoir filtrer la liste en tapant un nom ou un code pays à 3 lettres.
Un champ de recherche (`src/components/SearchField.tsx`, logique dans `src/lib/searchFilter.ts`)
est placé au-dessus de la liste des biathlètes (course individuelle), des nations (relais) et de
chaque menu des pronostics de saison (globes, meilleure nation, Pépites). La recherche ignore
majuscules et accents (« oberg » trouve Öberg, « bo » trouve Bø) ; plusieurs mots doivent tous
correspondre (« lou fra »). Choix pragmatique, à confirmer : un mot qui est exactement un code
pays présent dans la liste ne garde que ce pays (« fra » donne les Français, pas Franziska
Preuss). Les biathlètes déjà choisis restent dans le résumé « Mon pronostic » même hors filtre, et
le choix en cours d'un menu de saison reste toujours affiché.

## Réactivité des pages (04/11/2026)

Guillaume trouvait l'appli lente à l'ouverture d'une notification et au rafraîchissement. Toutes
les pages joueur sont rendues par le serveur à chaque visite (`force-dynamic`), chaque lecture
Supabase étant un aller-retour réseau. Changements :

- `src/app/[locale]/loading.tsx` (et `(auth)/loading.tsx`) : écran de chargement envoyé tout de
  suite (blocs gris + barre de navigation `BottomNavLoading`, onglet demandé allumé) pendant que
  le serveur prépare la page. Au lancement de l'appli, la mise en page (dont `PushRegistrar`) est
  active avant la fin de l'accueil : la page d'une notification touchée s'ouvre plus tôt.
- `getAuthUser()` (`lib/supabase/server.ts`) et `getAdminProfile()` (`lib/clock.ts`), mis en
  cache pour la requête : le joueur connecté et son profil admin ne sont plus lus 3 à 4 fois par
  page (page, horloge, barre de navigation).
- Accueil et page course : lectures indépendantes lancées en parallèle (`Promise.all`) au lieu
  d'à la suite.
- Le pop-up des questions live et l'enregistrement du jeton de notification passent par des
  routes (`/api/live-questions`, `/api/push/register`) et non plus par des actions serveur : Next.js
  14 met les actions serveur dans la même file que les changements de page, et une action en cours
  au moment d'un clic (ou du toucher d'une notification) force ensuite un second rendu complet.

Piste hors code : la région des fonctions Vercel (Settings > Functions) doit être la plus proche
de la région de la base Supabase (Project Settings > General), sinon chaque lecture traverse
l'Atlantique (Vercel est par défaut à Washington, `iad1`).
Base Supabase en `eu-west-1` (Irlande) : région Vercel conseillée `dub1` (Dublin), réglée par
Guillaume le 04/11/2026 (forfait Hobby : une seule région).

## Suppression des biathlètes grillés et de la carte Fondue (04/11/2026)

Décision de Guillaume, pour une meilleure lisibilité : **la règle des biathlètes grillés (§2) est
supprimée de Biathlonpronos**, et avec elle la carte **Fondue** (dégrillage). Tous les biathlètes
restent disponibles d'une course à l'autre.

- Code retiré : `src/lib/grilling.ts` (et son test), `FondueButton.tsx`, le calcul des grillés
  dans la page course, l'état « grillé » de `PredictionForm`, la ligne du « ? » de la course, la
  fiche du Règlement, la question de la FAQ et les textes des 5 langues. `RELAY_FORMATS` vit
  désormais dans `src/lib/raceFormats.ts`.
- Cartes au 10/10 : **quatre** au choix (Ça farte, 4e choix, Aspiration, Équipe).
- Migration **0036** : `claim_bonus_card` ne propose plus Fondue, `play_bonus_card` la refuse, et
  les cartes Fondue déjà prises sont supprimées (le 10/10 redevient un crédit : le joueur choisit
  une autre carte ; à confirmer). La valeur `fondue` reste dans l'enum `bonus_card_type`, inutilisée ;
  la table `grilled_states` aussi.
- Le numéro §2 du règlement est gardé (« Tous les biathlètes restent disponibles ») pour ne pas
  décaler les références §3 à §18 citées dans le code.

**⚠️ VéloPronos : la règle reste.** Lors de la duplication de l'app pour VéloPronos, le
**coureur grillé** et sa carte (**Grillade**, l'équivalent de Fondue) doivent être conservés (voir
`docs/velopronos/trajectoire-et-regles.md`). **Fait dans VéloPronos le 04/11/2026** (migration 0042, voir `docs/velopronos/duplication.md`). Le code à reprendre est celui du commit `91420f9` (dernier
état de `main` avec la règle) : `src/lib/grilling.ts` + `src/lib/__tests__/grilling.test.ts`,
`src/app/[locale]/courses/[raceId]/FondueButton.tsx`, le calcul des grillés dans
`courses/[raceId]/page.tsx` et la prop `grilledAthleteIds` de `PredictionForm.tsx`. Pour les
retrouver : `git show 91420f9:src/lib/grilling.ts`.

## Cartes Fusée, Gâchette et Talent, réglages des cartes, Tour de péna vide (04/11/2026)

Demande de Guillaume ; décisions validées par lui le 04/11/2026 sauf mention « à confirmer ».

**Fusée et Gâchette deviennent des cartes bonus du 10/10** (plus de bonus automatique, l'ancien §15
est remplacé par le §13 du règlement).
- Posées sur une **étape** avant sa 1re course (relais compris), RPC `play_stage_card` ;
  `bonus_cards.used_on_stage_id`. Elles couvrent toutes les courses individuelles de l'étape, H et F
  (`coveredRaceIds`, `cardsOnRace().fusee/.gachette`). La même carte une seule fois par étape ;
  Fusée et Gâchette peuvent être posées sur la même étape.
- Fusée : 100 / 50 / 20 pts pour le 1er / 2e / 3e temps de ski (`race_results.ski_rank`, saisi dans
  la colonne « Rang ski » de l'admin, lu dans l'analyse IBU `CRST`, ou case Fusée des anciens CSV =
  rang 1). Gâchette : 100 pts par 20/20, 50 par 10/10 au sprint (`is_gachette`). 4 formats
  individuels. Pas besoin d'être dans le Top 10 (« pour sauver sa série »).
- **Points fixes, doublés par le bonus ×2 perso** (confirmé par Guillaume le 04/11/2026 : « le 100
  peut devenir 200 »), jamais par la Fête nationale ni Team Nation (et pas de cartes aux Mondiaux/JO).
  `breakdown.fuseeCardBonus / gachetteCardBonus` et le détail par athlète `fuseeByAthlete /
  gachetteByAthlete` restent bruts ; `fuseeGachetteBonus` et le total intègrent le ×2. L'encart
  Dernier résultat remet les points bruts dans le choix (`cardBonus`) et le doublement dans le gain du ×2.
- **Pas de cumul avec Ça farte** : pas de Ça farte sur une course d'une étape où Fusée/Gâchette
  est posée, et pas de Fusée/Gâchette sur une étape où un Ça farte est déjà posé (`canPlayCard`,
  `canPlayStageCard`, `play_bonus_card`, `play_stage_card`). Cumul avec Aspiration, 4e choix, Équipe.
- 4e choix : la carte s'applique aux 4 biathlètes, les points de carte entrent dans le choix des
  3 meilleurs, seuls les 3 comptés les gardent.
- Prono parfait : uniquement cote × place (Fusée/Gâchette retirées de `computeBestPossibleTrio` et
  de `markPronoParfait`). Barème du classement de la course : cote × rang seulement.
- Série 10/10 : les points de ces cartes comptent (comme Équipe).
- Pictos conservés : 🚀 pour le top 3 du temps de ski (avec le rang en exposant si 2e ou 3e), 🎯
  pour le sans-faute.

**Mondiaux / JO : aucune carte bonus.** Une étape au coefficient 2 n'accepte ni Ça farte, ni
Aspiration, ni Fusée/Gâchette ; le 4e choix saute ses courses (fenêtre et activation,
`quatriemeChoixWindow`, `next_individual_race`, `quatrieme_choix_window`) ; à la notation, toutes
les cartes (Équipe comprise) sont ignorées sur ces courses (`scoreIndividualPredictions`,
`scoreRelayPredictions`).

**Carte Talent.** Proposée au 10/10 seulement si une pépite du joueur est révélée. Se joue sur
`/globes` (RPC `play_talent_card`) : réactiver la pépite révélée (sans contrôle de cote) ou en
choisir une nouvelle (toutes cotes ≥ 30), pour un sexe. Refusée si le biathlète est dans un prono
de course pas encore partie. La pépite ne marque qu'à partir des courses parties après
(`pepites.active_from`) et reste définitive ensuite (trigger `pepites_check`). La course de la
révélation est gardée (`pepites.revealed_race_id`) : si cette course est renotée ou réinitialisée
alors que la pépite a été réactivée ou remplacée, les points de la 1re révélation restent acquis
(`clearRaceScores` renvoie ces bonus « gelés », `restoreFrozenPepiteBonuses` les remet). Le picto ❄️
disparaît tant que la pépite réactivée n'est pas de nouveau révélée (à confirmer).

**Réglages des cartes dans l'admin** (`/admin/cartes`, table `bonus_card_settings`) : pour chaque
carte et la saison active, interrupteur, période (du / au, jours de Paris) et, pour Aspiration et
Équipe, « débloquer tout de suite » (ignore l'attente de la 4e étape / de l'après-Mondiaux). Pas de
ligne = carte active sans limite. Désactivée : absente du pop-up du 10/10 ; hors période : grisée
« Pas en ce moment ». Ne touche que le choix au 10/10 : une carte en main reste jouable.

**Tour de péna, pronostic vide.** Chaque biathlète manquant compte 5 tours d'office (-100 pts),
`breakdown.missingPicks` + `specialMalus`. Un joueur sans pronostic prend -300 s'il a déjà
pronostiqué au moins une course de la saison avant celle-ci (`applyTourDePenaAbsences` écrit une
ligne `score_ledger` avec `breakdown.absent`). Pas de cumul avec les jokers : les courses malus ne
sont jamais effacées.

**Migrations** : **0039** (nouvelles valeurs d'enum, à exécuter seule) puis **0040** (colonnes,
table des réglages, fonctions). Les deux sont à coller avant la fusion de la PR.

## Page Profil : notifications repliées, « Suggérer une modification » (04/11/2026)

- La carte **Notifications** du profil est un accordéon, fermé par défaut (comme la FAQ).
- L'encadré **Équipe favorite** a quitté le profil : voir la section suivante.
- **Suggérer une modification** (repris de VéloPronos) : Profil > Suggérer une modification ouvre
  `/compte/messages`, une conversation unique entre le joueur et l'équipe Biathlonpronos. Les admins
  lisent et répondent dans `/admin/messages` (non lus en premier). Table `support_messages`
  (migration **0037**), réservée au serveur comme `notification_preferences` : pas de policy, les
  pages vérifient qui est connecté. Effacée avec le compte (cascade).
  - Le joueur voit une pastille rouge (nombre de réponses non lues) sur la ligne du profil ; elle
    disparaît quand il ouvre la conversation.
  - Une réponse de l'admin part aussi en notification sur le téléphone du joueur, dans sa langue,
    **même s'il a coupé « Nouvelles du jeu »** (c'est la réponse à sa propre demande). À confirmer.
  - Un message de joueur envoie une notification aux admins qui ont l'appli (en français), lien vers
    la conversation dans `/admin/messages`.
  - Garde-fou : 2000 caractères par message, 20 messages par heure et par joueur.
  - Pas de pastille sur le rond « profil » en haut à droite pour l'instant (une requête de plus sur
    chaque onglet) : à ajouter si Guillaume le souhaite.
## Équipe favorite avec les pronostics de saison (04/11/2026)

Demande de Guillaume : le choix de l'équipe favorite quitte le Profil et se fait sur la page des
pronostics de saison (`/globes`), avec les globes et la Pépite, puisque tout se décide au même
moment. Il reste possible après le début de saison (seule la carte Équipe active le bloque).
Dans « Ma saison », l'accordéon « Mes pronostics de saison » a une ligne ❤️ Équipe favorite (l'équipe
choisie, ou un bouton « Choisir » vers `/globes#equipe-favorite`). Le lien de l'accueil y mène aussi.

## Picto de profil (04/11/2026)

Chaque joueur peut choisir un picto (emoji d'une liste de 24, `src/lib/avatars.ts`) en touchant le
grand carré du Profil ; « Aucun » revient à l'initiale du pseudo. Le picto remplace la silhouette du
rond en haut à droite des onglets. Colonne `profiles.avatar` (migration **0038**), écrite par une
Server Action (les joueurs ne peuvent modifier que leur pseudo, 0016). Photo de profil écartée pour
l'instant (stockage, modération, bouton « signaler » exigé par Apple). Le picto pourrait aussi
s'afficher dans le Classement : à décider avec Guillaume.

## Étapes « Autre (×0) », hors classement (04/11/2026)

Demande de Guillaume du 04/11/2026 : une 3e catégorie d'étape, à côté de « Coupe du Monde (×1) » et
« Mondiaux / JO (×2) », pour des courses tests, bonus ou de recrutement de nouveaux joueurs (PR à
fusionner, migration **0041** à coller avant).

**Modèle (générique, à reprendre tel quel pour VéloPronos).** La catégorie n'est pas un 3e
coefficient : c'est un drapeau `stages.counts_in_standings` (par défaut `true`), à côté du
coefficient (qui reste 1 pour une étape ×0). Les courses se pronostiquent et se notent
normalement, à ×1, et ont **leur propre classement** (page de la course, Classement « Par
étapes ») : c'est ce qui permet d'en faire une porte d'entrée pour de nouveaux joueurs. Seul le
**classement de la saison** les ignore. Le drapeau est recopié par trigger sur chaque ligne de
points (`score_ledger.counts_in_standings`, y compris les questions bonus de la course) et suit
l'étape si l'admin change sa catégorie après coup : tous les totaux de saison filtrent d'un seul
`.eq("counts_in_standings", true)`. Pour VéloPronos : même colonne sur l'étape (ou la course,
si les courses hors classement y sont isolées), même trigger sur le grand livre des points, même
filtre dans le classement général. Helpers : `src/lib/stageCategory.ts` (menu de l'admin ↔ colonnes,
testé).

**Effets (choix pragmatiques, à confirmer par Guillaume)** :
- **Classement de la saison** (général, ligues, carte de rang, Top 5 de l'accueil, pop-up joueur) :
  points non comptés (`getLeaderboard`).
- **Dossard rouge** : ni étape gagnée (`getPlayerBadges` ne lit que les lignes comptées), ni leader
  de l'étape en cours sur le classement « Saison », ni dossard rouge en « Par étapes » (l'étape
  reste sélectionnable, avec « ×0 · Hors classement » dans le menu). Ses courses gagnées
  (🍾) et pronos parfaits (⭐) ne comptent pas non plus dans les pictos de la saison.
- **Série 10/10** : ses courses ne la font ni avancer ni casser (`recomputeSeasonStreaks`) ; la
  série est recalculée quand l'admin change la catégorie d'une étape.
- **Cartes bonus** : aucune ne s'y joue, comme aux Mondiaux / JO (`isCardFreeRace`,
  `race_is_championship`, `play_stage_card`) ; le 4e choix saute ses courses ; elle ne compte pas
  dans la numérotation qui débloque Aspiration (4e étape) et Équipe (étape après les Mondiaux).
- **Bonus ×2 perso** : pas proposé (et ignoré à la notation s'il était coché).
- **Pépite** : jamais révélée sur une course hors classement ; elle reste cachée pour la suite.
- **Jokers de fin de saison** : ses courses ne sont jamais prises (elles ne comptent déjà pas).
- **Globes** (pronostics de saison) : non concernés, ils dépendent des classements IBU.
- **Affichage** : encart grisé en pointillés avec « Hors classement » et une pastille « ×0 » dans
  le Calendrier, pastille « ×0 · Hors classement » sur l'étape de la semaine et le dernier
  résultat, encadré gris explicatif sur la page de la course. Badge « ×0 · hors classement » dans
  `/admin`.
- **Admin / CSV** : menu « Autre (×0, hors classement) » à la création et à la modification d'une
  étape ; à l'import du calendrier, une catégorie contenant « Autre », « Hors classement » ou
  « Test » rend l'étape hors classement ; l'export écrit « Autre (hors classement) ».
- **Limite connue** : passer une étape déjà notée en ×0 (ou l'inverse) met à jour les points et les
  séries tout de suite, mais ne retire pas une Pépite déjà révélée dessus (et n'en révèle pas une)
  tant que les résultats ne sont pas réenregistrés.
