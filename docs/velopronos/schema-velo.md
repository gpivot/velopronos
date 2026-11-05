# VéloPronos — schéma saison > course > étape (04/11/2026)

Migrations **0044** (valeurs d'enum, à exécuter **seule**) puis **0045** (schéma). **0043**
(`stages.label`, mention d'étape) est déjà appliquée sur la base ; l'écran qui l'utilisait, préparé
dans un fil abandonné, sera refait sur la nouvelle formule. Rien ici n'en dépend.

## Principe : on garde les tables, on change leur sens

| Table (héritée) | Sens vélo | Ajouts |
|---|---|---|
| `seasons` | saison (2027) | — |
| `stages` | **course** (Tour de France, Paris-Nice, Strade Bianche…) | `name`, `kind` (one_day, stage_race, grand_tour, bonus_event), `category`, `jersey_color`, `jerseys`, `rest_days`, `is_visible` |
| `races` | **étape** ; une classique = une course à une seule étape | `stage_number` (0 = prologue), `start_city`, `end_city`, `distance_km`, `elevation_m`, `combatif_athlete_id` |
| `races.format` | **type d'étape** : `sprint`, `montagne`, `clm`, `baroudeurs`, `clm_equipes` | valeurs ajoutées par 0044 |
| `athletes` | coureurs, un par saison | `team_id` |
| `teams` (nouvelle) | équipes de la saison (code à 3 lettres, nom) | — |
| `stage_riders` (nouvelle) | engagés d'une course : dossard, étape de l'abandon | — |
| `odds` | cotes **propres à une course** (`stage_id`), par type d'étape et par maillot ; cible coureur ou équipe (`team_id`) | historisées comme avant |
| `course_predictions` (nouvelle) | pronostics maillots d'une course, modifiables jusqu'au départ de la 1re étape | — |
| `course_jersey_results` (nouvelle) | podium final de chaque maillot | — |
| `score_ledger` | + `stage_id`, `jersey` : une ligne par (joueur, course, maillot) | — |

Pourquoi garder les noms : le moteur de points, les cartes, le grillage et les classements
fonctionnent sur `stage_id` / `race_id`. Le grillage (`grilled_states`, par `stage_id`) se trouve
ainsi limité à une course, ce que veut la règle vélo (jamais d'une classique à la suivante). Les
correctifs communs avec Biathlonpronos restent applicables (`docs/correctifs-partages.md`).

Les lectures de cotes de la page de pronostic, du dernier résultat, de la fiche admin d'une étape
et du calcul des points filtrent désormais sur `stage_id` (la course de l'étape).

## Imports (admin > « Calendrier & résultats », en bas de page)

Code : `src/lib/velo/imports.ts`, tests : `src/lib/__tests__/veloImports.test.ts`. Tous
ré-exécutables (mise à jour sans doublon). Testés de bout en bout sur un Postgres local avec les
4 fichiers de Guillaume : 20 courses 2027 (12 classiques avec leur étape unique), Tour 2026 de
test (21 étapes, 2 repos, 184 coureurs, 23 équipes, 1 519 cotes).

1. **Calendrier** (`Nom, Date debut, Date fin, Categorie, Type, Pays, Statut, Visible, Compte
   classement saison, Cyclix, Expert`) : une course par ligne, retrouvée par son nom.
2. **Étapes d'une course** (`stage_number, ville_depart, ville_arrivee, type_etape, km,
   heure_depart, date, pays, country_code, denivele`) : `R` = jour de repos. Option « décaler pour
   que la 1re étape tombe le… » pour rejouer une course passée en test.
3. **Coureurs et cotes** (`numero, prenom, nom, equipe, nom_equipe, nationalite, statut,
   cote_sprint, cote_montagne, cote_clm, cote_baroudeur, MJ, MV, MP, MJeune, SC`).
4. **Équipes** (`equipe, equipe_nom, cote_ME, CLME`) : nom complet, cotes « meilleure équipe » et
   CLM par équipes.

Une course de test se crée à la main sur la même page (« Créer une course à la main »), hors
classement par défaut.

## Libellés côté joueur

Une étape s'affiche « Étape 3 · Sprint », « Prologue · Contre-la-montre », ou seulement son type
pour une classique (étape unique **sans numéro**, migration de données **0046**). Le sexe n'est
plus jamais affiché (`displayedSex` renvoie toujours null). Sous le titre : « Départ → Arrivée ·
km » (`src/lib/raceLabel.ts`). L'encadré de la semaine de l'accueil ne montre, pour une course
par étapes, que les étapes de la veille aux 6 jours suivants. Badge des courses ×2 : « Course
majeure » (monuments, Mondiaux).

## Pronostics maillots (page `/maillots/<course>`)

Lien « Mes pronostics maillots » dans la course dépliée de Ma saison, dès que la course a des
maillots. Un choix par maillot (coureur, ou équipe pour « meilleure équipe »), parmi les engagés
qui ont une cote pour ce maillot (tous les engagés si aucun n'en a), favoris d'abord. Modifiable
jusqu'au départ de la 1re étape (RLS de `course_predictions`), en lecture seule ensuite. Les
points (Top 3 final : cote ×5/×2/×1 ; super combatif +200 et +50 par jour) arrivent avec le
moteur vélo. Pastille du général à la couleur de la course (`jersey_color`).

## Pronostic d'une étape CLM par équipes

Le joueur choisit **3 équipes** parmi celles qui ont une cote « CLM par équipes » pour la course
(onglet admin Coureurs & cotes, ou import des équipes), enregistrées dans `predictions.team_ids`.
Bonus ×2 possible comme sur une étape normale. Affichées dans Ma saison, l'encadré de la
semaine et le tableau des joueurs pendant l'étape.

Résultat : l'admin classe les équipes sur la fiche de l'étape (migration **0047**,
`race_results.team_id` ; pas d'import CSV). Points comme 3 coureurs d'une étape normale (rang ×
cote CLME, Musette, Prono parfait), puis **×2 sur le tout, Musette comprise** (règle base44 ; le
moteur hérité du biathlon ne double pas la Musette sur les autres étapes, à aligner avec le
moteur vélo). Ni carte ni étape spéciale.

## Points d'une étape (moteur vélo, 1re partie)

Moteur hérité (`computeIndividualRaceScore`) avec l'option `veloRules` :
- barème rang × cote du type d'étape (Top 10), Musette +20/+50/+100, Prono parfait +200 qui la
  remplace : inchangés ;
- **×2 sur le tout** (bonus perso ou course ×2) : coureurs, Musette, Prono parfait et combatif du
  jour (règle base44 ; en biathlon la Musette n'est pas doublée) ;
- **bonus ×2 perso : 1 par course par étapes** (Grand Tour ou course par étapes), aucun sur une
  classique ; jamais sur une étape spéciale ni une course ×2 ;
- **combatif du jour** : l'admin le désigne sur la fiche de l'étape ; +50 (×2 compris) aux joueurs
  dont le super combatif pronostiqué est ce coureur ; une étape déjà notée est renotée ;
- étapes spéciales : **Crevaison** (−position de chaque coureur hors Top 10) et **Crise de foie**
  (3/2/1 coureurs hors Top 10 → −300/−100/−30) reprennent le Brouillard et le T'es collé.
- Le Boost (×3) n'est **pas cumulable** avec un ×2, comme en biathlon (confirmé par Guillaume le
  05/11/2026 ; base44 cumulait ×3 puis ×2). Le quota de ×2 n'est contrôlé que par l'écran.

## Points des maillots (fin de course)

Admin > fiche de la course > « Podiums finaux des maillots » : podium (1-2-3) de chaque maillot,
le vainqueur seul pour le super combatif (`course_jersey_results`). Chaque enregistrement
recalcule les points du maillot (`src/lib/velo/jerseyScoring.ts`) : **cote du maillot × 5 / × 2 /
× 1** pour le coureur (ou l'équipe) pronostiqué selon sa place, **+200** au super combatif
vainqueur, sans cote. Cote retenue : celle en vigueur au départ de la 1re étape (sinon la cote
actuelle ; absente = 1, comme base44). Une ligne de `score_ledger` par joueur et par maillot
(`stage_id` + `jersey`), comptée dans le classement général ; migration **0048** : ces lignes
suivent le drapeau « hors classement » de leur course. Le joueur voit ses points sur la page
Mes maillots.

## Porteur d'eau (Grand Tour)

Même mécanique que la Pépite cachée de Biathlonpronos (décision de Guillaume), dans la même table
`pepites`, rattachée à sa course (migration **0049** : colonne `stage_id`, clé `(user_id,
stage_id)`). Un porteur par joueur et par **Grand Tour**, choisi sur la page Mes maillots du Grand
Tour, en bas ; rappel dans le bloc du Grand Tour du calendrier de Ma saison (ligne 💧), plus
d'encadré à part (demande de Guillaume du 05/11/2026). Le « super porteur d'eau » de saison reste
une idée en réserve, rien n'est codé.

- Éligible : coureur engagé dont **toutes les cotes de la course** (types d'étape et maillots) sont
  d'au moins 30 (≥ 30 comme la Pépite, confirmé par Guillaume le 05/11/2026).
- **Modifiable jusqu'au départ de la 1re étape**, figé ensuite (la Pépite est définitive dès le
  choix ; ici rien n'est encore joué avant le départ, *à confirmer*). Un porteur ne peut pas être
  retiré après le départ.
- Joué en caché sur toutes les étapes du Grand Tour (pas dans les pronostics du joueur) : à son
  **premier Top 10**, ses points de l'étape (cote du type d'étape × multiplicateur de rang)
  s'ajoutent au score de l'étape du joueur, **même sans pronostic sur l'étape**, une seule fois,
  hors ×2 et hors joker (comme la Pépite, confirmé par Guillaume le 05/11/2026 ; base44 ne le
  comptait qu'aux joueurs qui avaient pronostiqué l'étape). Pas de révélation sur un CLM par équipes.
- Badge 💧 au classement (pour l'instant au général ; règle prévue : seulement dans le classement
  du Grand Tour concerné, à faire avec le classement de saison).
- La carte Talent (biathlon) ne peut plus le modifier (`play_talent_card` refuse).

## Joker retardataire

Migration **0050** (`predictions.late_joker`) : **un par joueur et par course** (classique, course
par étapes ou Grand Tour). Il permet de pronostiquer une étape **oubliée** jusqu'à **1 h après son
départ**, tant que ses résultats ne sont pas saisis : encadré ⏰ sur la page de l'étape en cours.
Les points du pronostic sont **divisés par 2** (arrondi à l'entier inférieur, comme base44), après
le ×2 de course et les bonus ; le porteur d'eau s'ajoute ensuite, entier. Ligne « Joker
retardataire (÷ 2) » dans le détail des points (`breakdown.lateJokerMalus`).

Pas de ×2 perso ni de carte jouée avec le joker (confirmé par Guillaume le 05/11/2026). Choix
pragmatiques (*à confirmer*) : un pronostic
posé avant le départ ne peut pas devenir un pronostic joker ; le joueur voit déjà les pronostics
des autres (publics au départ), la division par 2 compense.

## Séries et cartes bonus (par course)

Décision de Guillaume du 05/11/2026 (règle base44) : **la série et les cartes sont propres à
chaque course par étapes** (courses par étapes et Grands Tours ; pas de série sur les classiques).
Migration **0051** : `streak_counters.stage_id` (clé `(user_id, stage_id)`) et
`bonus_cards.course_id`.

- **Série de 5** étapes d'affilée avec des points (porteur d'eau non compté) = une carte. Une étape
  oubliée casse la série d'un joueur qui a déjà pronostiqué la course. Elle repart de zéro à chaque
  course. Recalculée à chaque notation (`recomputeSeasonStreaks`, `computeCourseStreaks`).
- Une carte se choisit (`claim_course_card`) et se joue **seulement dans sa course** ; non jouée,
  elle est perdue à la fin de la course. Une même carte pas deux séries de suite dans la course.
- Encadré « Série en cours » (accueil, Ma saison, Classement) : celle de la course par étapes en
  cours, sinon de la prochaine (`getCardCourse`).
- Cartes proposées pour l'instant :
  - **Boost ×3** (`ca_farte` en base) : ×3 sur un coureur, sur une étape de son choix, pas avec
    son ×2 ;
  - **4e choix** (`balle_de_pioche`) : s'active à la prochaine étape, pour **3 étapes** de la course
    (règle base44 ; le CLM par équipes est sauté), 4 coureurs dont les 3 meilleurs comptent ; les
    4 sont grillés le lendemain (le grillage reprend tout le pronostic) ;
  - **Grillade** (`fondue`) : dégrille une fois ses coureurs sur l'étape de son choix.
- Pas de carte sur un CLM par équipes, ni sur une course ×2, ni hors classement. Pas de carte avec
  le joker retardataire.
- **Équipe** (`equipe`, migration 0052) : Grands Tours seulement (confirmé par Guillaume), et seulement
  avec une équipe de cœur choisie. Elle s'active à la prochaine étape ; à partir de l'**étape 10**,
  sur chaque étape restante de la course (CLM par équipes exclu), chaque coureur de l'équipe de
  cœur dans le Top 10 rapporte une fois sa cote arrondie (1 sans cote), qu'il soit pronostiqué ou
  non (`computeTeamCardBonus`).
- **Chat noir** (`chat_noir`, 0052 et 0053) : gardée en main. Une fois la course partie et jusqu'au
  **1er jour de repos à partir de l'étape 8** (décision de Guillaume du 05/11/2026 : le départ de
  la 1re étape n° >= 9 qui suit un jour sans course, heure de Paris ; ex. Tour 2027, repos à J4
  ignoré ; sans repos repéré, départ de l'étape 10 ; `chat_noir_deadline`), elle remplace **une
  fois** un coureur **abandonné** : un pronostic maillot (sauf meilleure équipe) ou le porteur
  d'eau pas encore révélé (le remplaçant doit rester éligible, cotes >= 30). Elle se joue sur la
  page des maillots (rpc `play_chat_noir`).
- **Aspiration** (`aspiration`, migration 0055, décision de Guillaume du 05/11/2026) : mêmes
  règles qu'en biathlon, dans sa course : sur une étape de son choix (sauf CLM par équipes),
  chaque coureur pronostiqué compte une place plus haut. Pas avec le Boost sur la même étape, ni
  pendant une Oreillette. Proposée dès la 1re série.
- Les cartes du biathlon Fusée, Gâchette et Talent ne sont plus proposées. Pas de carte
  gagnée sur un prono parfait (*à confirmer*).

## Pronostics de saison

Plus de pronostics de saison en vélo (demande de Guillaume du 05/11/2026), hormis l'équipe de cœur
et la nation favorite : l'encadré des globes est retiré.

**Équipe de cœur et nation favorite** (page `/coeur`, reliée depuis Ma saison et l'accueil) : une
ligne `favorite_teams` par joueur et par saison, `team_id` pour l'équipe de cœur (carte Équipe),
`nation_code` pour la nation favorite (Fête nationale, victoires sur l'accueil). Les deux se
choisissent séparément, à tout moment de la saison, et chaque choix est **définitif** (trigger
`favorite_teams_fill_only`, confirmé par Guillaume). **Équipe propre à un Grand Tour** (migration 0054, à l'essai, demande de Guillaume du 05/11/2026) :
sur la page des maillots d'un Grand Tour, le joueur garde son équipe de cœur ou en choisit une
autre pour ce Grand Tour seulement (`course_heart_teams`), modifiable jusqu'au départ de la 1re
étape (*à confirmer*). La carte Équipe utilise cette équipe en priorité. La colonne `sex`
reste à 'H' (pas de nation favorite par sexe en vélo).

## Classement de saison : résultats retenus

`getLeaderboard` (src/lib/leaderboard.ts) ne garde que les résultats retenus
(`src/lib/velo/retainedResults.ts`) : tous les Grands Tours et événements bonus, les **2 meilleures**
courses par étapes et les **8 meilleures** classiques. Une course vaut la somme de ses lignes
`score_ledger` (étapes et maillots). Les lignes sans course (questions bonus) comptent toujours.
Le classement d'une course entière (onglet Classement, filtre course sans étape choisie) ajoute
les points de ses maillots. Le picto du porteur d'eau révélé ne s'affiche que dans le classement
de son Grand Tour (`badgesInCourse`), plus dans celui de la saison.

Reste à faire : textes du règlement.

## Coureurs & cotes (admin > « Coureurs & cotes »)

Une course à la fois (par défaut la prochaine qui a des engagés). Coureurs groupés par équipe :
dossard, cotes des types d'étape présents dans la course et des maillots de la course, étape de
l'abandon (`stage_riders.abandoned_race_id`). Cotes d'équipe (meilleure équipe si la course a ce
maillot, CLM par équipes si elle a une telle étape). Case vidée = cote retirée, cote changée =
ancienne historisée. Ajout d'un coureur (créé dans la saison s'il n'existe pas) ou d'une équipe,
retrait d'un coureur. Le CSV téléchargé reprend le format d'import et se réimporte tel quel.

## À confirmer par Guillaume

- **Colonne « Visible »** : elle vaut « non » pour toutes les courses de l'export 2027 ; elle est
  ignorée et toute course importée est visible.
- **Colonne « Statut »** (2 courses futures marquées « active ») : ignorée, le statut se déduit
  des dates. **Statut des coureurs** (« abandoned ») : ignoré à l'import, comme prévu.
- **Classiques** : l'import du calendrier leur crée leur étape unique à **11 h (heure de Paris)**,
  type **Baroudeurs**, à corriger (ou réimporter un fichier d'étape d'une ligne). Les cotes d'une
  classique sont celles du type choisi.
- **Heures de départ** des fichiers d'étapes lues en **heure de Paris** (les courses hors fuseau,
  Québec, Montréal, seront à saisir en conséquence).
- **Maillots par défaut** : Grands Tours = général, points, montagne, jeune, super combatif,
  meilleure équipe ; autres courses par étapes = général, points, montagne, jeune ; classiques =
  aucun.
- **Couleur du maillot de leader** : Giro rose, Vuelta rouge, Tour et autres courses par étapes
  jaune (question ouverte n° 2 de la passation).
- **Coefficient ×2** : catégories `monument` et `world_champs`, plus les 5 monuments reconnus par
  leur nom (Paris-Roubaix, absent du CSV 2027, aura donc ×2 dès qu'il sera ajouté).
- **Week-end des Champions** : sans pays dans le CSV, rangé en France ; pas d'étape créée
  (mécanique propre à définir).
- **Cotes décimales** : arrondies à l'entier (la colonne `odds.value` est entière). Aucune dans
  les fichiers actuels.
- Une cellule de cote **vide** ne supprime pas la cote existante.

## Résultats d'étape par IA (05/11/2026)

Fiche admin d'une étape > « Récupérer les résultats avec l'IA » (`src/lib/admin/aiStageResults.ts`,
action `loadAiResults`). Équivalent vélo de l'import IBU du biathlon, qui lit une API officielle
unique ; en vélo il n'y en a pas, donc Claude (API Anthropic, recherche et lecture web côté
serveur Anthropic) cherche le résultat et croise les sources **dans l'ordre fixé par Guillaume** :
1. site officiel de la course (connu pour les grandes courses, `officialSiteFor`, sinon cherché ;
   l'admin peut coller l'adresse de la page des résultats),
2. ProCyclingStats,
3. L'Équipe.

- Demande : **Top 10** de l'étape (ou des équipes sur un CLM par équipes) et **combatif du jour** ;
  sur une étape **Crevaison**, aussi la place de chaque coureur pronostiqué, même hors Top 10.
- Réponse JSON convertie au format de l'import CSV : même rapprochement des noms (accents,
  translittérations), le tableau est pré-rempli, **rien n'est enregistré** avant le clic sur
  « Enregistrer et calculer les scores ».
- Alertes en orange : place où les sources divergent (la source prioritaire est retenue), place
  confirmée par une seule source, résultat provisoire, notes de l'IA. Liens vers les sources lues.
- Combatif : proposé avec un bouton « L'enregistrer comme combatif » (pas enregistré d'office).
- Clé `ANTHROPIC_API_KEY` dans `.env.local` et sur Vercel ; modèle `claude-opus-5-5` par défaut,
  réglable par `ANTHROPIC_MODEL` ; repli automatique sur un autre modèle si la demande est
  refusée. `maxDuration = 300` sur la page : une recherche prend une à deux minutes.
- Coût estimé (non mesuré) : environ 0,30 à 0,50 $ par étape avec Opus 5.5 (recherches web +
  pages lues), à peu près deux fois moins avec Sonnet 5.5.
- *À confirmer* : Top 10 suffisant (pas besoin des écarts) ; combatif non enregistré d'office ;
  modèle par défaut (qualité) plutôt que Sonnet (coût).

## Reste à faire (étapes suivantes)

- Écrans joueur : libellés vélo (coureurs, étapes, types), programme d'une course, pronostic d'une
  étape **CLM par équipes** (3 équipes, `predictions.team_ids`), pronostics maillots.
- Moteur de points vélo (barème, maillots, super combatif, porteur d'eau, joker) et grillage d'une
  étape à la suivante dans la course (la logique héritée « course précédente de la même étape »
  s'applique déjà telle quelle, à vérifier avec les cartes).
- Back-office : saisie des résultats d'étape et des maillots, combatif du jour.

## Fonctions biathlon retirées de l'interface (05/11/2026)

- `/globes` (pronostics de saison, Pépite de saison, équipe favorite) redirige vers `/coeur`.
- Jokers de fin de saison : plus appliqués au classement général (remplacés par les résultats
  retenus), encadré retiré du classement. `src/lib/jokers.ts` reste dans le code, inutilisé.
- Encadrés Fusée / Gâchette / Talent (série) et invitation aux pronostics de saison de l'accueil
  retirés ; pronostics de saison retirés de la fiche d'un joueur.
- Carte « 4e choix » renommée **Oreillette** (fr), Earpiece, Funk, Pinganillo, Radiolina
  (`balle_de_pioche` en base).
- Restent dans le code, invisibles en vélo faute de données : relais, tirs et tours de pénalité,
  import IBU de l'admin, globes de l'admin. La page d'accueil publique, le règlement et la FAQ
  sont encore à réécrire pour le vélo.

## Règlement, FAQ et accueil public (05/11/2026)

Page `/regles` réécrite pour le vélo (5 chapitres : les bases avec le CLM par équipes, les bonus
avec le ×2 par course, les courses majeures et le joker retardataire, les étapes spéciales, les
maillots et le porteur d'eau, le classement avec les résultats retenus). Les chiffres viennent des
constantes du moteur (barèmes, maillots, combatif, seuil du porteur, résultats retenus). FAQ :
« relais » et « jokers » remplacés par « maillots » et « joker retardataire ». Mini-écrans de
l'accueil public avec des coureurs et une étape du Tour.
