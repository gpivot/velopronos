# VéloPronos — document de passation pour le projet « VéloPronos »

À importer dans le projet VéloPronos (fichiers de référence) avec `velopronos-trajectoire-et-regles.md` et `reference-code-base44.zip`.
État des lieux au **01/11/2026**, pour qu'un nouveau fil reparte sans avoir besoin de la conversation d'origine (qui sera fermée).

## En une phrase

VéloPronos (jeu de pronostics cyclistes, sur base44 en 2026, ~500 joueurs inscrits de juin à octobre) est reconstruit **à partir du code de Biathlonpronos** (Next.js + TypeScript + Supabase + Capacitor/push), avec les règles propres au vélo, en vraie application iOS/Android avec notifications. **Ordre acté : on finalise d'abord Biathlonpronos (et on le lance, fin novembre 2026), puis on le duplique pour VéloPronos.** Première course vélo : Strade Bianche, le 6 mars 2027.

## Où est quoi

| Élément | Emplacement | Statut |
|---|---|---|
| Règles, décisions, matrice vélo/biathlon, parcours d'accueil | `velopronos-trajectoire-et-regles.md`. Lire d'abord la section **1 bis** (décisions du 01/11) et **1 ter**. | À jour. Ce document vit hors des dépôts. |
| Ancien code base44 (référence) | `reference-code-base44.zip` : entités (modèle de données), fonctions backend (scoring), modules partagés, règlement de l'app. Dépôt privé d'origine : `gpivot/velopronos`. | **Référence de règles uniquement** |
| Calendrier 2027 | `~/Documents/VIDEO/VeloPronos/2027/bfc9c41ae_courses-2027.csv` | 20 courses ; **Paris-Roubaix manque** (5e monument, date à fournir) |
| Données de test | `~/Documents/VIDEO/VeloPronos/Tour 2026/` : coureurs (184, avec cotes) et étapes du Tour 2026 (21 étapes, 2 repos) | Pour une course « Tour de France 2026 (test) », dates décalées dans le futur |
| Joueurs 2026 | `~/Documents/VIDEO/VeloPronos/V_loPronos-users.csv` | 504 e-mails valides et uniques, **pas de pseudo**, 98 adresses relais Apple. **Ne jamais copier ces données dans un dépôt.** |
| Projet Supabase VéloPronos | Créé (voir le tableau de bord de Guillaume) | Contient un schéma de l'ancienne approche (migrations 0001–0009, abandonnées) : **à vider et reconstruire** |
| base44 | Abonnement Starter conservé | Export de données limité ; les pseudos n'ont pas été exportés |

## Ce qui a été fait puis abandonné

Une couche de compatibilité base44 → Supabase (client, authentification, 45 fonctions Edge, migrations 0001–0009, seeds SQL du calendrier et du Tour test) a été écrite dans `~/Downloads/velopronos-main`, puis **abandonnée** : restyler l'app base44 et retirer le mode Cyclo aurait doublé le travail. **Rien n'a été déployé.** Ces fichiers ne servent plus que de source pour porter les règles.

Réutilisable : les CSV et leur logique de conversion, l'inventaire des règles, le modèle des 39 entités base44.

## Où retrouver chaque règle dans l'ancien code (`reference-code-base44.zip`)

