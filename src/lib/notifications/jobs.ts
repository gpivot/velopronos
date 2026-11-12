import type { SupabaseClient } from "@supabase/supabase-js";
import { isPredictionOpen } from "@/lib/predictionWindow";
import { sendPush } from "@/lib/push/send";
import { readServiceAccount } from "@/lib/push/fcm";
import { escapeHtml, isEmailConfigured, renderEmail, sendEmails, siteUrl, SITE_URL, unsubscribeUrl, type OutgoingEmail } from "./email";
import {
  DEFAULT_PREFERENCES,
  ensureUnsubscribeTokens,
  loadPlayerEmails,
  loadPlayerSettings,
  type PlayerEmail,
  type PlayerSettings,
} from "./preferences";
import { areResultsFresh, isReminderWindow, planReminders, REMINDER_LEAD_MS, sumPoints, weeklyRecapRef, type ReminderRace } from "./plan";
import { notificationTexts, parisTime, raceName, type NotificationTexts } from "./texts";

/**
 * Envois automatiques : rappels 2 h avant les courses, résultats après chaque course, récap du
 * lundi par e-mail, et nouvelles du jeu depuis /admin/notifications. Chaque envoi respecte les
 * réglages du profil (notification_preferences) et laisse une trace (notification_sends) pour
 * ne jamais partir deux fois. Serveur uniquement (clé service).
 */

interface RaceInfo extends ReminderRace {
  format: string;
  stage_number?: number | null;
  sex: string | null;
  location: string;
}

type Channel = "push" | "email";

async function alreadySent(admin: SupabaseClient, kind: string, refs: string[], channel: Channel): Promise<Set<string>> {
  if (refs.length === 0) return new Set();
  const { data, error } = await admin
    .from("notification_sends")
    .select("ref, user_id")
    .eq("kind", kind)
    .eq("channel", channel)
    .in("ref", refs);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => `${row.ref}:${row.user_id}`));
}

