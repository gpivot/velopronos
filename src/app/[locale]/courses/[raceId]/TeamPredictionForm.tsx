"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { CheckIcon } from "@/components/icons";
import { GuestSignupDialog, GuestWelcome } from "@/components/GuestSignupDialog";
import { PredictionSummary } from "./PredictionSummary";
import { filterBySearch } from "@/lib/searchFilter";
import { SearchField } from "@/components/SearchField";

export type TeamWithOdds = {
  team_id: string;
  code: string;
  name: string;
  nation_code: string | null;
  value: number;
};

/** Nombre d'équipes pronostiquées sur un CLM par équipes. */
export const TEAM_PICKS = 3;

/** CLM par équipes (VéloPronos) : 3 équipes, enregistrées dans predictions.team_ids. */
export function TeamPredictionForm({
  raceId,
  teams,
  initialSelection,
  initialBonusX2,
  x2Eligible,
  x2UsesRemaining,
  lateJoker = false,
}: {
  raceId: string;
  teams: TeamWithOdds[];
  initialSelection: string[];
  initialBonusX2: boolean;
  x2Eligible: boolean;
  x2UsesRemaining: number;
  /** Pronostic posé avec le joker retardataire (étape partie, points ÷ 2). */
  lateJoker?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelection);
  const [bonusX2, setBonusX2] = useState(initialBonusX2);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestDialog, setGuestDialog] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [savedState, setSavedState] = useState({ teams: initialSelection.join(","), bonusX2: initialBonusX2 });
  const supabase = createClient();
  const router = useRouter();
  const t = useTranslations("PredictionForm");

  const canUseX2 = x2Eligible && (initialBonusX2 || x2UsesRemaining > 0);

  async function submit() {
    if (selected.length !== TEAM_PICKS) return;
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      setGuestDialog(true);
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("predictions").upsert(
      { user_id: user.id, race_id: raceId, team_ids: selected, athlete_ids: null, nation_code: null, bonus_x2_used: bonusX2, ...(lateJoker ? { late_joker: true } : {}) },
      { onConflict: "user_id,race_id" }
    );
    setSaving(false);
    if (error) {
      console.error(error);
      setError(t(error.code === "42501" ? "lockedError" : "saveError"));
    } else {
      setSavedState({ teams: selected.join(","), bonusX2 });
      if (lateJoker) router.refresh();
    }
  }

  function toggle(teamId: string) {
    setSelected((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : prev.length >= TEAM_PICKS ? prev : [...prev, teamId]
    );
  }

  const visibleTeams = filterBySearch(teams, search, (team) => [team.name, team.code], (team) => team.nation_code);
  const unsaved = savedState.teams !== "" && (savedState.teams !== selected.join(",") || savedState.bonusX2 !== bonusX2);
  const validated = savedState.teams !== "" && !unsaved;

  return (
    <div className="flex flex-col gap-4">
      <PredictionSummary
        picks={selected.map((id) => {
          const team = teams.find((x) => x.team_id === id);
          return { key: id, label: team?.name ?? id, nationCode: team?.nation_code ?? "" };
        })}
        requiredCount={TEAM_PICKS}
        onRemove={(id) => setSelected((prev) => prev.filter((x) => x !== id))}
        x2Available={canUseX2}
        bonusX2={bonusX2}
        x2Remaining={x2UsesRemaining + (initialBonusX2 ? 1 : 0) - (bonusX2 ? 1 : 0)}
        onToggleX2={() => setBonusX2((v) => !v)}
        canSubmit={selected.length === TEAM_PICKS}
        saving={saving}
        onSubmit={submit}
        unsaved={unsaved}
        success={validated ? t("saved") : null}
        error={error}
      />

      {welcome && validated && <GuestWelcome />}
      {guestDialog && (
        <GuestSignupDialog
          onClose={() => setGuestDialog(false)}
          onDone={async () => {
            setGuestDialog(false);
            setWelcome(true);
            await submit();
            router.refresh();
          }}
        />
      )}

      <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">{t("chooseTeams", { count: TEAM_PICKS })}</div>
      <SearchField value={search} onChange={setSearch} placeholder={t("searchTeam")} clearLabel={t("searchClear")} />

      <div className="flex flex-col gap-2">
        {visibleTeams.length === 0 && (
          <div className="rounded-2xl border border-border bg-card px-3.5 py-3 text-center text-[13px] text-text-dim">{t("searchNoResult")}</div>
        )}
        {visibleTeams.map((team) => {
          const isSelected = selected.includes(team.team_id);
          return (
            <button
              key={team.team_id}
              onClick={() => toggle(team.team_id)}
              className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                isSelected ? "border-ice bg-ice-soft" : "border-border bg-card"
              }`}
            >
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-semibold">{team.name}</span>
                <span className="text-[11px] text-text-dim">{team.code}</span>
              </div>
              <div className={`font-display text-sm font-bold ${isSelected ? "text-ice" : "text-text-dim"}`}>×{team.value}</div>
              <div className={`flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] ${isSelected ? "border-ice bg-ice" : "border-border"}`}>
                {isSelected && <CheckIcon className="h-3 w-3 text-on-ice" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
