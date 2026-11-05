import { describe, expect, it } from "vitest";
import { areResultsFresh, isReminderWindow, planReminders, sumPoints, weeklyRecapRef } from "../notifications/plan";
import { withDefaults, DEFAULT_PREFERENCES } from "../notifications/preferences";
import { escapeHtml, oneClickUrl, renderEmail, unsubscribeUrl } from "../notifications/email";
import { notificationTexts, raceName } from "../notifications/texts";

describe("planReminders", () => {
  const races = [
    { id: "r2", locks_at: "2026-12-05T13:30:00Z" },
    { id: "r1", locks_at: "2026-12-05T11:00:00Z" },
  ];

  it("rappelle les courses non pronostiquées, dans l'ordre de départ", () => {
    const plan = planReminders(races, ["a", "b"], new Set(["r1:b"]), new Set());
    expect(plan.get("a")?.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(plan.get("b")?.map((r) => r.id)).toEqual(["r2"]);
  });

  it("n'envoie jamais deux fois le même rappel", () => {
    const plan = planReminders(races, ["a"], new Set(["r2:a"]), new Set(["r1:a"]));
    expect(plan.has("a")).toBe(false);
  });
});

describe("fenêtres d'envoi", () => {
  const now = new Date("2026-12-05T10:00:00Z");
  it("rappel : départ dans 2 h ou moins, pas déjà parti", () => {
    expect(isReminderWindow("2026-12-05T12:00:00Z", now)).toBe(true);
    expect(isReminderWindow("2026-12-05T12:01:00Z", now)).toBe(false);
    expect(isReminderWindow("2026-12-05T09:59:00Z", now)).toBe(false);
  });

  it("résultats : pas de notification pour une course de plus de 3 jours", () => {
    expect(areResultsFresh("2026-12-04T10:00:00Z", now)).toBe(true);
    expect(areResultsFresh("2025-12-02T10:00:00Z", now)).toBe(false);
  });

  it("récap : le lundi entre 8 h et midi, heure de Paris", () => {
    expect(weeklyRecapRef(new Date("2026-12-07T07:15:00Z"))).toBe("2026-12-07"); // 8 h 15 à Paris
    expect(weeklyRecapRef(new Date("2026-12-07T06:45:00Z"))).toBeNull(); // 7 h 45
    expect(weeklyRecapRef(new Date("2026-12-07T11:00:00Z"))).toBeNull(); // midi
    expect(weeklyRecapRef(new Date("2026-12-08T08:00:00Z"))).toBeNull(); // mardi
  });

  it("additionne les points", () => {
    expect(sumPoints([{ points: "12.5" }, { points: -3 }])).toBe(10);
  });
});

describe("réglages", () => {
  it("complète une ligne absente ou partielle avec les valeurs par défaut", () => {
    expect(withDefaults(null)).toEqual(DEFAULT_PREFERENCES);
    expect(withDefaults({ results_email: true, reminder_push: false, other: 1 })).toMatchObject({
      results_email: true,
      reminder_push: false,
      reminder_email: true,
      news_email: false,
    });
  });
});

describe("e-mails", () => {
  it("échappe le texte et prépare le désabonnement en un clic", () => {
    const page = unsubscribeUrl("11111111-2222-3333-4444-555555555555", "reminder", "de");
    expect(page).toBe("https://www.velopronos.fr/de/desabonnement?t=11111111-2222-3333-4444-555555555555&k=reminder");
    expect(oneClickUrl(page)).toBe(
      "https://www.velopronos.fr/api/notifications/unsubscribe?t=11111111-2222-3333-4444-555555555555&k=reminder"
    );
    const { html, text } = renderEmail({
      title: "<Test>",
      bodyHtml: "<p>ok</p>",
      bodyText: "ok",
      button: { label: "Go", url: "https://x.fr/?a=1&b=2" },
      footer: "f",
      unsubscribeLabel: "u",
      unsubscribeUrl: page,
      manageLabel: "m",
      manageUrl: "https://x.fr/compte",
    });
    expect(html).toContain("&lt;Test&gt;");
    expect(html).toContain("a=1&amp;b=2");
    expect(text).toContain("u : " + page);
    expect(escapeHtml('"&')).toBe("&quot;&amp;");
  });

  it("nomme la course dans la langue du joueur", () => {
    expect(raceName(notificationTexts("fr"), { format: "sprint", sex: "H", stage_number: 3 })).toBe("Étape 3 · Sprint");
    expect(raceName(notificationTexts("en"), { format: "clm", sex: "H", stage_number: 0 })).toBe("Prologue · Time trial");
    expect(raceName(notificationTexts("xx"), { format: "baroudeurs", sex: "H", stage_number: null })).toBe("Baroudeurs");
    expect(notificationTexts("de").t("resultsPushBody", { location: "Oslo", points: 1 })).toContain("1");
  });
});
