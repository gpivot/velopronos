# VéloPronos — duplication depuis Biathlonpronos (04/11/2026)

Le dépôt `gpivot/velopronos` est une copie de `gpivot/biathlonpronos` **avec tout son historique**
(dernier commit commun : `e527158`, fusion de la PR #61). L'ancien dépôt base44 a été renommé
`gpivot/velopronos-base44` et archivé : il ne sert plus que de référence pour les règles.

## Ce qui a été fait à la duplication

1. **Coureur grillé et carte Grillade remis** (Biathlonpronos les a retirés le 04/11/2026, commit
   `c6b8e45`) : code repris du commit `91420f9`.
   - `src/lib/grilling.ts` et son test, `GrilladeButton.tsx` (ancien `FondueButton.tsx`), calcul
     des grillés dans `courses/[raceId]/page.tsx`, prop `grilledAthleteIds` de `PredictionForm`,
     ligne « grillé » du « ? », fiche du Règlement, question de la FAQ, textes des 5 langues.
   - En base, la carte garde la valeur `fondue` du type `bonus_card_type` (pas de renommage
     d'enum, pour que les migrations communes restent applicables telles quelles) ; elle s'appelle
     « Grillade » à l'écran. Migration **0042** : `claim_bonus_card` et `play_bonus_card` l'acceptent
     de nouveau.
   - Le grillage reste celui du biathlon (course précédente de la même étape, même sexe). Son
     adaptation au modèle vélo (d'une étape à la suivante, à l'intérieur d'une course par étapes)
     se fera avec le nouveau schéma.
2. **Couleurs marron / jaune / blanc** : variables de `src/app/globals.css` (thèmes sombre et
   clair), `teal` et `blue` de `tailwind.config.ts`, écrans hors ligne de l'appli. Les noms des
   variables (`ice`, `gold`…) sont gardés pour que le code reste commun aux deux apps.
3. **Noms** : paquets `velopronos` et `velopronos-mobile`, nom d'appli « VéloPronos », URL de
   l'appli `www.velopronos.fr`.
4. **Documents VéloPronos** rangés dans `docs/velopronos/` (passation, trajectoire et règles, ce
   fichier). Méthode pour les correctifs communs : `docs/correctifs-partages.md`.

Les textes de l'app parlent encore de biathlon (biathlètes, sprint, poursuite…) : ils changeront
avec le nouveau schéma et les écrans vélo.

## À confirmer par Guillaume

- **Palette** : première proposition (sombre : fond marron foncé, accent jaune maillot, accent
  ocre ; clair : fond crème, accent marron, accent jaune foncé). À valider à l'écran.
- **Noms de la carte Grillade dans les autres langues** : Barbecue (en), Grillfest (de),
  Parrillada (es), Grigliata (it). Les autres langues sont-elles utiles pour VéloPronos ?
- **Identifiant d'application** (`appId`, aujourd'hui encore `fr.biathlonpronos.app`) : nouvel
  identifiant `fr.velopronos.app`, ou celui d'une appli VéloPronos déjà publiée ? À changer en même
  temps dans `mobile/capacitor.config.ts`, `mobile/android` (build.gradle, AndroidManifest,
  dossier Java, strings.xml), `mobile/ios` (project.pbxproj, Info.plist), `codemagic.yaml`, et
  avec les nouveaux fichiers Firebase (`google-services.json`, `GoogleService-Info.plist`).
- **Domaine** : `velopronos.fr` pointe encore vers l'app base44. Bascule à prévoir.
- **E-mails de connexion** (04/11/2026) : Supabase ne laisse modifier les modèles « Magic Link » et
  « Change Email Address » qu'avec un SMTP personnalisé (par exemple Resend, comme Biathlonpronos),
  donc avec une adresse d'expédition sur le domaine VéloPronos. En attendant, les e-mails envoient
  un lien et pas le code à 6 chiffres : à régler avant le lancement.
- **Dépôt public** : `gpivot/velopronos` a été créé public (comme Biathlonpronos). Aucune donnée de
  joueur n'y est ; le passer en privé reste possible à tout moment.

## Mise en route d'un nouveau projet Supabase

Projet neuf, région `eu-west-1` (Irlande), comme Biathlonpronos. Les migrations 0001 à 0042
s'exécutent dans l'ordre. Elles ont été regroupées en 5 lots, coupés après chaque migration qui
ajoute une valeur à un type (Postgres refuse d'utiliser une valeur ajoutée dans la même
transaction) : 0001–0008, 0009–0025, 0026–0029, 0030–0039, 0040–0042. Puis, pour tester,
`supabase/seed.sql` (données biathlon d'exemple, à remplacer par des données vélo).

Réglages à reprendre de Biathlonpronos dans le nouveau projet (voir `docs/architecture-technique.md`) :
activer pg_cron (Database > Extensions) **avant le lot 4** ; Authentication : connexions anonymes
activées, limite par adresse IP, code e-mail à 6 chiffres, modèles « Magic Link » et « Change Email
Address » avec `{{ .Token }}` ; fournisseurs Google / Apple plus tard, avec les applis.
Clés : `.env.local` (jamais versionné) et variables Vercel, recopiées depuis Project Settings > API.
