"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";

/** Choix du champion d'un pays (champion_predictions, migration 0056), enregistré dès le choix. */
export function ChampionPicker({
  championshipId,
  options,
  initialPick,
}: {
  championshipId: string;
  options: { id: string; name: string }[];
  initialPick: string | null;
}) {
  const [pick, setPick] = useState(initialPick ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(initialPick ? "saved" : "idle");
  const supabase = createClient();
  const router = useRouter();
  const t = useTranslations("Champions");

  async function save(value: string) {
    setPick(value);
    setStatus("saving");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus("error");
      return;
    }
    const { error } = value
      ? await supabase
          .from("champion_predictions")
          .upsert(
            { user_id: user.id, championship_id: championshipId, athlete_id: value, updated_at: new Date().toISOString() },
            { onConflict: "user_id,championship_id" }
          )
      : await supabase.from("champion_predictions").delete().eq("user_id", user.id).eq("championship_id", championshipId);
    if (error) {
      setStatus("error");
      return;
    }
    setStatus(value ? "saved" : "idle");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={pick}
        onChange={(e) => save(e.target.value)}
        disabled={status === "saving"}
        className="rounded-xl border border-border bg-bg px-3 py-2 text-sm"
      >
        <option value="">{t("choose")}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {status === "saving" && <div className="text-xs text-text-dim">{t("saving")}</div>}
      {status === "saved" && <div className="text-xs font-semibold text-green">✅ {t("saved")}</div>}
      {status === "error" && <div className="text-xs text-red">{t("error")}</div>}
    </div>
  );
}
