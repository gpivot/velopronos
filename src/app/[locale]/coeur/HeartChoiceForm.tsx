"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Un choix de cœur de la saison (équipe de cœur ou nation favorite, table favorite_teams,
 * migration 0052) : définitif une fois confirmé.
 */
export function HeartChoiceForm({
  seasonId,
  field,
  title,
  hint,
  options,
  chosenLabel,
  rowExists,
}: {
  seasonId: string;
  field: "team_id" | "nation_code";
  title: string;
  hint: string;
  options: { value: string; label: string }[];
  /** Libellé du choix déjà fait, null sinon. */
  chosenLabel: string | null;
  /** Le joueur a déjà une ligne pour la saison (l'autre choix fait) : on la complète. */
  rowExists: boolean;
}) {
  const t = useTranslations("Heart");
  const router = useRouter();
  const [value, setValue] = useState(options[0]?.value ?? "");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const { error: saveError } = rowExists
      ? await supabase.from("favorite_teams").update({ [field]: value }).eq("user_id", user.id).eq("season_id", seasonId)
      : await supabase.from("favorite_teams").insert({ user_id: user.id, season_id: seasonId, sex: "H", [field]: value });
    setSaving(false);
    if (saveError) {
      console.error("favorite_teams:", saveError.message);
      setError(t("saveError"));
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  const label = options.find((o) => o.value === value)?.label ?? "";
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">{title}</div>
      {chosenLabel ? (
        <>
          <div className="text-sm font-semibold">{chosenLabel}</div>
          <p className="text-[12px] leading-relaxed text-text-dim">{t("chosen")}</p>
        </>
      ) : options.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-text-dim">{t("noOptions")}</p>
      ) : (
        <>
          <p className="text-[12px] leading-relaxed text-text-dim">{hint}</p>
          <select
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setConfirming(false);
            }}
            className="rounded-xl border border-border bg-bg px-3 py-2 text-sm"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {error && <div className="text-xs text-red">{error}</div>}
          {confirming ? (
            <div className="flex flex-col gap-2.5 rounded-xl border border-gold/50 bg-gold-soft p-3">
              <div className="text-[13px] font-semibold text-gold">⚠️ {t("warning", { choice: label })}</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirm}
                  disabled={saving}
                  className="rounded-xl bg-gold px-4 py-2 font-display text-sm font-bold text-on-gold disabled:opacity-60"
                >
                  {saving ? t("saving") : t("confirm")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-xl border border-border px-4 py-2 font-display text-sm font-bold text-text-dim"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="self-start rounded-xl bg-ice px-4 py-2 font-display text-sm font-bold text-on-ice"
            >
              {t("choose")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
