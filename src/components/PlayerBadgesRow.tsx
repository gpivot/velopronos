import { useTranslations } from "next-intl";
import { NO_BADGES, X2_PER_SEASON, type PlayerBadges } from "@/lib/playerBadges";

/** Dossard jaune du leader du général (comme en Coupe du monde de biathlon). */
export function LeaderBib({ className = "h-5 w-5" }: { className?: string }) {
  const t = useTranslations("Badges");
  return <Bib className={className} label={t("leader")} fill="#FFD43B" stroke="#B88A00" />;
}

/** Dossard rouge : leader d'une étape (dans le classement « Par étapes ») ou étapes gagnées. */
export function StageLeaderBib({ className = "h-5 w-5", label, number = 1 }: { className?: string; label?: string; number?: number }) {
  const t = useTranslations("Badges");
  return <Bib className={className} label={label ?? t("stageLeader")} fill="#E8414B" stroke="#9C1C24" number={number} />;
}

/** Dossard bleu du meilleur jeune (pronostic de saison « Meilleur jeune »), comme en Coupe du monde. */
export function YoungBib({ className = "h-4 w-4" }: { className?: string }) {
  const t = useTranslations("Badges");
  return <Bib className={className} label={t("young")} fill="#2F80ED" stroke="#1B4F96" />;
}

function Bib({ className, label, fill, stroke, number = 1 }: { className: string; label: string; fill: string; stroke: string; number?: number }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={label} className={`flex-shrink-0 ${className}`}>
      <title>{label}</title>
      <path
        d="M7.5 2.5h2.2c.6 1.6 1.3 2.4 2.3 2.4s1.7-.8 2.3-2.4h2.2v4.2c1.6.7 2.5 2 2.5 3.8v11H5v-11c0-1.8.9-3.1 2.5-3.8z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <rect x="8.2" y="11" width="7.6" height="6.2" rx="1" fill="#fff" />
      <text x="12" y="16" textAnchor="middle" fontSize="5.6" fontWeight="800" fill="#1a1a1a" fontFamily="sans-serif">
        {number}
      </text>
    </svg>
  );
}

/**
 * Pictos d'un joueur à côté de son pseudo : dossard jaune s'il mène le classement général (ou de
 * ligue) sur la saison, dossard rouge s'il mène une étape ou en a gagné (le nombre d'étapes gagnées
 * est écrit sur le dossard), 🔥 série en cours (classement Saison), ⚡ bonus ×2 utilisés (« 1/3 »),
 * 🍾 courses gagnées, ⭐ pronos parfaits, 💧 porteur d'eau.
 */
export function PlayerBadgesRow({
  badges,
  leader = false,
  stageLeader = false,
  streak = null,
}: {
  badges: PlayerBadges | undefined;
  /** En tête du classement de la saison : dossard jaune. */
  leader?: boolean;
  /** En tête de l'étape affichée (classement « Par étapes ») : dossard rouge. */
  stageLeader?: boolean;
  /** Série en cours (10/10) : 🔥 et le nombre, sur le classement de la saison ; à 0 (série
   * retombée), le picto passe en noir et blanc. null : rien. */
  streak?: number | null;
}) {
  const t = useTranslations("Badges");
  const b = { ...NO_BADGES, ...badges };
  if (!leader && !stageLeader && streak == null && !b.x2Used && !b.raceWins && !b.stageWins && !b.perfectPicks && !b.pepites) return null;
  return (
    <span className="flex flex-shrink-0 items-center gap-1.5 font-display text-[12px] font-bold">
      {leader && <LeaderBib />}
      {(stageLeader || b.stageWins > 0) && (
        <StageLeaderBib
          label={b.stageWins > 0 ? t("stageWins", { count: b.stageWins }) : t("stageLeader")}
          number={Math.max(1, b.stageWins)}
        />
      )}
      {streak != null && (
        <span title={t("streak", { count: streak })} className={`whitespace-nowrap ${streak > 0 ? "text-frost" : "text-text-dim"}`}>
          <span className={`text-[14px] ${streak > 0 ? "" : "grayscale"}`}>🔥</span>{streak}
        </span>
      )}
      {b.x2Used > 0 && (
        <span title={t("x2Used", { used: b.x2Used, max: X2_PER_SEASON })} className="whitespace-nowrap text-gold">
          <span className="text-[14px]">⚡</span>{b.x2Used}/{X2_PER_SEASON}
        </span>
      )}
      {b.raceWins > 0 && (
        <span title={t("raceWins", { count: b.raceWins })} className="whitespace-nowrap text-frost">
          <span className="text-[14px]">🍾</span>{b.raceWins}
        </span>
      )}
      {b.perfectPicks > 0 && (
        <span title={t("perfectPicks", { count: b.perfectPicks })} className="whitespace-nowrap text-gold">
          <span className="text-[14px]">⭐</span>{b.perfectPicks}
        </span>
      )}
      {b.pepites > 0 && (
        <span title={t("pepite", { count: b.pepites })} className="inline-flex items-center whitespace-nowrap text-ice">
          <span className="text-[14px]">💧</span>
          {b.pepiteSexes?.length ? (
            // Mini ♀ / ♂ à droite du cristal : quelle(s) Pépite(s) ont été révélées (les deux empilées).
            <span className="ml-0.5 flex flex-col justify-center gap-px">
              {b.pepiteSexes.includes("F") && <SexIcon sex="F" label={t("pepiteF")} />}
              {b.pepiteSexes.includes("H") && <SexIcon sex="H" label={t("pepiteH")} />}
            </span>
          ) : (
            b.pepites > 1 && b.pepites
          )}
        </span>
      )}
    </span>
  );
}

/**
 * Mini ♀ / ♂ dessinés en SVG (et non en caractères : selon la police du système, les glyphes
 * débordaient et se chevauchaient une fois empilés).
 */
function SexIcon({ sex, label }: { sex: "F" | "H"; label: string }) {
  return (
    <svg viewBox="0 0 10 10" role="img" aria-label={label} className="h-[8px] w-[8px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <title>{label}</title>
      {sex === "F" ? (
        <>
          <circle cx="5" cy="3.6" r="2.6" />
          <path d="M5 6.2v3.3M3.3 8h3.4" />
        </>
      ) : (
        <>
          <circle cx="4" cy="6" r="2.6" />
          <path d="M5.9 4.1 9.2 0.8M6.4 0.8h2.8v2.8" />
        </>
      )}
    </svg>
  );
}
