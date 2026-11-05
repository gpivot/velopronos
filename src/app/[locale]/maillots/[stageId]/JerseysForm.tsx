"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { SearchField } from "@/components/SearchField";
import { filterBySearch } from "@/lib/searchFilter";

export interface JerseyOption {
  id: string;
  label: string;
  /** Code pays, équipe… pour la recherche. */
  search: string;
  odds: number | null;
}

export interface JerseyConfig {
  jersey: string;
  isTeam: boolean;
  options: JerseyOption[];
  initialPick: string | null;
  /** Points marqués une fois le podium final saisi, null avant. */
  points?: number | null;
}

/** Pastille du maillot : couleur du leader de la course pour le général, couleurs classiques ailleurs. */
const JERSEY_COLORS: Record<string, string> = {
  points: "#2E9E44",
  montagne: "repeating-radial-gradient(circle at 30% 30%, #D62828 0 3px, #FFFFFF 3px 7px)",
  jeune: "#FFFFFF",
  combatif: "#C8102E",
  equipe: "#FFD200",
};

export function JerseysForm({
  stageId,
  configs,
  locked,
  leaderColor,
}: {
  stageId: string;
  configs: JerseyConfig[];
  locked: boolean;
  leaderColor: string | null;
}) {
  const [picks, setPicks] = useState<Record<string, string>>(() => Object.fromEntries(configs.map((c) => [c.jersey, c.initialPick ?? ""])));
  const [searches, setSearches] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  const t = useTranslations("Jerseys");
  const tForm = useTranslations("PredictionForm");

  async function submit() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError(t("loginRequired"));
      setSaving(false);
      return;
    }

    const chosen = configs.filter((c) => picks[c.jersey]);
    const cleared = configs.filter((c) => !picks[c.jersey] && c.initialPick).map((c) => c.jersey);
    const rows = chosen.map((c) => ({
      user_id: user.id,
      stage_id: stageId,
      jersey: c.jersey,
      athlete_id: c.isTeam ? null : picks[c.jersey],
      team_id: c.isTeam ? picks[c.jersey] : null,
      submitted_at: new Date().toISOString(),
    }));
    const { error: upsertError } = rows.length
      ? await supabase.from("course_predictions").upsert(rows, { onConflict: "user_id,stage_id,jersey" })
      : { error: null };
    const { error: deleteError } =
      !upsertError && cleared.length
        ? await supabase.from("course_predictions").delete().eq("user_id", user.id).eq("stage_id", stageId).in("jersey", cleared)
        : { error: null };

    setSaving(false);
    const failure = upsertError ?? deleteError;
    if (failure) {
      setError(t("saveError"));
      console.error("course_predictions:", failure.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {configs.map((c) => {
        const current = c.options.find((o) => o.id === picks[c.jersey]);
        const swatch = c.jersey === "general" ? leaderColor ?? "#FFD200" : JERSEY_COLORS[c.jersey];
        return (
          <div key={c.jersey} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="h-5 w-5 flex-shrink-0 rounded-full border border-border" style={{ background: swatch }} />
              <span className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">{t(`jersey_${c.jersey}`)}</span>
            </div>
            {locked ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
                <span className="flex-1">
                  {current ? `${current.label}${current.odds != null ? ` · ${t("odds", { value: current.odds })}` : ""}` : t("notChosen")}
                </span>
                {c.points != null && <span className="font-display font-bold text-ice">{t("points", { points: c.points })}</span>}
              </div>
            ) : (
              <>
                <SearchField
                  value={searches[c.jersey] ?? ""}
                  onChange={(v) => setSearches((prev) => ({ ...prev, [c.jersey]: v }))}
                  placeholder={t(c.isTeam ? "searchTeam" : "searchRider")}
                  clearLabel={tForm("searchClear")}
                />
                <select
                  value={picks[c.jersey]}
                  onChange={(e) => {
                    setSaved(false);
                    setPicks((prev) => ({ ...prev, [c.jersey]: e.target.value }));
                  }}
                  className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
                >
                  <option value="">{t("noPick")}</option>
                  {visible(c.options, searches[c.jersey] ?? "", picks[c.jersey]).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                      {o.odds != null ? ` · ${t("odds", { value: o.odds })}` : ""}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        );
      })}

      {!locked && (
        <>
          {error && <div className="text-xs text-red">{error}</div>}
          {saved && !error && <div className="text-xs text-ice">{t("saved")}</div>}
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-2xl bg-ice py-3.5 text-center font-display text-[15px] font-bold text-on-ice disabled:opacity-40"
          >
            {saving ? t("saving") : t("submit")}
          </button>
        </>
      )}
    </div>
  );
}

function visible(options: JerseyOption[], search: string, currentPick: string): JerseyOption[] {
  const matches = new Set(filterBySearch(options, search, (o) => [o.label, o.search], () => null));
  return options.filter((o) => o.id === currentPick || matches.has(o));
}