async function recordSends(admin: SupabaseClient, rows: { kind: string; ref: string; user_id: string; channel: Channel }[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("notification_sends")
      .upsert(rows.slice(i, i + 500), { onConflict: "kind,ref,user_id,channel", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
}

async function pushUserIds(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.from("push_tokens").select("user_id");
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((row) => row.user_id as string))];
}

function emailFrame(texts: NotificationTexts, settings: PlayerSettings, kind: "reminder" | "results" | "news") {
  return {
    footer: texts.t("footer"),
    unsubscribeLabel: texts.t("unsubscribe"),
    unsubscribeUrl: unsubscribeUrl(settings.unsubscribeToken ?? "", kind, texts.locale),
    manageLabel: texts.t("manage"),
    manageUrl: siteUrl("/compte", texts.locale),
  };
}

// ---------------------------------------------------------------------------------------------
// Rappel de pronostic
// ---------------------------------------------------------------------------------------------

export async function runReminders(admin: SupabaseClient, now: Date): Promise<string> {
  const { data: rows, error } = await admin
    .from("races")
    .select("id, locks_at, format, stage_number, sex, status, stages(location, starts_on)")
    .eq("status", "upcoming")
    .gt("locks_at", now.toISOString())
    .lte("locks_at", new Date(now.getTime() + REMINDER_LEAD_MS).toISOString());
  if (error) throw new Error(error.message);

  const races: RaceInfo[] = (rows ?? [])
    .filter((race) => {
      const stage = race.stages as unknown as { location: string; starts_on: string } | null;
      return stage && isReminderWindow(race.locks_at, now) && isPredictionOpen(stage.starts_on, now);
    })
    .map((race) => ({
      id: race.id,
      locks_at: race.locks_at,
      format: race.format,
      stage_number: race.stage_number,
      sex: race.sex,
      location: (race.stages as unknown as { location: string }).location,
    }));
  if (races.length === 0) return "Rappels : aucune course dans les 2 h.";
  const raceIds = races.map((race) => race.id);

  const { data: predictions, error: predError } = await admin.from("predictions").select("race_id, user_id").in("race_id", raceIds);
  if (predError) throw new Error(predError.message);
  const predicted = new Set((predictions ?? []).map((p) => `${p.race_id}:${p.user_id}`));

  const emails = await loadPlayerEmails(admin);
  const phoneUsers = await pushUserIds(admin);
  const allUsers = [...new Set([...emails.keys(), ...phoneUsers])];
  const settings = await loadPlayerSettings(admin, allUsers);
  const notes: string[] = [];

  // Téléphones
  if (readServiceAccount()) {
    const pushUsers = phoneUsers.filter((id) => settings.get(id)?.prefs.reminder_push);
    const plan = planReminders(races, pushUsers, predicted, await alreadySent(admin, "reminder", raceIds, "push"));
    if (plan.size > 0) {
      const report = await sendPush(
        ({ userId, locale }) => {
          const due = plan.get(userId) as RaceInfo[] | undefined;
          if (!due) return null;
          const texts = notificationTexts(locale);
          return {
            title: texts.t("reminderPushTitle"),
            body:
              due.length === 1
                ? texts.t("reminderPushBody", { race: raceName(texts, due[0]), location: due[0].location })
                : texts.t("reminderPushBodyMany", { count: due.length }),
            url: due.length === 1 ? `/courses/${due[0].id}` : "/courses",
          };
        },
        { userIds: [...plan.keys()] }
      );
      await recordSends(
        admin,
        report.userIds.flatMap((userId) => (plan.get(userId) ?? []).map((race) => ({ kind: "reminder", ref: race.id, user_id: userId, channel: "push" as const })))
      );
      notes.push(`${report.sent} notification(s)`);
    }
  }

  // E-mails
  if (isEmailConfigured()) {
    const emailUsers = [...emails.keys()].filter((id) => settings.get(id)?.prefs.reminder_email);
    const plan = planReminders(races, emailUsers, predicted, await alreadySent(admin, "reminder", raceIds, "email"));
    if (plan.size > 0) {
      await ensureUnsubscribeTokens(admin, settings, [...plan.keys()]);
      const outgoing = [...plan.entries()].map(([userId, due]) =>
        reminderEmail(userId, due as RaceInfo[], emails.get(userId)!, settings.get(userId)!)
      );
      const report = await sendEmails(outgoing.map((o) => o.email));
      await recordSends(
        admin,
        outgoing
          .filter((o) => report.delivered.has(o.email.to))
          .flatMap((o) => o.races.map((race) => ({ kind: "reminder", ref: race.id, user_id: o.userId, channel: "email" as const })))
      );
      notes.push(`${report.sent} e-mail(s)`);
    }
  }

  return `Rappels (${races.length} course(s)) : ${notes.join(", ") || "rien à envoyer"}.`;
}

function reminderEmail(userId: string, due: RaceInfo[], player: PlayerEmail, settings: PlayerSettings) {
  const texts = notificationTexts(player.locale);
  const lines = due.map((race) => ({
    name: `${raceName(texts, race)} · ${race.location}`,
    start: texts.t("reminderEmailStart", { time: parisTime(race.locks_at, texts.locale) }),
  }));
  const subject =
    due.length === 1
      ? texts.t("reminderEmailSubject", { race: raceName(texts, due[0]) })
      : texts.t("reminderEmailSubjectMany", { count: due.length });
  const { html, text } = renderEmail({
    title: texts.t("reminderEmailTitle"),
    bodyHtml:
      `<p style="margin:0 0 8px">${escapeHtml(texts.t("reminderEmailIntro"))}</p>` +
      lines
        .map((l) => `<p style="margin:0 0 6px"><b style="color:#ffffff">${escapeHtml(l.name)}</b><br>${escapeHtml(l.start)}</p>`)
        .join(""),
    bodyText: `${texts.t("reminderEmailIntro")}\n${lines.map((l) => `- ${l.name}, ${l.start}`).join("\n")}`,
    button: { label: texts.t("reminderEmailButton"), url: siteUrl(due.length === 1 ? `/courses/${due[0].id}` : "/courses", texts.locale) },
    ...emailFrame(texts, settings, "reminder"),
  });
  const email: OutgoingEmail = {
    to: player.email,
    subject,
    html,
    text,
    unsubscribeUrl: unsubscribeUrl(settings.unsubscribeToken ?? "", "reminder", texts.locale),
  };
  return { userId, races: due, email };
}

// ---------------------------------------------------------------------------------------------
// Résultats d'une course (notification sur le téléphone)
// ---------------------------------------------------------------------------------------------

/**
 * Après la saisie des résultats : chaque joueur qui a pronostiqué la course reçoit ses points.
 * Une seule fois par course (une correction des résultats ne renvoie rien).
 */
export async function notifyRaceResults(admin: SupabaseClient, raceId: string, now = new Date()): Promise<string> {
  if (!readServiceAccount()) return "";
  const { data: race, error } = await admin
    .from("races")
    .select("id, locks_at, format, stage_number, sex, stages(location)")
    .eq("id", raceId)
    .single();
  if (error || !race) return "";
  if (!areResultsFresh(race.locks_at, now)) return " Pas de notification : course de plus de 3 jours.";
  const location = (race.stages as unknown as { location: string }).location;

  const { data: ledger, error: ledgerError } = await admin.from("score_ledger").select("user_id, points").eq("race_id", raceId);
  if (ledgerError) throw new Error(ledgerError.message);
  const rowsByUser = new Map<string, { points: number }[]>();
  for (const row of ledger ?? []) rowsByUser.set(row.user_id, [...(rowsByUser.get(row.user_id) ?? []), row]);

  const sent = await alreadySent(admin, "results", [raceId], "push");
  const userIds = [...rowsByUser.keys()].filter((id) => !sent.has(`${raceId}:${id}`));
  if (userIds.length === 0) return "";

  const report = await sendPush(
    ({ userId, locale }) => {
      const texts = notificationTexts(locale);
      const raceLabel = raceName(texts, race);
      return {
        title: texts.t("resultsPushTitle", { race: raceLabel }),
        body: texts.t("resultsPushBody", { location, points: sumPoints(rowsByUser.get(userId) ?? []) }),
        url: `/courses/${raceId}`,
      };
    },
    { userIds, preference: "results_push" }
  );
  await recordSends(admin, report.userIds.map((userId) => ({ kind: "results", ref: raceId, user_id: userId, channel: "push" as const })));
  return report.sent > 0 ? ` Résultats notifiés sur ${report.sent} téléphone(s).` : "";
}

// ---------------------------------------------------------------------------------------------
// Score d'un invité « e-mail seulement » (migration 0060)
// ---------------------------------------------------------------------------------------------

/**
 * Après la saisie des résultats : chaque invité qui a validé son pronostic avec son seul e-mail
 * (inscription pas terminée) reçoit « Ton score est prêt », avec un lien qui le connecte et
 * l'amène sur la course, et le même code privé à saisir dans l'appli. Le score n'est pas dans
 * l'e-mail : il le découvre sur la page de la course, avec l'invitation à créer son compte.
 * Une seule fois par course et par joueur.
 */
export async function notifyGuestResults(admin: SupabaseClient, raceId: string, now = new Date()): Promise<string> {
  if (!isEmailConfigured()) return "";
  const { data: race, error } = await admin
    .from("races")
    .select("id, locks_at, format, stage_number, sex, stages(location)")
    .eq("id", raceId)
    .single();
  if (error || !race) return "";
  if (!areResultsFresh(race.locks_at, now)) return "";
  const location = (race.stages as unknown as { location: string }).location;

  const { data: rows, error: predError } = await admin
    .from("predictions")
    .select("user_id, profiles!inner(signup_pending)")
    .eq("race_id", raceId)
    .eq("profiles.signup_pending", true);
  if (predError) throw new Error(predError.message);
  const sent = await alreadySent(admin, "guest_results", [raceId], "email");
  const userIds = [...new Set((rows ?? []).map((row) => row.user_id as string))].filter((id) => !sent.has(`${raceId}:${id}`));
  if (userIds.length === 0) return "";

  const settings = await loadPlayerSettings(admin, userIds);
  await ensureUnsubscribeTokens(admin, settings, userIds);

  const outgoing: { userId: string; email: OutgoingEmail }[] = [];
  for (const userId of userIds) {
    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const user = userData?.user;
    if (!user?.email) continue;
    const texts = notificationTexts(String(user.user_metadata?.locale ?? "fr"));
    const coursePath = `/${texts.locale}/courses/${raceId}`;
    // Lien de connexion et code privé (le même jeton) : pas d'e-mail envoyé par Supabase ici.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
    if (linkError || !link?.properties) {
      console.error("notifyGuestResults (lien):", linkError?.message);
      continue;
    }
    const buttonUrl = `${SITE_URL}/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent(coursePath)}`;
    const code = link.properties.email_otp;
    const raceLabel = raceName(texts, race);
    const { html, text } = renderEmail({
      title: texts.t("guestResultsTitle"),
      bodyHtml:
        `<p style="margin:0 0 12px">${escapeHtml(texts.t("guestResultsBody", { race: raceLabel, location }))}</p>` +
        `<p style="margin:0 0 6px">${escapeHtml(texts.t("guestResultsCodeLabel"))}</p>` +
        `<div style="text-align:center;margin:0 0 8px"><span style="display:inline-block;background:#0A0F1C;border-radius:12px;padding:10px 18px;font-size:26px;font-weight:bold;letter-spacing:6px;color:#F2C94C">${escapeHtml(code)}</span></div>` +
        `<p style="margin:0;font-size:13px;color:#90A3C4">${escapeHtml(texts.t("guestResultsCodeHint"))}</p>`,
      bodyText: `${texts.t("guestResultsBody", { race: raceLabel, location })}\n\n${texts.t("guestResultsCodeLabel")} ${code}\n${texts.t("guestResultsCodeHint")}`,
      button: { label: texts.t("guestResultsButton"), url: buttonUrl },
      ...emailFrame(texts, settings.get(userId) ?? { prefs: DEFAULT_PREFERENCES, unsubscribeToken: null }, "results"),
    });
    outgoing.push({
      userId,
      email: {
        to: user.email,
        subject: texts.t("guestResultsSubject", { race: raceLabel, location }),
        html,
        text,
        unsubscribeUrl: unsubscribeUrl(settings.get(userId)?.unsubscribeToken ?? "", "results", texts.locale),
      },
    });
  }
  if (outgoing.length === 0) return "";

  const report = await sendEmails(outgoing.map((o) => o.email));
  await recordSends(
    admin,
    outgoing
      .filter((o) => report.delivered.has(o.email.to))
      .map((o) => ({ kind: "guest_results", ref: raceId, user_id: o.userId, channel: "email" as const }))
  );
  return report.sent > 0 ? ` Score envoyé par e-mail à ${report.sent} invité(s).` : "";
}

// ---------------------------------------------------------------------------------------------
// Récap de la semaine par e-mail (lundi)
// ---------------------------------------------------------------------------------------------

export async function runWeeklyRecap(admin: SupabaseClient, now: Date): Promise<string> {
  const ref = weeklyRecapRef(now);
  if (!ref || !isEmailConfigured()) return "Récap : pas aujourd'hui.";

  const { data: rows, error } = await admin
    .from("races")
    .select("id, locks_at, format, stage_number, sex, stages(location)")
    .eq("status", "finished")
    .gte("locks_at", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .lte("locks_at", now.toISOString())
    .order("locks_at", { ascending: true });
  if (error) throw new Error(error.message);
  const races: RaceInfo[] = (rows ?? []).map((race) => ({
    id: race.id,
    locks_at: race.locks_at,
    format: race.format,
    stage_number: race.stage_number,
    sex: race.sex,
    location: (race.stages as unknown as { location: string }).location,
  }));
  if (races.length === 0) return "Récap : aucune course cette semaine.";

  // Récap réservé à ceux qui l'ont demandé (désactivé par défaut) et qui ont joué la semaine.
  const { data: optedIn, error: prefError } = await admin.from("notification_preferences").select("user_id").eq("results_email", true);
  if (prefError) throw new Error(prefError.message);
  const candidates = (optedIn ?? []).map((row) => row.user_id as string);
  if (candidates.length === 0) return "Récap : personne d'inscrit.";

  const { data: ledger, error: ledgerError } = await admin
    .from("score_ledger")
    .select("user_id, race_id, points")
    .in("race_id", races.map((race) => race.id))
    .in("user_id", candidates);
  if (ledgerError) throw new Error(ledgerError.message);
  const byUser = new Map<string, Map<string, { points: number }[]>>();
  for (const row of ledger ?? []) {
    const perRace = byUser.get(row.user_id) ?? new Map();
    perRace.set(row.race_id, [...(perRace.get(row.race_id) ?? []), row]);
    byUser.set(row.user_id, perRace);
  }

  const sent = await alreadySent(admin, "weekly", [ref], "email");
  const userIds = [...byUser.keys()].filter((id) => !sent.has(`${ref}:${id}`));
  if (userIds.length === 0) return "Récap : déjà envoyé.";

  const [emails, settings] = await Promise.all([loadPlayerEmails(admin, userIds), loadPlayerSettings(admin, userIds)]);
  const outgoing: { userId: string; email: OutgoingEmail }[] = [];
  for (const userId of userIds) {
    const player = emails.get(userId);
    const playerSettings = settings.get(userId);
    if (!player || !playerSettings?.prefs.results_email) continue;
    const texts = notificationTexts(player.locale);
    const perRace = byUser.get(userId)!;
    const lines = races.map((race) => {
      const scored = perRace.get(race.id);
      return {
        name: `${raceName(texts, race)} · ${race.location}`,
        value: scored ? texts.t("weeklyPoints", { points: sumPoints(scored) }) : texts.t("weeklyNotPlayed"),
      };
    });
    const total = sumPoints([...perRace.values()].flat());
    const { html, text } = renderEmail({
      title: texts.t("weeklyTitle"),
      bodyHtml:
        `<p style="margin:0 0 10px">${escapeHtml(texts.t("weeklyIntro"))}</p><table style="width:100%;border-collapse:collapse;font-size:14px">` +
        lines
          .map(
            (l) =>
              `<tr><td style="padding:6px 0;border-bottom:1px solid #223252;color:#C9D6EC">${escapeHtml(l.name)}</td><td style="padding:6px 0;border-bottom:1px solid #223252;text-align:right;color:#ffffff;white-space:nowrap">${escapeHtml(l.value)}</td></tr>`
          )
          .join("") +
        `<tr><td style="padding:10px 0 0;color:#ffffff;font-weight:bold">${escapeHtml(texts.t("weeklyTotal"))}</td><td style="padding:10px 0 0;text-align:right;color:#F2C94C;font-weight:bold;white-space:nowrap">${escapeHtml(
          texts.t("weeklyPoints", { points: total })
        )}</td></tr></table>`,
      bodyText: `${texts.t("weeklyIntro")}\n${lines.map((l) => `- ${l.name} : ${l.value}`).join("\n")}\n${texts.t("weeklyTotal")} : ${texts.t("weeklyPoints", { points: total })}`,
      button: { label: texts.t("weeklyButton"), url: siteUrl("/classement", texts.locale) },
      ...emailFrame(texts, playerSettings, "results"),
    });
    outgoing.push({
      userId,
      email: {
        to: player.email,
        subject: texts.t("weeklySubject", { points: total }),
        html,
        text,
        unsubscribeUrl: unsubscribeUrl(playerSettings.unsubscribeToken ?? "", "results", texts.locale),
      },
    });
  }
  if (outgoing.length === 0) return "Récap : rien à envoyer.";

  const report = await sendEmails(outgoing.map((o) => o.email));
  await recordSends(
    admin,
    outgoing.filter((o) => report.delivered.has(o.email.to)).map((o) => ({ kind: "weekly", ref, user_id: o.userId, channel: "email" as const }))
  );
  return `Récap : ${report.sent} e-mail(s).`;
}

// ---------------------------------------------------------------------------------------------
// Nouvelles du jeu par e-mail (depuis /admin/notifications)
// ---------------------------------------------------------------------------------------------

/**
 * E-mail aux joueurs qui ont accepté les nouvelles du jeu (désactivé par défaut, RGPD), ou à
 * l'admin seul pour un test. Le texte est celui saisi par l'admin, envoyé tel quel à tous.
 */
export async function sendNewsEmail(
  admin: SupabaseClient,
  input: { title: string; body: string; url: string },
  onlyUserIds?: string[]
): Promise<{ recipients: number; sent: number }> {
  let userIds = onlyUserIds;
  if (!userIds) {
    const { data, error } = await admin.from("notification_preferences").select("user_id").eq("news_email", true);
    if (error) throw new Error(error.message);
    userIds = (data ?? []).map((row) => row.user_id as string);
  }
  if (userIds.length === 0) return { recipients: 0, sent: 0 };

  const [emails, settings] = await Promise.all([loadPlayerEmails(admin, userIds), loadPlayerSettings(admin, userIds)]);
  const recipients = userIds.filter((id) => emails.has(id));
  await ensureUnsubscribeTokens(admin, settings, recipients);

  const outgoing = recipients.map((userId) => {
    const player = emails.get(userId)!;
    const playerSettings = settings.get(userId)!;
    const texts = notificationTexts(player.locale);
    const paragraphs = input.body.split(/\n+/).filter(Boolean);
    const { html, text } = renderEmail({
      title: input.title,
      bodyHtml: paragraphs.map((p) => `<p style="margin:0 0 10px">${escapeHtml(p)}</p>`).join(""),
      bodyText: input.body,
      button: { label: texts.t("newsButton"), url: siteUrl(input.url || "/", texts.locale) },
      ...emailFrame(texts, playerSettings, "news"),
    });
    return {
      to: player.email,
      subject: input.title,
      html,
      text,
      unsubscribeUrl: unsubscribeUrl(playerSettings.unsubscribeToken ?? "", "news", texts.locale),
    };
  });
  const report = await sendEmails(outgoing);
  return { recipients: recipients.length, sent: report.sent };
}
