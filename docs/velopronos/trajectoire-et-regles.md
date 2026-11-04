# VéloPronos sur la base de Biathlonpronos — trajectoire et matrice des règles

Document de travail, **brouillon à valider par Guillaume** (31/10/2026). Il remplace l'approche « reprise de l'app base44 + couche de compatibilité » engagée avant le 31/10.
Sources : le règlement actuel de VéloPronos (page Aide de l'app base44, fonctions `saveStageResults`, `recalcStageScores`, modules `seasonScoring`, `favoriteBonus`, `competitionFinalize`, `bonusQuestions`, `streakSync`) et `docs/reglement.md` de Biathlonpronos.

Légende : ✅ identique ou quasi · 🔁 même idée, à adapter · ➕ spécifique vélo, à porter · 🗑 supprimé · ❓ à confirmer par Guillaume.
Tout ce qui est marqué ❓ vient d'une lecture du code base44 ou d'une ambiguïté : rien n'est tranché sans accord.

---

## 1. Décisions déjà actées

- VéloPronos repart de **Biathlonpronos** (Next.js + TypeScript + Supabase + next-intl) : même graphisme, mêmes codes (onglets, pictos), même architecture, dont **Ma saison fusionnée avec le Calendrier**.
- **Vraie application iOS et Android avec notifications push** (Capacitor + Firebase Cloud Messaging, comme Biathlonpronos), pas une PWA.
- **Un seul mode de jeu : l'ancien mode Expert** (3 coureurs, cartes, bonus/malus, séries). 🗑 Mode Cyclo, classements par mode.
- **Couleurs** : marron / jaune / blanc (jeu de variables CSS du thème, déjà prévu dans Biathlonpronos).
- **Les règles VéloPronos existantes sont conservées**, y compris celles qui sont spécifiques au vélo.
- **Reprise des joueurs 2026** dans la mesure du possible. Les données de jeu 2026 ne sont pas reprises. Abonnement base44 maintenu au niveau Starter (export de données limité).
- **Deux évolutions communes aux deux apps** : (a) classement par étapes avec dossard rouge, (b) parcours d'accueil par « course test » (voir §5).

> **04/11/2026 — fait à la duplication (branche `velopronos-init`, migration 0042)** : Biathlonpronos a supprimé la règle des biathlètes grillés et la carte Fondue. **VéloPronos garde le coureur grillé et la carte Grillade.** Le code de la règle est à reprendre du commit `91420f9` de Biathlonpronos (détail dans `docs/architecture-technique.md`).

## 1 bis. Décisions de Guillaume du 01/11/2026 (réponses à la matrice)

Ces décisions **priment** sur les statuts ❓ des §3 à §5 ci-dessous. Les 11 questions du §8 sont closes, sauf les points du §1 ter.

**Structure et cœur du jeu**
- Grillage : **uniquement à l'intérieur d'une course par étapes**. Jamais d'une classique à la suivante.
- **Prono parfait** : prime « top » qui **remplace** le bonus Top 3/5/10 s'il trouve les 3 meilleurs pronos du jour.
- **Bonus ×2 personnel** : **1 par course par étapes**. Pas de ×2 personnel sur les classiques. Les **5 monuments** et les **Mondiaux** comptent **×2 automatiquement** dans le classement.
- **Crise de foie** : le −200 est conservé si aucun pronostic n'est saisi.
- **Solidaire : supprimé.**
- **Fête nationale** : conservée en vélo, et **à réimplanter dans Biathlonpronos** avec les mêmes règles d'étape bonus que VéloPronos (étape désignée à l'avance, nation favorite du joueur).

**Séries et cartes**
- Série de **5 étapes consécutives, uniquement pour les courses par étapes** (inchangé). Un système de **fidélité par paliers** (points atteints ou nombre de courses pronostiquées) est à l'étude, pas encore défini.
- Noms propres au vélo : **Bonus ×3 → « Boost »**, **4e choix → « Oreillette »**. Biathlonpronos garde « Ça farte » et « Balle de pioche ». Oreillette : 3 étapes en vélo, 4 courses en biathlon (2 hommes + 2 femmes en individuel, relais exclus).
- **Carte Équipe** : Grands Tours inchangés ; courses par étapes courtes : disponible dès la 1re série de 5 ; **pas sur les classiques**.
- **Chat noir** : **vélo uniquement**, 1re semaine d'un Grand Tour. Pas sur les courses par étapes courtes. **À retirer de Biathlonpronos.**
- **Aspiration** : à implémenter aussi en vélo, mêmes règles, valable sur **une seule course**.
- **Plus aucune carte gagnée sur un prono parfait ni en bonus de départ** (règle déjà abandonnée).

