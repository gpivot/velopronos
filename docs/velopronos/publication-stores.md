# VéloPronos — publication sur les stores et notifications push (09/11/2026)

Même montage que Biathlonpronos (voir `docs/architecture-technique.md`, « Applis Android / iOS et
notifications ») : appli Capacitor dans `mobile/` qui ouvre le site, notifications par Firebase
Cloud Messaging, builds sur Codemagic (`codemagic.yaml`).

## Déjà prêt dans le code

| Élément | Valeur | Où |
| --- | --- | --- |
| Identifiant Android | `fr.velopronos.app` (nouvelle fiche, compte organisation) | `mobile/android/app/build.gradle`, `capacitor.config.ts` |
| Identifiant iOS | `com.base6a1f0e7a3cd8ee2103802f51.app` (appli VéloPronos déjà sur l'App Store) | `project.pbxproj` |
| Version | iOS 2.0 (build = numéro Codemagic) ; Android 2.0.<build> | `codemagic.yaml` |
| Icône et écran de démarrage | **Provisoires** : roue de vélo jaune sur fond marron, mot « VéloPronos » | sources `mobile/assets/`, regénérés par `npm run assets` dans `mobile/` |
| Petite icône des notifications Android | la roue, en blanc | `res/drawable/ic_stat_notify.xml` |
| Écran hors ligne | bouton « Réessayer » vers `www.velopronos.fr` | `mobile/www/` |
| Adresse ouverte par l'appli | `www.velopronos.fr`, ou `VELOPRONOS_URL` si fourni au build | `capacitor.config.ts`, `codemagic.yaml` |
| Signature, envoi TestFlight | clé « VeloPronos » (Android) et intégration « VeloPronos » (iOS) dans Codemagic | `codemagic.yaml` |
| Garde-fou | le build s'arrête tout de suite si les fichiers Firebase sont encore ceux de Biathlonpronos | `codemagic.yaml`, étape « Vérifier les fichiers Firebase » |
| Connexion Google dans l'appli | **masquée** tant que les identifiants VéloPronos ne sont pas fournis (étape 6) | `src/lib/native/socialLogin.ts` |
| Suppression du compte dans l'appli (exigée par Apple) | déjà en place (Profil) | `compte/DeleteAccountButton.tsx` |

## Ce qui attend GitHub

Codemagic lit le code sur le dépôt : tant que le compte GitHub est suspendu, aucun build n'est
possible. Toutes les étapes ci-dessous (comptes, clés, Firebase) peuvent en revanche se faire dès
maintenant. Les envois à Claude marqués 📩 servent à finir le code ; rien de secret ne doit passer
par la conversation (les clés privées vont directement dans Codemagic ou Vercel).

## Étapes de Guillaume, dans l'ordre

### 1. Firebase (console.firebase.google.com), ~10 min

1. **Ajouter un projet** « VeloPronos », Google Analytics désactivé.
2. Icône Android : nom du package `fr.velopronos.app`, surnom « VéloPronos Android ».
   Télécharger **google-services.json** 📩 (pas de SHA-1 pour l'instant). Ignorer les étapes
   « ajouter le SDK », déjà faites.
3. Icône iOS (Ajouter une application) : ID du bundle `com.base6a1f0e7a3cd8ee2103802f51.app`.
   Télécharger **GoogleService-Info.plist** 📩.
4. Roue dentée > Paramètres du projet > **Comptes de service** > Générer une nouvelle clé privée.
   Le fichier JSON se colle tel quel (tout son contenu) dans **Vercel** > projet VéloPronos >
   Settings > Environment Variables > `FIREBASE_SERVICE_ACCOUNT` (Production), puis Redeploy.
   Ne pas l'envoyer dans la conversation.

### 2. Apple Developer (developer.apple.com, compte qui détient l'appli VéloPronos), ~15 min

1. Certificates, Identifiers & Profiles > **Identifiers** > `com.base6a1f0e7a3cd8ee2103802f51.app` :
   cocher **Push Notifications** et **Sign In with Apple**, puis Save.
2. **Clé de notifications (APNs)**. Si VéloPronos est sur le même compte Apple que
   Biathlonpronos, la clé « Biathlonpronos Push Prod » (.p8) sert aussi : une clé APNs vaut pour
   toutes les applis du compte. Sinon : Keys > + > nom « VeloPronos Push », cocher Apple Push
   Notifications service, environnement **Sandbox & Production** (une clé Sandbox seule fait
   échouer les envois sur TestFlight et l'App Store). Télécharger le .p8 (une seule fois
   possible), noter le **Key ID** et le **Team ID** (en haut à droite).
3. **Firebase** > Paramètres du projet > Cloud Messaging > appli iOS > Clé d'authentification
   APNs > Importer : le .p8, Key ID, Team ID, pour développement **et** production.
4. **App Store Connect** > Utilisateurs et accès > Intégrations > App Store Connect API > + :
   nom « Codemagic VeloPronos », accès **App Manager**. Télécharger le .p8, noter l'**Issuer ID**
   et le **Key ID**. (Même compte que Biathlonpronos : la clé de Codemagic déjà créée peut servir.)
5. Services > **Sign in with Apple for Email Communication** : ajouter le domaine `velopronos.fr`
   et l'adresse d'envoi des e-mails VéloPronos, pour que les adresses relais Apple (98 joueurs de
   2026) reçoivent les e-mails. À faire quand le domaine d'envoi (Resend) est prêt.

### 3. Google Play Console (compte organisation), ~30 min

1. **Créer une application** : nom « VéloPronos », langue par défaut français, Jeu, Gratuit.
2. Remplir le tableau de bord « Configurer votre application » : règles de confidentialité
   (`https://www.velopronos.fr/fr/confidentialite`), accès à l'appli (fournir un compte de test
   au relecteur), annonces : non, classification du contenu, public cible (13 ans et plus, à
   confirmer), sécurité des données (e-mail, identifiant, notifications ; suppression du compte
   possible dans l'appli et par e-mail au support).
3. Un compte organisation n'a pas l'obligation des 12 testeurs pendant 14 jours : on pourra
   passer directement de « Tests internes » à « Production ».
4. Le premier fichier .aab s'envoie **à la main** (Tests > Tests internes > Créer une version),
   avec le fichier téléchargé depuis Codemagic. Accepter la **signature d'application par
   Google Play**. Ensuite : Paramètres > Intégrité de l'application > noter le **SHA-1 de la clé de
   signature** 📩 (sert à la connexion Google, étape 6).

### 4. Codemagic (codemagic.io), ~15 min

1. Créer le compte (par e-mail ou Google si la connexion GitHub est bloquée).
2. Team settings > Code signing identities > **Android keystores** : envoyer une clé nommée
   **VeloPronos** (nom de référence exact). Pour la créer sur le Mac (Terminal) :
   `keytool -genkey -v -keystore velopronos.keystore -alias velopronos -keyalg RSA -keysize 2048 -validity 10000`.
   Garder le fichier et ses mots de passe en lieu sûr (gestionnaire de mots de passe). Avec la
   signature par Google Play, une clé perdue se remplace, mais c'est une démarche.
   Noter son SHA-1 📩 : `keytool -list -v -keystore velopronos.keystore -alias velopronos`.
3. Team settings > Integrations > **Developer Portal** (App Store Connect) : ajouter la clé de
   l'étape 2.4 sous le nom **VeloPronos** (Issuer ID, Key ID, fichier .p8).
4. Code signing identities > **iOS certificates** > Generate certificate (Apple Distribution),
   puis **iOS provisioning profiles** > Fetch profiles > profil « App Store » pour
   `com.base6a1f0e7a3cd8ee2103802f51.app` (le créer chez Apple s'il n'existe pas : Profiles > +
   > App Store Connect).
5. **Quand GitHub revient** : Add application > dépôt `gpivot/velopronos` > fichier
   `codemagic.yaml` détecté. Lancer « Android (Google Play) » puis « iOS (App Store) ».

### 5. Tester les notifications

1. Sur un téléphone de test : installer la version TestFlight (iOS) ou Tests internes (Android),
   se connecter, accepter les notifications.
2. Site > `/admin/notifications` > envoi « moi seulement ». En cas d'échec, la page affiche la
   raison donnée par Firebase.

### 6. Connexion Google dans l'appli (facultatif au lancement)

Dans console.cloud.google.com, projet du Firebase VéloPronos :
1. Écran de consentement OAuth : externe, nom « VéloPronos », puis **Publier** (« En production »).
2. Identifiants > Créer > ID client OAuth :
   - **Application Web** « VéloPronos » : URI de redirection
     `https://<projet>.supabase.co/auth/v1/callback` ; ID client 📩.
   - **iOS** : ID du bundle `com.base6a1f0e7a3cd8ee2103802f51.app` ; ID client 📩.
   - **Android** ×2, package `fr.velopronos.app` : un avec le SHA-1 de la clé Codemagic (étape
     4.2), un avec le SHA-1 de la signature Google Play (étape 3.4).
3. **Supabase** > Authentication > Providers : Google (ID client Web + iOS séparés par une
   virgule, secret du client Web, « Skip nonce checks » activé) ; Apple (Client IDs :
   `com.base6a1f0e7a3cd8ee2103802f51.app`).
4. Claude renseigne les ID dans `socialLogin.ts` et l'URL scheme dans `Info.plist` (aujourd'hui
   encore celle de Biathlonpronos, sans effet tant que la connexion Google est masquée).

### 7. Avant la soumission aux stores

- **Domaine** : l'appli ouvre `www.velopronos.fr`, qui pointe encore vers base44. Basculer le
  domaine sur Vercel avant toute version publique. Pour un build de test avant la bascule,
  décommenter `VELOPRONOS_URL` dans `codemagic.yaml`.
- **Fiches** : textes courts et longs, captures d'écran (iPhone 6,9 pouces et téléphone Android),
  icône 512 × 512 et bannière 1024 × 500 pour Google Play, URL de support et de confidentialité.
- **Apple** : nouvelle version 2.0 de la fiche existante ; noter dans « Notes pour la relecture »
  un compte de test et le fait que c'est une refonte complète.

## À confirmer par Guillaume

- **Icône** : version provisoire faite à partir du logo du site (roue de vélo). Le logo de
  l'ancienne appli VéloPronos est-il à reprendre ? Si oui, fournir l'image en 1024 × 1024.
  Le logo du site (`LogoMark`, `src/components/icons.tsx`) est encore la cible du biathlon.
- **Compte Apple** : l'appli `com.base6a1f0e7a3cd8ee2103802f51.app` est-elle bien dans l'équipe
  Apple Developer de Guillaume (et pas dans celle de base44) ? Sinon, demander son transfert
  (App Store Connect > Applis > Transfert) ou créer un nouvel identifiant.
- **Même compte Apple que Biathlonpronos ?** Si oui, la clé APNs et la clé API Codemagic se
  réutilisent.
- **Public cible** sur Google Play (13 ans et plus proposé).
- **Connexion Google dans l'appli** au lancement, ou plus tard (code e-mail et Apple suffisent).
- `docs/notifications.md` cite encore les domaines Biathlonpronos (fichier commun aux deux apps,
  laissé tel quel) : pour VéloPronos, remplacer `biathlonpronos.fr` par `velopronos.fr` dans les
  réglages Resend, `EMAIL_FROM` et la tâche pg_cron.
