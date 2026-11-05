"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";

/**
 * Équipe de la carte Équipe sur ce Grand Tour (course_heart_teams, migration 0054) : l'équipe de
 * cœur par défaut, ou une autre pour ce Grand Tour seulement, jusqu'au départ de la 1re étape.
 */
export function GrandTourTeamForm({
  stageId,
  teams,
  heartTeamName,
  initialTeamId,
  locked,
}: {
  stageId: string;
  teams: { id: string; name: string }[];
  heartTeamName: string | null;
  initialTeamId: string | null;
  locked: boolean;
}) {
  const [teamId, setTeamId] = useState(initialTeamId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  const t = useTranslations("Jerseys");
  const current = teams.find((x) => x.id === (initialTeamId ?? ""));

  async function submit() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setError(t("loginRequired"));
      return;
    }
    const { error: saveError } = teamId
      ? await supabase
          .from("course_heart_teams")
          .upsert({ user_id: user.id, stage_id: stageId, team_id: teamId, updated_at: new Date().toISOString() }, { onConflict: "user_id,stage_id" })
      : await supabase.from("course_heart_teams").delete().eq("user_id", user.id).eq("stage_id", stageId);
    setSaving(false);
    if (saveError) {
      console.error("course_heart_teams:", saveError.message);
      setError(t("saveError"));
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const heartLabel = heartTeamName ? t("gtTeamKeepHeart", { team: heartTeamName }) : t("gtTeamNoHeart");

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden>❤️</span>
        {t("gtTeamTitle")}
      </div>
      <p className="text-[13px] leading-snug text-text-dim">{t("gtTeamHint")}</p>
      {locked ? (
        <div className="text-[13px] font-semibold">{current?.name ?? heartLabel}</div>
      ) : (
        <>
          <select
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              setSaved(false);
            }}
            className="rounded-xl border border-border bg-bg px-3 py-2 text-sm"
          >
            <option value="">{heartLabel}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          {error && <div className="text-xs text-red-500">{error}</div>}
          <button
            type="button"
            onClick={submit}
            disabled={saving || teamId === (initialTeamId ?? "")}
            className="rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-on-gold disabled:opacity-50"
          >
            {saving ? t("saving") : saved ? t("saved") : t("submit")}
          </button>
        </>
      )}
    </div>
  );
}
