import { getTranslations } from "next-intl/server";
import { LeaderBib, StageLeaderBib } from "@/components/PlayerBadgesRow";

// Mini-écrans de l'app, commentés façon tutoriel (pastilles numérotées + légende), pour la page
// d'accueil visiteur. Dessinés en JSX plutôt qu'en captures d'écran : ils restent nets, suivent le
// thème clair/sombre et se traduisent dans les 5 langues. Données fictives mais réalistes (cotes
// choisies par Guillaume), calculées avec le vrai barème : 8×25 = 200, 12×18 = 216, 22×5 = 110, +20 Top 10 = 546.

/** Pastille numérotée posée sur un élément du mini-écran, reprise dans la légende. */
export function Pin({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`absolute z-10 flex h-6 w-6 items-center justify-center rounded-full bg-gold font-display text-[11px] font-extrabold text-on-gold shadow-[0_0_0_3px_rgb(var(--c-bg))] ${className}`}
    >
      {n}
    </span>
  );
}

/** Cadre de téléphone autour d'un mini-écran. */
function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[300px] rounded-[2rem] border-[5px] border-card2 bg-bg p-3 shadow-[0_20px_60px_-25px_oklch(0.62_0.19_255/0.6)]">
      <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-card2" />
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function ScreenTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="px-1">
      <div className="font-display text-[10px] font-bold uppercase tracking-wider text-text-dim">{eyebrow}</div>
      <div className="font-display text-[15px] font-extrabold leading-tight">{title}</div>
    </div>
  );
}

/** 1 — Le pronostic : 3 coureurs, leurs cotes, le compte à rebours. */
export async function PickMockup() {
  const t = await getTranslations("Landing");
  const picks = [
    { flag: "🇸🇮", name: "T. Pogačar", odds: 8 },
    { flag: "🇩🇰", name: "J. Vingegaard", odds: 12 },
    { flag: "🇫🇷", name: "L. Martinez", odds: 22 },
  ];
  return (
    <Phone>
      <ScreenTitle eyebrow="Tour de France 🇫🇷" title={t("mockRace")} />
      <div className="relative self-start rounded-full bg-ice-soft px-3 py-1 font-display text-[11px] font-bold text-ice">
        ⏱ {t("mockCountdown")} 02:14:30
        <Pin n={3} className="-right-3 -top-2" />
      </div>
      <div className="relative flex flex-col gap-1.5">
        <Pin n={2} className="-left-2 top-1/2 -translate-y-1/2" />
        {picks.map((p, i) => (
          <div key={p.name} className="flex items-center gap-2 rounded-xl border border-ice/40 bg-card px-3 py-2">
            <span className="font-display text-[11px] font-bold text-text-dim">{i + 1}</span>
            <span className="text-sm">{p.flag}</span>
            <span className="flex-1 truncate text-[12px] font-semibold">{p.name}</span>
            <span className="relative rounded-full bg-gold-soft px-2 py-0.5 font-display text-[11px] font-bold text-gold">
              {t("mockOdds")} {p.odds}
              {i === 2 && <Pin n={1} className="-right-3 -top-4" />}
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-full bg-ice py-2 text-center font-display text-[12px] font-bold text-on-ice">
        {t("mockValidate")}
      </div>
    </Phone>
  );
}

/** 2 — Le résultat : barème cote × place, bonus Top 10, total. */
export async function ScoreMockup() {
  const t = await getTranslations("Landing");
  const rows = [
    { rank: 1, flag: "🇸🇮", name: "T. Pogačar", odds: 8, mult: 25, mine: true },
    { rank: 2, flag: "🇩🇰", name: "J. Vingegaard", odds: 12, mult: 18, mine: true },
    { rank: 3, flag: "🇧🇪", name: "R. Evenepoel", odds: 6, mult: 13, mine: false },
    { rank: 4, flag: "🇸🇮", name: "P. Roglič", odds: 5, mult: 10, mine: false },
    { rank: 5, flag: "🇪🇸", name: "J. Ayuso", odds: 4, mult: 7, mine: false },
    { rank: 6, flag: "🇫🇷", name: "L. Martinez", odds: 22, mult: 5, mine: true },
  ];
  return (
    <Phone>
      <ScreenTitle eyebrow={t("mockResultEyebrow")} title={t("mockRace")} />
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div
            key={r.rank}
            className={`relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${
              r.mine ? "border border-ice/40 bg-card" : "opacity-45"
            }`}
          >
            <span className={`w-4 font-display text-[11px] font-bold ${r.rank === 1 ? "text-gold" : "text-text-dim"}`}>{r.rank}</span>
            <span className="text-[12px]">{r.flag}</span>
            <span className="flex-1 truncate text-[11.5px] font-semibold">{r.name}</span>
            {r.mine && (
              <span className="font-display text-[11px] font-bold text-ice">
                {r.odds} × {r.mult} = {r.odds * r.mult}
              </span>
            )}
            {r.rank === 1 && <Pin n={1} className="-left-2.5 -top-2.5" />}
            {r.rank === 2 && <Pin n={2} className="-left-2.5 -top-2.5" />}
          </div>
        ))}
      </div>
      <div className="relative flex items-center justify-between rounded-lg border border-green/40 bg-green/10 px-2.5 py-1.5 text-[11px] font-bold text-green">
        <span>{t("mockBonusTop10")}</span>
        <span>+20</span>
        <Pin n={3} className="-left-2.5 -top-2.5" />
      </div>
      <div className="flex items-baseline justify-between px-1 pt-0.5">
        <span className="text-[12px] text-text-dim">{t("mockTotal")}</span>
        <span className="font-display text-xl font-extrabold text-ice">546 pts</span>
      </div>
    </Phone>
  );
}

