import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { nationFlagEmoji } from "@/lib/nationFlags";
import type { RetainedCourseLine } from "@/lib/leaderboard";
import { RETAINED_ONE_DAY, RETAINED_STAGE_RACES } from "@/lib/velo/retainedResults";

/**
 * Classement, encadré « Mon classement » : les « jokers de fin de saison » du vélo, c'est-à-dire
 * les courses retenues (tous les Grands Tours et événements bonus, les 2 meilleures courses par
 * étapes, les 8 meilleures classiques) et celles écartées du total.
 */
export function RetainedCoursesCard({ courses, droppedPoints }: { courses: RetainedCourseLine[]; droppedPoints: number }) {
  const t = useTranslations("Classement");
  const groups = [
    { key: "all", title: t("retainedGroupAll"), lines: courses.filter((c) => c.kind !== "stage_race" && c.kind !== "one_day") },
    { key: "stage", title: t("retainedGroupStage", { count: RETAINED_STAGE_RACES }), lines: courses.filter((c) => c.kind === "stage_race") },
    { key: "oneDay", title: t("retainedGroupOneDay", { count: RETAINED_ONE_DAY }), lines: courses.filter((c) => c.kind === "one_day") },
  ].filter((g) => g.lines.length > 0);

  return (
    <details className="group rounded-2xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
        <span className="text-lg">🃏</span>
        <span className="flex flex-1 flex-col">
          <span className="font-display text-[13px] font-bold">{t("retainedTitle")}</span>
          <span className="text-[11px] text-text-dim">{t("retainedDiscover")}</span>
        </span>
        {droppedPoints > 0 && (
          <span className="whitespace-nowrap font-display text-sm font-bold text-red">{t("retainedDelta", { points: droppedPoints })}</span>
        )}
      </summary>
      <div className="flex flex-col gap-3 border-t border-border px-4 pb-4 pt-3">
        <p className="text-[12px] leading-relaxed text-text-dim">{t("retainedHelp", { stage: RETAINED_STAGE_RACES, oneDay: RETAINED_ONE_DAY })}</p>
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-1.5">
            <div className="font-display text-[11px] font-bold uppercase tracking-wider text-text-dim">{group.title}</div>
            {group.lines.map((line) => (
              <Link
                key={line.courseId}
                href={`/courses?etape=${line.courseId}`}
                className={`flex items-center gap-2.5 rounded-xl bg-card2 px-3 py-2 text-[13px] ${line.retained ? "" : "opacity-60"}`}
              >
                <span>{nationFlagEmoji(line.countryCode)}</span>
                <span className={`min-w-0 flex-1 truncate font-semibold ${line.retained ? "" : "line-through"}`}>{line.name}</span>
                <span className="whitespace-nowrap text-[12px] font-bold">{line.points} pts</span>
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    line.retained ? "bg-ice-soft text-ice" : "bg-red/10 text-red"
                  }`}
                >
                  {line.retained ? t("retainedKept") : t("retainedDropped")}
                </span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}
