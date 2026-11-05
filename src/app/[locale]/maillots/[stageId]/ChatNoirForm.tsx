"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import type { JerseyOption } from "./JerseysForm";

export interface ChatNoirTarget {
  /** Maillot de course_predictions (hors « equipe ») ou "porteur". */
  target: string;
  oldLabel: string;
  options: JerseyOption[];
}

/**
 * Carte Chat noir (migration 0052) : remplace une fois un coureur abandonné, sur un pronostic
 * maillot ou le porteur d'eau. La base vérifie tout (rpc play_chat_noir).
 */
export function ChatNoirForm({ cardId, targets }: { cardId: string; targets: ChatNoirTarget[] }) {
  const [target, setTarget] = useState(targets[0]?.target ?? "");
  const [pick, setPick] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();
  const t = useTranslations("Jerseys");
  const current = targets.find((x) => x.target === target);

  const targetLabel = (x: ChatNoirTarget) => (x.target === "porteur" ? t("waterCarrierTitle") : t(`jersey_${x.target}` as any));

  async function submit() {
    if (!pick || !target) return;
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("play_chat_noir", { p_card_id: cardId, p_target: target, p_athlete_id: pick });
    setSaving(false);
    if (rpcError) {
      setError(t("chatNoirError"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gold bg-card px-4 py-3.5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden>🐈‍⬛</span>
        {t("chatNoirTitle")}
      </div>
      <p className="text-[13px] leading-snug text-text-dim">{t("chatNoirHint")}</p>
      {targets.length > 1 && (
        <select
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setPick("");
          }}
          className="rounded-xl border border-border bg-bg px-3 py-2 text-sm"
        >
          {targets.map((x) => (
            <option key={x.target} value={x.target}>
              {targetLabel(x)} · {x.oldLabel} ({t("chatNoirAbandoned")})
            </option>
          ))}
        </select>
      )}
      {targets.length === 1 && current && (
        <div className="text-[13px]">
          {targetLabel(current)} · <span className="line-through">{current.oldLabel}</span> ({t("chatNoirAbandoned")})
        </div>
      )}
      <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded-xl border border-border bg-bg px-3 py-2 text-sm">
        <option value="">{t("noPick")}</option>
        {(current?.options ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
            {o.odds != null ? ` · ${o.odds}` : ""}
          </option>
        ))}
      </select>
      {error && <div className="text-xs text-red-500">{error}</div>}
      <button
        type="button"
        onClick={submit}
        disabled={!pick || saving}
        className="rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-on-gold disabled:opacity-50"
      >
        {saving ? t("saving") : t("chatNoirReplace")}
      </button>
    </div>
  );
}
