# Parcours invité « Je joue » (VéloPronos)

Repris de Biathlonpronos le 12/11/2026, à partir du document « Parcours invité « Je joue » : à
reproduire sur VéloPronos » (validé par Guillaume les 10 et 11/11/2026).

## Écart avec le document d'origine

Le document dit que VéloPronos tourne sur base44 et demande d'adapter le code aux outils de base44.
Ce n'est plus le cas : le nouveau VéloPronos est une copie de Biathlonpronos (Next.js + Supabase +
Capacitor). Le parcours a donc été **repris tel quel** par `git cherry-pick` des 6 commits de
Biathlonpronos, puis adapté au vélo :

| Biathlonpronos | Sujet |
|---|---|
| `bea927a` | Navigation grisée et pop-up « Inscris-toi pour aller plus loin », jeton périmé (« pronostics fermés ») |
| `1408470` | Validation par e-mail seulement, e-mail « Ton score est prêt », encadré « Et ton classement ? », page `/inscription` |
| `242e701` | Doc : choix validés par Guillaume |
| `ee9c2dd` | Les 3 pop-ups du premier pronostic |
| `a9dfbe6` | Mot de passe sur `/inscription`, aussi depuis la pop-up de navigation |
| `920d5fb` | Page d'attente `/courses/[raceId]/attente` |

Le détail technique (fichiers, garde-fous) est dans `docs/architecture-technique.md` (section
invités) et `docs/notifications.md`, hérités de Biathlonpronos.

## Adaptations au vélo

- **Migration** : `0045_guest_email_only.sql` de Biathlonpronos devient
  **`0060_guest_email_only.sql`** (le 0045 de VéloPronos est le schéma vélo). Elle ajoute en plus
  les règles « pas d'écriture pour un invité anonyme » sur les tables propres au vélo
  (`course_predictions` : maillots et porteur d'eau, `course_heart_teams` : équipe par Grand Tour,
  `champion_predictions` : WE des Champions).
- **Textes** (5 langues) : « course » devient « étape », « biathlète » devient « coureur »,
  Biathlonpronos devient VéloPronos.
- **Pop-ups 2 et 3** : barème de VéloPronos (`trajectoire-et-regles.md` §3) : cote × 25, 18, 13,
  10, 7, 5, 4, 3, 2, 1 du 1er au 10e, rien au-delà ; bonus si les 3 choix finissent dans le Top 10
  (+20), le Top 5 (+50) ou sur le podium (+100), et +200 pour le prono parfait, à la place du podium. Le tableau des
  multiplicateurs est lu dans `RANK_MULTIPLIERS` (moteur de points) : il suivra le barème s'il change.
- **Classements** : en plus des filtres de Biathlonpronos, les points de maillots et du WE des
  Champions d'un joueur en attente d'inscription sont exclus du classement de la course
  (`lib/standings.ts`).
- **CLM par équipes** : le formulaire « 3 équipes » valide aussi avec l'e-mail seulement et mène à
  la page d'attente.
- **E-mail « Ton score est prêt »** : le nom de l'étape suit le format des rappels (« Étape 3 ·
  Montagne à Paris-Nice »).

## Validé par Guillaume (12/11/2026)

- **Périmètre** : seul le parcours invité change ; rien d'autre dans le fonctionnement de l'app.
  Les seules retouches hors des pages invité sont des filtres qui excluent les joueurs en attente
  d'inscription (classements, e-mails automatiques) et le lien « J'ai déjà un code » de l'écran de
  connexion, tous deux demandés par le document.
- **Prono parfait** : il vaut +200, **à la place** du bonus podium (+100). La pop-up 3 le dit
  ainsi. Le moteur de points n'a pas été touché.
- **CLM par équipes** : pas de pop-ups sur ces étapes.
- **Objet de l'e-mail** : « 🏁 Étape 3 · Montagne à Paris-Nice : ton score est prêt », sur le
  modèle des rappels.

## Réglages à faire dans le projet Supabase de VéloPronos

1. Coller la migration **0060** dans l'éditeur SQL (après 0059).
2. Authentication > Sign In / Providers : « Allow anonymous sign-ins » activé (déjà demandé par
   0031).
3. Authentication > Providers > Email > « Email OTP Expiration » : **86400** (24 h).
4. Envoi d'e-mails par Resend configuré (`RESEND_API_KEY` et adresse d'expédition VéloPronos) :
   sans lui, l'e-mail « Ton score est prêt » ne part pas (l'admin n'a pas d'erreur, l'envoi est
   simplement ignoré).
