"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { SearchField } from "@/components/SearchField";
import { filterBySearch } from "@/lib/searchFilter";
import type { JerseyOption } from "./JerseysForm";

/**
 * Porteur d'eau d'un Grand Tour (table pepites, migration 0049) : un outsider caché, toutes ses
 * cotes de la course >= 30, modifiable jusqu'au départ de la 1re étape.
 */
export function WaterCarrierForm({
  stageId,
  seasonId,
  options,
  initialPick,
  locked,
  revealed,
  points,
}: {
  stageId: string;
  seasonId: string;
  options: JerseyOption[];
  initialPick: string | null;
  locked: boolean;
  revealed: boolean;
  /** Points apportés à sa révélation, null avant. */
  points: number | null;
}) {
  const [pick, setPick] = useState(initialPick ?? "");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  const t = useTranslations("Jerseys");
  const tForm = useTranslations("PredictionForm");
  const current = options.find((o) => o.id === pick);

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
    // season_id, sexe et cote retenue sont fixés par la base (trigger pepites_check).
    const { error: saveError } = pick
      ? await supabase
          .from("pepites")
          .upsert(
            { user_id: user.id, stage_id: stageId, season_id: seasonId, sex: "H", athlete_id: pick, odds_at_pick: 0 },
            { onConflict: "user_id,stage_id" }
          )
      : await supabase.from("pepites").delete().eq("user_id", user.id).eq("stage_id", stageId);
    setSaving(false);
    if (saveError) {
      setError(saveError.message.includes("not_eligible") ? t("waterCarrierNotEligible") : t("saveError"));
      console.error("pepites:", saveError.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const matches = new Set(filterBySearch(options, search, (o) => [o.label, o.search], () => null));
  const shown = options.filter((o) => o.id === pick || matches.has(o));

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-ice-soft text-lg">💧</div>
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="text-sm font-semibold">{t("waterCarrierTitle")}</div>
          <div className="text-xs leading-snug text-text-dim">{t("waterCarrierHint")}</div>
        </div>
      </div>
      {locked ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm">
          <span className="flex-1">{current ? current.label : t("notChosen")}</span>
          <span className="whitespace-nowrap font-display text-xs font-bold text-ice">
            {revealed ? (points != null ? t("waterCarrierRevealedPoints", { points }) : t("waterCarrierRevealed")) : t("waterCarrierHidden")}
          </span>
        </div>
      ) : options.length === 0 ? (
        <div className="text-[13px] text-text-dim">{t("waterCarrierNoOptions")}</div>
      ) : (
        <>
          <SearchField value={search} onChange={setSearch} placeholder={t("searchRider")} clearLabel={tForm("searchClear")} />
          <select
            value={pick}
            onChange={(e) => {
              setSaved(false);
              setPick(e.target.value);
            }}
            className="rounded-xl border border-border bg-bg px-3 py-2.5 text-sm"
          >
            <option value="">{t("noPick")}</option>
            {shown.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.odds != null ? ` · ${t("odds", { value: o.odds })}` : ""}
              </option>
            ))}
          </select>
          {error && <div className="text-xs text-red">{error}</div>}
          {saved && !error && <div className="text-xs text-ice">{t("waterCarrierSaved")}</div>}
          <button
            onClick={submit}
            disabled={saving || pick === (initialPick ?? "")}
            className="rounded-2xl bg-ice py-3 text-center font-display text-[14px] font-bold text-on-ice disabled:opacity-40"
          >
            {saving ? t("saving") : t("waterCarrierSubmit")}
          </button>
        </>
      )}
    </div>
  );
}