| Sujet | Fichier |
|---|---|
| Moteur de points affiché dans l'app, ordre de calcul | `src/lib/predictionPoints.js` |
| Calcul serveur des résultats d'étape (1 100 lignes : barème, bonus Musette, prono parfait, étapes spéciales, cartes, porteur d'eau, combatif, joker) | `base44/functions/saveStageResults/entry.ts`, `recalcStageScores/entry.ts` |
| Textes du règlement | `src/pages/Aide.jsx` |
| Types d'étapes, étapes spéciales, maillots | `src/lib/constants.js` |
| Classement de saison (Grands Tours + 2 meilleures étapes + 8 meilleures classiques) | `base44/shared/seasonScoring.ts` |
| Séries de 5 et cartes | `base44/shared/streakSync.ts` |
| Bonus favoris équipe/nation (abandonnés, informatifs désormais) | `base44/shared/favoriteBonus.ts` |
| Finalisation d'une course | `base44/shared/competitionFinalize.ts` |
| Questions bonus | `base44/shared/bonusQuestions.ts` |
| Modèle de données (champs, énumérations, règles d'accès) | `base44/entities/*.jsonc` |
| Automatisations (activation des étapes toutes les 5 min, rappel H-2) | `base44/workflows/` |

## Formats de fichiers déjà utilisés par Guillaume

- **Courses** : `Nom, Date debut, Date fin, Categorie, Type, Pays, Statut, Visible, Compte classement saison, Cyclix, Expert`. Catégories : `grand_tour`, `stage_race`, `monument`, `world_tour`, `world_champs`, `national_championships`. Types : `grand_tour`, `stage_race`, `one_day`, `bonus_event`. Le CSV 2027 marquait deux courses futures « active » : à corriger en « upcoming ».
- **Étapes** : `stage_number, ville_depart, ville_arrivee, type_etape, km, heure_depart, date, pays, country_code, denivele`. `stage_number = R` pour un jour de repos. Types : `Sprint`, `Montagne`, `Baroudeurs`, `CLM`, `CLME` (par équipes).
- **Coureurs** : `numero, prenom, nom, equipe, nom_equipe, nationalite, statut, cote_sprint, cote_montagne, cote_clm, cote_baroudeur, MJ, MV, MP, MJeune, SC`. Le statut est ignoré à l'import (tous « active »).

## Décisions structurantes (détail dans le document de trajectoire)

- Un seul mode : l'ancien mode Expert. Fin du mode Cyclo, des classements par mode et de Solidaire.
- Graphisme, onglets et pictos de Biathlonpronos ; couleurs marron / jaune / blanc ; la couleur du maillot d'un classement dépend de la course ; Ma saison fusionnée avec le Calendrier.
- Structure : « étape » biathlon (un site) = « course » vélo ; « course » biathlon = « étape » vélo. Une classique est une course à une seule étape. Grillage uniquement à l'intérieur d'une course par étapes.
- Cartes et séries de 5 étapes **uniquement pour les courses par étapes et les Grands Tours** : Boost (×3), Oreillette (4e choix, 3 étapes), Aspiration, Équipe ; Chat noir réservé à la 1re semaine d'un Grand Tour. Plus de carte gagnée sur un prono parfait.
- Bonus ×2 personnel : un par course par étapes ; les 5 monuments (Milan-San Remo, Tour des Flandres, Paris-Roubaix, Liège-Bastogne-Liège, Tour de Lombardie) et les Mondiaux comptent ×2 d'office.
- Classement saison : tous les Grands Tours + 2 meilleures courses par étapes + 8 meilleures classiques + événements bonus.
- Équipe et nation de cœur : informatives (victoires affichées), elles nourrissent certaines cartes. Fête nationale conservée, à désigner à la main.
- Porteur d'eau = même logique que la Pépite, un par Grand Tour.
- Parcours d'accueil (les deux apps) : « Jouer » ouvre la prochaine course ; identité demandée à la validation du premier pronostic ; code à 6 chiffres, pas de mot de passe obligatoire.
- Reprise des joueurs 2026 par invitation e-mail.
- **Duplication** : un **nouveau dépôt** VéloPronos, créé à partir d'une copie de Biathlonpronos une fois ses modifications faites et son lancement passé, avec son propre projet Supabase, son domaine et ses applis. Rien ne se synchronise automatiquement ensuite ; un noyau commun pourra être extrait plus tard.

## Questions encore ouvertes

1. Date de **Paris-Roubaix 2027**.
2. **Couleur du maillot** de chaque course par étapes (Giro rose, Tour jaune, Vuelta rouge, autres courses ?).
3. **Fidélité par paliers** (points ou courses pronostiquées) : à définir.
4. **Super porteur d'eau** de saison ou carte qui réactive un porteur : en réserve.
5. Classements annexes (vert / pois / bleu) des 3 Grands Tours : deuxième vague, si pas trop complexe.
6. **Fiches App Store / Google Play** de VéloPronos : une appli existe-t-elle déjà ? Faut-il réutiliser le même identifiant d'application pour ne pas perdre les installations ?
7. **Reprise des joueurs** : valider le message d'invitation (information, désinscription) ; déclarer le domaine d'envoi chez Apple pour joindre les 98 adresses relais ; décider quoi faire des pseudos (non exportés).
8. Nom de domaine et adresse d'expédition des e-mails.

## Façon de travailler avec Guillaume

- Il écrit en français ; réponses courtes et concrètes.
- Quand une règle est ambiguë : choix pragmatique, **consigné « à confirmer »** dans la documentation, puis relu par lui.
- Vérifier chaque changement (types, tests, contrôle dans le navigateur pour l'interface).
- Il colle lui-même les migrations SQL dans Supabase (aucun DDL exécuté par Claude).
- Ne pas pousser sur GitHub sans demande ; lui rappeler de faire `git pull` au début et `git push` à la fin. (Ses identifiants GitHub dans le terminal sont instables : l'envoi par l'interface web de GitHub fonctionne.)
- Ne jamais lui demander de coller une clé secrète dans le chat (clé `service_role`, mots de passe, tokens).
- Garder séparés les deux projets : aucun document VéloPronos dans le dépôt Biathlonpronos.

## Texte à coller dans les instructions du projet VéloPronos

> VéloPronos est la version cyclisme de Biathlonpronos : même base de code (Next.js, Supabase, Capacitor), mêmes codes graphiques, couleurs marron / jaune / blanc, un seul mode de jeu (3 coureurs, cartes bonus, séries de 5 sur courses par étapes). Lis d'abord `velopronos-passation-projet.md` puis `velopronos-trajectoire-et-regles.md` (section 1 bis) ; `reference-code-base44.zip` sert uniquement à retrouver les règles de l'ancienne app. On ne démarre le développement qu'une fois Biathlonpronos finalisé et lancé, puis dupliqué dans un nouveau dépôt. Réponds en français, de façon courte et concrète ; consigne les interprétations « à confirmer » dans la documentation ; ne pousse sur GitHub que sur demande ; ne copie jamais la liste des joueurs dans un dépôt.