/** 3 — Une ligue privée : code d'invitation, dossards jaune et rouge. */
export async function LeagueMockup() {
  const t = await getTranslations("Landing");
  const rows = [
    { name: "Marie_Velo", pts: 2840, yellow: true, red: false },
    { name: "PapyDanseuse", pts: 2715, yellow: false, red: true },
    { name: t("mockYou"), pts: 2690, yellow: false, red: false, me: true },
    { name: "Léa.velo", pts: 2410, yellow: false, red: false },
    { name: "Toto74", pts: 1985, yellow: false, red: false },
  ];
  return (
    <Phone>
      <ScreenTitle eyebrow={t("mockLeagueEyebrow")} title="🏔️ Les Grimpeurs du dimanche" />
      <div className="relative flex items-center justify-between rounded-xl border border-dashed border-ice/60 bg-ice-soft px-3 py-2">
        <span className="text-[11px] text-text-dim">{t("mockLeagueCode")}</span>
        <span className="font-display text-[13px] font-extrabold tracking-widest text-ice">GRIMPE7</span>
        <span className="rounded-full bg-ice px-2.5 py-0.5 font-display text-[10px] font-bold text-on-ice">{t("mockShare")}</span>
        <Pin n={1} className="-right-2 -top-2.5" />
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <div
            key={r.name}
            className={`relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${
              r.me ? "border border-ice bg-ice-soft" : "border border-border bg-card"
            }`}
          >
            <span className={`w-4 font-display text-[11px] font-bold ${i === 0 ? "text-gold" : "text-text-dim"}`}>{i + 1}</span>
            <span className="flex-1 truncate text-[12px] font-semibold">{r.name}</span>
            {r.yellow && <LeaderBib className="h-4 w-4" />}
            {r.red && <StageLeaderBib className="h-4 w-4" />}
            <span className="font-display text-[11px] font-bold text-ice">{r.pts.toLocaleString("fr-FR")} pts</span>
            {i === 1 && <Pin n={2} className="-left-2.5 -top-2.5" />}
            {r.me && <Pin n={3} className="-left-2.5 -top-2.5" />}
          </div>
        ))}
      </div>
    </Phone>
  );
}

/** 4 — La stratégie : course spéciale (malus), cartes bonus, Mondiaux ×2. */
export async function StrategyMockup() {
  const t = await getTranslations("Landing");
  const cards = [t("mockCardFarte"), t("mockCardAspiration"), t("mockCard4th")];
  return (
    <Phone>
      <ScreenTitle eyebrow={t("mockStrategyEyebrow")} title={t("mockStrategyTitle")} />
      <div className="relative rounded-xl border border-red/50 bg-red/10 px-3 py-2">
        <div className="font-display text-[11px] font-extrabold uppercase tracking-wide text-red">⚠️ {t("mockSpecialName")}</div>
        <div className="text-[11px] leading-snug text-text-dim">{t("mockSpecialRule")}</div>
        <Pin n={1} className="-right-2 -top-2.5" />
      </div>
      <div className="relative flex justify-center gap-1.5 py-2">
        {cards.map((c, i) => (
          <div
            key={c}
            className={`flex h-24 w-[30%] flex-col items-center justify-center gap-1 rounded-xl bg-gold px-1 text-center text-on-gold shadow-md ${
              i === 0 ? "-rotate-6" : i === 2 ? "rotate-6" : "-translate-y-1"
            }`}
          >
            <span className="text-xl">🃏</span>
            <span className="font-display text-[11px] font-extrabold leading-tight">{c}</span>
          </div>
        ))}
        <Pin n={2} className="-top-1 right-0" />
      </div>
      <div className="relative flex gap-1.5">
        <span className="flex-1 rounded-full bg-gold-soft py-1.5 text-center font-display text-[11px] font-bold text-gold">
          🌍 {t("mockWorlds")}
        </span>
        <span className="flex-1 rounded-full bg-ice-soft py-1.5 text-center font-display text-[11px] font-bold text-ice">
          ⚡ {t("mockX2")}
        </span>
        <Pin n={3} className="-right-2 -top-2.5" />
      </div>
    </Phone>
  );
}
