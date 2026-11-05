import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { nationFlagEmoji } from "@/lib/nationFlags";
import type { HiddenPepite } from "@/lib/seasonView";

/**
 * Encadré « Porteur d'eau » de Ma saison (repris de la Pépite cachée de Biathlonpronos) : un
 * porteur par Grand Tour, révélé ou pas encore. Invisible des autres joueurs tant qu'il n'est pas
 * révélé (migration 0018). Le choix se fait sur la page des maillots de la course.
 */
export function HiddenPepiteCard({ pepites }: { pepites: HiddenPepite[] }) {
  const t = useTranslations("Courses");
  if (pepites.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-center gap-3.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-ice-soft text-lg">💧</div>
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="text-sm font-semibold">{t("pepiteCardTitle")}</div>
          <div className="text-xs leading-snug text-text-dim">{t("pepiteCardHint")}</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {pepites.map((p) => (
          <div key={p.stageId} className="flex items-center gap-3 rounded-xl border border-border bg-bg px-3.5 py-2.5">
            <div className="w-24 flex-shrink-0 truncate text-[13px] text-text-dim">{p.courseName}</div>
            {p.name ? (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold">
                  {p.nationCode && <span>{nationFlagEmoji(p.nationCode)}</span>}
                  <span className="truncate">{p.name}</span>
                </div>
                {p.revealed && p.revealedRaceId ? (
                  // Révélée : renvoie au résultat de la course où elle a été révélée.
                  <Link
                    href={`/courses/${p.revealedRaceId}`}
                    title={t("pepiteSeeRace")}
                    aria-label={`${t("pepiteRevealed")} : ${t("pepiteSeeRace")}`}
                    className="whitespace-nowrap rounded-full bg-ice px-2.5 py-1 font-display text-[11px] font-bold text-on-ice"
                  >
                    {t("pepiteRevealed")} ›
                  </Link>
                ) : (
                  <div
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 font-display text-[11px] font-bold ${
                      p.revealed ? "bg-ice text-on-ice" : "border border-border text-text-dim"
                    }`}
                  >
                    {p.revealed ? t("pepiteRevealed") : t("pepiteNotRevealed")}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex-1 text-[12px] text-text-dim">{t("pepiteNone")}</div>
                {!p.locked && (
                  <Link
                    href={`/maillots/${p.stageId}`}
                    className="whitespace-nowrap rounded-full bg-ice px-3 py-1 font-display text-[12px] font-bold text-on-ice"
                  >
                    {t("pepiteChoose")}
                  </Link>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
