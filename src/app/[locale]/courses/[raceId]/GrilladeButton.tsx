"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

export function GrilladeButton({ raceId, cardId }: { raceId: string; cardId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();
  const t = useTranslations("PredictionForm");

  async function handleClick() {
    setLoading(true);
    setError(null);

    // La carte est rattachée à cette course : l'écran n'y affiche alors plus
    // aucun biathlète grillé (voir le calcul du grillage dans page.tsx).
    const { error: cardError } = await supabase.rpc("play_bonus_card", { p_card_id: cardId, p_race_id: raceId });

    setLoading(false);
    if (cardError) {
      setError(cardError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={handleClick}
        disabled={loading}
        className="self-start rounded-full border border-gold/40 bg-gold-soft px-3.5 py-1.5 font-display text-[12px] font-bold text-gold disabled:opacity-60"
      >
        {loading ? t("saving") : t("cardGrilladeAction")}
      </button>
      {error && <div className="text-xs text-red">{error}</div>}
    </div>
  );
}
