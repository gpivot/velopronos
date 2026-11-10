# Notifications des joueurs

Décidé avec Guillaume le 02/11/2026. Les joueurs règlent tout dans **Profil > Notifications** :
pour chaque type de message, un interrupteur 📱 Appli (téléphone, si l'appli est installée) et un
interrupteur ✉️ E-mail.

| Message | Appli | E-mail | Quand |
| --- | --- | --- | --- |
| Rappel de pronostic | oui par défaut | oui par défaut | 2 h avant une course, seulement si le joueur ne l'a pas pronostiquée |
| Résultats et points | oui par défaut | non par défaut | Appli : à la saisie des résultats. E-mail : récap de la semaine le lundi entre 8 h et midi |
| Questions bonus en direct | oui par défaut | — | Au lancement d'une question live |
| Nouvelles du jeu | oui par défaut | non par défaut (RGPD : accord explicite) | Envoi manuel depuis `/admin/notifications` |

Chaque e-mail a un lien « Ne plus recevoir ces e-mails » (page `/desabonnement`, sans connexion)
et l'en-tête de désabonnement en un clic exigé par Gmail et Yahoo
(`/api/notifications/unsubscribe`).

## Adresses e-mail

- Code e-mail et Google : vraie adresse.
- Apple avec « Masquer mon e-mail » : adresse `@privaterelay.appleid.com`. Apple ne fait suivre
  que les e-mails d'un domaine déclaré : Apple Developer > Certificates, Identifiers & Profiles >
  Services > **Sign in with Apple for Email Communication** > ajouter `biathlonpronos.fr` et
  l'adresse d'envoi (`notifications@biathlonpronos.fr`). Le domaine doit avoir SPF/DKIM, déjà
  en place pour Resend.
- Invités anonymes : pas d'adresse, pas d'e-mail (et pas d'accès au profil).
- Invités « e-mail seulement » (migration 0045, inscription pas terminée) : un seul e-mail par
  course, « Ton score est prêt », envoyé à la saisie des résultats (`notifyGuestResults`), avec
  lien de connexion et code privé. Ni rappels, ni récap, ni nouvelles avant l'inscription.
  Réglage Supabase : Authentication > Providers > Email > « Email OTP Expiration » à 86400
  (24 h, le maximum), pour que le lien et le code restent valables une journée.
- La langue des e-mails est celle choisie à l'inscription (métadonnée `locale` de Supabase Auth),
  mise à jour quand le joueur change un réglage de notification.

## Mise en route (à faire une fois)

1. **Supabase > SQL Editor** : coller `supabase/migrations/0034_notification_preferences.sql`.
2. **Resend > API Keys** : créer une clé « Sending access » sur le domaine `biathlonpronos.fr`.
3. **Vercel > Settings > Environment Variables** (Production), puis redéployer :
   - `RESEND_API_KEY` : la clé Resend.
   - `CRON_SECRET` : un mot de passe long (lettres et chiffres), le même qu'à l'étape 4.
   - `EMAIL_FROM` (facultatif) : par défaut `Biathlonpronos <notifications@biathlonpronos.fr>`.
4. **Supabase > Database > Extensions** : activer `pg_cron` et `pg_net`, puis dans le SQL Editor
   (remplacer `CRON_SECRET_ICI` par la valeur de l'étape 3) :

   ```sql
   select cron.schedule(
     'notifications-joueurs',
     '*/15 * * * *',
     $$select net.http_get(
       url := 'https://www.biathlonpronos.fr/api/notifications/cron',
       headers := jsonb_build_object('Authorization', 'Bearer CRON_SECRET_ICI'),
       timeout_milliseconds := 55000
     )$$
   );
   ```

   Pour vérifier : `select * from cron.job_run_details order by start_time desc limit 5;`.
   Pour arrêter : `select cron.unschedule('notifications-joueurs');`.

Vercel Hobby ne permet qu'une tâche planifiée par jour : c'est pour ça que l'horloge est confiée à
Supabase (pg_cron), qui appelle le site tous les quarts d'heure.

## Coût

Offre gratuite de Resend : 100 e-mails par jour et 3 000 par mois, codes de connexion compris.
Avec quelques centaines de joueurs, un week-end de courses dépasse vite : passer à l'offre Pro
(environ 20 $/mois, 50 000 e-mails). Les envois refusés par Resend sont retentés au passage
suivant (la trace `notification_sends` ne garde que les e-mails acceptés).

## Code

- `supabase/migrations/0034_notification_preferences.sql` : réglages, trace des envois, adresses.
- `src/lib/notifications/` : réglages (`preferences.ts`), règles d'envoi (`plan.ts`, testées),
  e-mails Resend et gabarit (`email.ts`), textes en 5 langues (`texts.ts`, namespace
  `Notifications`), envois (`jobs.ts`), désabonnement (`unsubscribe.ts`).
- `src/lib/push/send.ts` : `sendPush` accepte un message par joueur et respecte un réglage.
- `src/app/api/notifications/cron` : appelé par pg_cron (rappels + récap du lundi).
- Résultats : `notifyRaceResults` après `submitResults` (back-office), une fois par course, et
  jamais pour une course de plus de 3 jours (saisies de test ou corrections tardives).
- Profil : `src/app/[locale]/compte/NotificationsCard.tsx`.
