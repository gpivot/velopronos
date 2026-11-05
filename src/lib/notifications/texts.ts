import { createTranslator } from "next-intl";
import { locales, type Locale } from "../../i18n/routing";
import { raceTitle } from "../raceLabel";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import fr from "../../../messages/fr.json";
import it from "../../../messages/it.json";

/**
 * Textes des notifications et e-mails, dans la langue de chaque joueur. Hors d'une page : la
 * langue n'est pas celle de la requête, d'où un traducteur construit à la demande.
 */
const MESSAGES = { fr, en, de, it, es } as const;

export function normalizeLocale(value: string | null | undefined): Locale {
  return (locales as readonly string[]).includes(value ?? "") ? (value as Locale) : "fr";
}

export function notificationTexts(locale: string) {
  const loc = normalizeLocale(locale);
  const messages = MESSAGES[loc] as typeof fr;
  return {
    locale: loc,
    t: createTranslator({ locale: loc, messages, namespace: "Notifications" }),
    format: createTranslator({ locale: loc, messages, namespace: "RaceFormat" }),
    sex: createTranslator({ locale: loc, messages, namespace: "Sex" }),
    race: createTranslator({ locale: loc, messages, namespace: "Race" }),
  };
}

export type NotificationTexts = ReturnType<typeof notificationTexts>;

/** « Étape 3 · Sprint », « Baroudeurs » (classique)… dans la langue du joueur. */
export function raceName(texts: NotificationTexts, race: { format: string; sex?: string | null; stage_number?: number | null }): string {
  return raceTitle(race, (k, v) => texts.format(k as "sprint", v as never), (k, v) => texts.race(k as "prologue", v as never));
}

/** Heure de Paris « 14:30 ». */
export function parisTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso)
  );
}
