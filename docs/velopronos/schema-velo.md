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

## Imports (admin > « Courses vélo (imports) »)

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

## Reste à faire (étapes suivantes)

- Écrans joueur : libellés vélo (coureurs, étapes, types), programme d'une course, pronostic d'une
  étape **CLM par équipes** (3 équipes, `predictions.team_ids`), pronostics maillots.
- Moteur de points vélo (barème, maillots, super combatif, porteur d'eau, joker) et grillage d'une
  étape à la suivante dans la course (la logique héritée « course précédente de la même étape »
  s'applique déjà telle quelle, à vérifier avec les cartes).
- Back-office : saisie des résultats d'étape et des maillots, abandons, combatif du jour, édition
  des champs vélo d'une course (type, maillots, couleur) et d'une étape (type, villes).