**Pronostics et classements**
- **Porteur d'eau** = même logique et même visuel que la **Pépite**. Vélo : un par Grand Tour. Biathlon : un par sexe et par saison. *En réserve* : un « super porteur d'eau » de saison, ou une carte qui réactive un porteur déjà révélé / en ajoute un second.
- **Équipe et nation de cœur** : **informatives** (victoires de la nation et de l'équipe affichées sur le tableau de bord), comme en biathlon. Elles **alimentent certaines cartes bonus**. Plus de bonus de saison par paliers.
- **Biathlonpronos — jokers de fin de saison** : on **efface les 3 plus mauvais résultats** de courses individuelles (hors Mondiaux) **et les 2 plus mauvais relais**.
- **Classements annexes** (vert, pois, bleu) : uniquement sur les **3 Grands Tours**, « à voir si trop complexe » (chantier de deuxième vague).
- **Biathlonpronos — classement par étapes** avec **dossard rouge** pour son leader, sur le principe des courses par étapes vélo. En vélo, **les couleurs de maillot dépendent de la course** (Giro rose, Tour jaune, Vuelta rouge, etc.).
- **Badges conservés** :
  - ⚡ **Éclair** : bonus ×2 utilisé (en biathlon, avec le nombre d'utilisations ; en vélo, seulement dans le classement d'un Grand Tour) ;
  - ⭐ **Étoile** : prono parfait ;
  - 💧 **Goutte / cristal** : porteur d'eau révélé (en vélo, seulement dans le classement du Grand Tour concerné, pas au général) ;
  - 🍾 **Champagne** : meilleur score de l'étape. Plus de badge « victoire d'étape » pour avoir trouvé le vainqueur.
  - **Nouveaux pictos** : **dossard rouge** (victoire d'un classement par étapes en biathlon) et **maillot** jaune / rose / rouge (victoire d'une course par étapes ou d'un Grand Tour en vélo).

**Parcours d'accueil (les deux apps)**
- Il n'y a **pas de course test fictive**. Le bouton « Jouer » mène à la **prochaine course disponible, chronologiquement**. Le nouveau joueur pronostique comme tout le monde, sa participation compte.
- Identité (pseudo, prénom, nom, e-mail) demandée **à la validation du premier pronostic**. Retour par **code à 6 chiffres**, pas de mot de passe obligatoire.
- Après la course, il doit être **challengé** : voir ses résultats comparés aux autres joueurs et avoir envie de s'engager (ligues, saison, classement).

**Ordre de travail**
- On **finalise d'abord Biathlonpronos avec toutes ces modifications**, puis on **duplique** pour lancer VéloPronos nouvelle formule.
- Reprise des joueurs 2026 : fichier fourni (504 joueurs, e-mails, pas de pseudo).

## 1 ter. Points tranchés le 01/11/2026 (soir)

1. **Paris-Roubaix** : à **ajouter** au calendrier 2027 (5e monument ; absent de l'export CSV). Date à renseigner par Guillaume.
2. **Cartes bonus** (Boost, Oreillette, Aspiration, Équipe) : liées à la série de 5, donc **uniquement sur les courses par étapes et les Grands Tours**, sauf exceptions déjà listées.
3. **Fête nationale en biathlon** : étape bonus **désignée à la main**, comme en vélo.
4. **Priorités** : validées. Pour Biathlonpronos, Guillaume laisse l'ordre à Claude (« lance toutes les modifs »).

## 2. Structure : une différence qui conditionne tout

| | Biathlonpronos | VéloPronos |
|---|---|---|
| Un lieu / une épreuve | **étape** (un site, plusieurs courses) | **course** (une compétition) |
| Une épreuve sur une journée | **course** (sprint, poursuite…) | **étape** (ou la course elle-même si c'est une classique) |
| Types | formats : sprint, poursuite, individuel, mass start, relais | **courses d'un jour** (classiques, monuments, Mondiaux) et **courses par étapes** (Paris-Nice… Grands Tours) |
| Profil de l'épreuve | format de course | type d'étape : sprint, montagne, CLM, accidentée, CLM par équipes |
| Pronostics « longue durée » | globes de saison | **maillots par course** (grands tours et courses par étapes) |

Conséquence : on garde le modèle `season → stage → race` de Biathlonpronos mais on le généralise en **saison → course → étape**, avec une course d'un jour = course à une seule étape. À prévoir dès le schéma :
- cotes par coureur **et par type d'étape** (modèle `odds` historisé de Biathlonpronos, format remplacé par le profil) ;
- état « grillé » **à l'intérieur d'une course par étapes** ❓ (une course d'un jour n'a pas de lendemain : confirmer que le grillage ne passe pas d'une classique à la suivante) ;
- pronostics maillots rattachés à la **course**, pas à la saison.

## 3. Matrice des règles

### 3.1 Cœur du jeu

| Règle | Statut | Détail |
|---|---|---|
| Barème de position × cote (25/18/13/10/7/5/4/3/2/1), Top 10 | ✅ | Identique. Cote selon le type d'étape. |
| 3 choix par étape | ✅ | |
| Coureur grillé (non rejouable le lendemain) | ✅➕ | **À garder dans VéloPronos.** Supprimé de Biathlonpronos le 04/11/2026 : à remettre lors de la duplication (code du commit `91420f9`, voir `docs/architecture-technique.md`, section du 04/11/2026). Vélo : grillage d'une étape à la suivante, dans une même course. |
| Bonus de combinaison Top 10 / Top 5 / Top 3 (« Musette ») : +20 / +50 / +100 | ✅ | Mêmes montants que Biathlonpronos. |
| Prono parfait +200 | ✅❓ | Biathlonpronos : il **remplace** le bonus Top 3/5/10. À confirmer que c'est aussi le cas dans VéloPronos (le code base44 est à vérifier). |
| Verrouillage au départ | ✅ | |
| Bonus ×2 | 🔁❓ | Biathlonpronos : 3 par saison. VéloPronos : **1 par compétition**. Pour une classique, ça donnerait un ×2 par course d'un jour : à trancher (par exemple 1 par course par étapes + un quota sur les courses d'un jour). Non cumulable avec les étapes spéciales. |
| Coefficient ×2 des Mondiaux | ❓ | Le champ existe dans le modèle base44 (`season_multiplier`) mais le CSV 2027 ne le renseigne pas. Appliquer ×2 aux Championnats du monde ? Aux Grands Tours ? |
| Joker retardataire (1 par compétition, jusqu'à 1 h après le départ, points ÷ 2) | ➕ | Absent de Biathlonpronos. Gardé. |
| Questions bonus pendant les courses | ✅ | Existent dans VéloPronos ; prévues dans Biathlonpronos. Une seule implémentation, avec notification push à l'ouverture d'une question. |

### 3.2 Étapes spéciales (une étape désignée à l'avance porte une règle)

| VéloPronos | Équivalent Biathlonpronos | Statut |
|---|---|---|
| **Crise de foie** : 3/2/1 coureurs hors Top 10 → −300 / −100 / −30 | « T'es collé(e) » (mêmes montants) | ✅ — le −200 si le joueur ne pronostique pas existe en biathlon ; ❓ pour la Crise de foie |
| **Crevaison** : −position pour chaque coureur hors Top 10 | « Brouillard » | ✅ |
| **Fête nationale** : ses coureurs de sa nation favorite ×2 | « Bonus Team Nation » (🗑 retiré le 30/10, trop compliqué) | ➕❓ Spécifique vélo, désignée sur une étape précise. À garder ? |
| **Solidaire** : 0 point → 4 coureurs le lendemain ; 3 coureurs marquent et tu mènes → 2 coureurs ; −200 si on zappe | — | ➕ |
| Tour de péna, Fusée, Gâchette | spécifiques biathlon | 🗑 (côté vélo) |

### 3.3 Cartes bonus et séries

Série : VéloPronos **5 étapes consécutives** avec des points (uniquement Grands Tours et courses par étapes), Biathlonpronos **10 courses** sur la saison. Le joueur choisit sa carte à chaque palier dans les deux jeux.

| Carte | Statut | Écarts à régler |
|---|---|---|
| Grillade (vélo) = **Fondue** (biathlon) | ➕ | **À garder dans VéloPronos.** Fondue supprimée de Biathlonpronos le 04/11/2026 avec le grillage : reprendre le code du commit `91420f9` (`FondueButton.tsx`, valeur `fondue` de `claim_bonus_card` avant la migration 0036). |
| **Bonus ×3** (vélo) = **Ça farte** (biathlon) | ✅ | |
| **4e choix** | 🔁❓ | Vélo : 3 étapes suivantes, les 4 coureurs sont grillés le lendemain. Biathlon : 4 courses, une carte à la fois. |
| **Équipe** | 🔁❓ | Vélo : à partir du mardi de la 2e semaine d'un Grand Tour. Biathlon : après les Mondiaux/JO. Quelle règle de début pour les courses de 5-8 jours et les classiques ? |
| **Chat noir** | 🔁 | Vélo : corriger un maillot ou le porteur d'eau après un abandon, jusqu'au 1er jour de repos. Même esprit que biathlon (corriger un globe). |
| Aspiration (biathlon) | 🗑 côté vélo ❓ | Absente de VéloPronos : non portée sauf demande. |
| Cartes gagnées sur « prono parfait » ou en bonus de départ | ❓ | Le code base44 connaît ces deux sources (`perfect_prediction`, `initial_bonus`). À confirmer si on les garde. |

### 3.4 Pronostics à l'échelle d'une course (remplacent les globes de saison)

| Règle | Statut | Détail |
|---|---|---|
| **Maillots** : jaune, vert, à pois, meilleur jeune, **Meilleure équipe** — cote × 5 / 2 / 1 pour le Top 3 | ➕ | Posés avant le départ, par course par étapes. Équivalent des globes. |
| **Super combatif** : +200 à la fin ; +50 chaque jour où il est combatif du jour | ➕ | |
| **Porteur d'eau** : outsider caché (toutes cotes > 30), ajouté virtuellement à tous les pronostics jusqu'à sa révélation, ne rapporte qu'une fois | ➕ | Cousin de la Pépite de Biathlonpronos. ❓ Une seule logique commune ou deux ? |
| **Équipe de cœur** : −10, −20… par abandon (cumulatif) ; +200 si aucun abandon | ➕❓ | En biathlon l'équipe favorite est devenue **informative** (plus aucun point). À confirmer que le vélo garde ses points. |
| **Nation favorite** (pour la Fête nationale) | ➕❓ | Idem. |
| **Course par équipes (CLME)** : on pronostique 3 équipes, avec leurs cotes | ➕ | |
| **Championnats nationaux** (« Week-end des Champions ») | ➕ | Mécanique propre (champion par pays, barème). À détailler plus tard. |

### 3.5 Classements

| Règle | Statut | Détail |
|---|---|---|
| Classement général de saison | 🔁 | **Résultats retenus** : tous les Grands Tours, les **2 meilleures** courses par étapes, les **8 meilleures** classiques, tous les événements bonus. Biathlonpronos additionne tout. |
| Bonus de saison équipe/nation favorite (paliers selon les victoires de leurs coureurs) | ➕❓ | Existe dans VéloPronos (`FavoriteTier`). À garder ? |
| **Classement par course par étapes** | 🔁 | À distinguer du général. Voir §4. |
| Classements annexes par profil (maillot vert / pois / bleu) | 🗑❓ | Je recommande de les supprimer avec les modes de jeu. À confirmer. |
| Séparation Cyclo / Expert | 🗑 | |
| Ligues | ✅ | |
| Badges (Victoire d'étape, Prono parfait, Champagne, ×2, Porteur d'eau) | 🔁 | Réutiliser le système de pictos de Biathlonpronos. |

## 4. Évolution commune : classement par étapes et dossard rouge

- Biathlonpronos : ajouter un **classement « par étapes »** (par site), dont le leader porte le **dossard rouge**, avec le picto à côté de son nom dans les classements. (Le règlement actuel réserve le dossard rouge aux « classements annexes » ; il faudra le mettre à jour.)
- VéloPronos : même mécanique pour les **courses par étapes**, chacune avec son classement. Le picto du leader d'une course par étapes dépend du dossard/maillot choisi par Guillaume ❓.
- Dans les deux cas, ce classement est **un agrégat du `score_ledger`**, jamais un recalcul à part (principe du moteur de Biathlonpronos).

## 5. Parcours d'accueil : jouer avant de s'inscrire

> **Correction du 01/11/2026** : la « course test » n'est pas une course fictive. Le bouton « Jouer » mène à la **prochaine course disponible** (par exemple lors d'une opération de communication sur l'étape du Grand-Bornand), et le pronostic du nouveau joueur compte comme celui des autres. Il revient (ou reçoit un e-mail) après la course pour voir ses résultats, et doit alors être **incité à se comparer aux autres et à rejoindre la bagarre**. Le point 1 ci-dessous est à lire dans ce sens.

Objectif demandé : le bouton « Jouer » mène à la **prochaine course** jouable sans compte ; l'identité (pseudo, nom, prénom, e-mail) n'est demandée qu'à la **validation du premier pronostic**.

Recommandation technique (validée sur le principe : pas de mot de passe, code à 6 chiffres) :

1. **« Jouer »** crée un **compte anonyme Supabase** (aucune donnée personnelle) et ouvre la prochaine course. Le joueur choisit ses biathlètes ou coureurs comme les autres ; son pronostic est enregistré sous cet identifiant anonyme.
2. À la **validation du premier vrai pronostic**, on demande pseudo, prénom, nom et e-mail. Le compte anonyme est **converti en compte permanent avec le même identifiant** : le pronostic reste rattaché, sans fusion à gérer.
3. **Pas de mot de passe à cet instant.** On envoie un e-mail avec un **code à 6 chiffres** (plus fiable qu'un lien dans une appli mobile). Un mot de passe, ou la connexion Apple/Google, reste proposé plus tard.
4. **Mon avis sur ton idée d'attendre les premiers résultats** : elle réduit la friction, mais elle a deux défauts. Si l'e-mail est mal saisi, tu ne le sauras qu'au moment du retour, quand le joueur est déjà parti. Et si la session anonyme disparaît (appli réinstallée, changement de téléphone), le pronostic est perdu. Compromis proposé : on prend l'e-mail à la validation, on envoie un code **sans bloquer** le joueur (il continue à jouer), et le premier e-mail de résultats contient un lien qui confirme l'adresse et propose de compléter le compte. Les fonctions complètes (ligues, historique, changement d'appareil) exigent l'e-mail confirmé.
5. **Précautions** : limiter la création de comptes anonymes (captcha ou limite par appareil), adapter les règles RLS (un compte anonyme n'accède qu'à la course test et à son propre pronostic), purger les comptes anonymes inactifs, et prévoir la mention RGPD au moment de la collecte.

## 6. Reprise des joueurs 2026

L'export de base44 est bloqué avec l'abonnement Starter. Pistes à étudier :
1. Récupérer la liste des utilisateurs par une **fonction base44 temporaire** (une fonction backend peut lire l'entité User) ou par la page de gestion des utilisateurs de base44.
2. Importer **pseudo + e-mail** dans Supabase, puis envoyer une invitation à rejoindre la nouvelle app (lien magique ou code), sans mot de passe.
3. Vérifier la base légale RGPD de ce contact (information préalable, lien de désinscription).

## 7. Plan de travail proposé

0. **Ne pas toucher au dépôt Biathlonpronos avant son lancement (fin novembre)** : tout est préparé dans une copie.
1. Valider ce document (points ❓).
2. Copier Biathlonpronos dans un nouveau dépôt, puis poser le thème marron/jaune/blanc et la configuration « cyclisme ».
3. Nouveau schéma (saison → course → étape, cotes par profil, maillots par course) dans un **nouveau projet Supabase**, avec import du calendrier 2027 déjà préparé.
4. Moteur de scoring vélo en fonctions pures testées (Vitest), porté depuis `saveStageResults` : étapes spéciales, cartes, séries, maillots, équipe de cœur, porteur d'eau, joker, résultats retenus.
5. Écrans, back-office, imports (étapes, coureurs).
6. Parcours invité, classement par étapes, notifications push.
7. Applis iOS/Android (Capacitor + Firebase), reprise des joueurs, test sur une vraie course.
8. Après le lancement de Biathlonpronos : **reporter dans Biathlonpronos** le classement par étapes et le parcours invité, puis envisager un noyau commun partagé entre les deux apps.

Échéance : première course Strade Bianche le **6 mars 2027**.

## 8. Questions à trancher

1. Le grillage ne s'applique qu'à l'intérieur d'une course par étapes (jamais d'une classique à une autre) ?
2. Bonus ×2 : combien, et sur quelles courses (surtout les classiques) ?
3. Coefficient ×2 : Championnats du monde ? Grands Tours ?
4. Prono parfait : remplace-t-il le bonus Top 3/5/10 comme en biathlon ?
5. Équipe de cœur et nation favorite : gardent-elles leurs points en vélo (alors qu'elles sont devenues informatives en biathlon) ? Et les paliers de bonus de saison ?
6. Fête nationale, Solidaire : on garde ?
7. Cartes : durée du 4e choix (3 étapes ou 4), début de la carte Équipe, cartes gagnées sur prono parfait / bonus de départ ?
8. Porteur d'eau et Pépite : une logique commune ou deux ?
9. Classements annexes (vert / pois / bleu) : suppression confirmée ?
10. Classement par course par étapes : quel dossard ou maillot pour le leader ?
11. Parcours invité : le compromis du §5 (e-mail pris à la validation, code non bloquant) te convient-il ?
