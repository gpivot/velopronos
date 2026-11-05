"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PlayerCards } from "@/lib/bonusCards";
import { CloseIcon } from "@/components/icons";

const AUTO_OPEN_KEY = "bp-claim-card-shown";

/**
 * 10/10 atteint : bouton doré dans l'encadré « Série en cours » qui ouvre le pop-up de choix de
 * la carte. `autoOpen` (accueil) l'ouvre de lui-même, une fois par visite.
 */
export function ClaimCardPicker({
  courseId,
  unclaimed,
  offers,
  autoOpen = false,
}: {
  /** Course par étapes où la carte a été gagnée (VéloPronos). */
  courseId: string;
  unclaimed: number;
  offers: PlayerCards["offers"];
  autoOpen?: boolean;
}) {
  const t = useTranslations("BonusCards");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!autoOpen) return;
    try {
      if (sessionStorage.getItem(AUTO_OPEN_KEY)) return;
      sessionStorage.setItem(AUTO_OPEN_KEY, "1");
    } catch {
      // Stockage indisponible : on ouvre quand même.
    }
    setOpen(true);
  }, [autoOpen]);

  async function claim(cardType: string) {
    setSaving(true);
    setError(null);
    const { error: claimError } = await createClient().rpc("claim_course_card", { p_stage_id: courseId, p_card_type: cardType });
    setSaving(false);
    if (claimError) {
      console.error(claimError);
      setError(t("claimError"));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-full bg-gold py-2.5 text-center font-display text-[13px] font-extrabold text-on-gold"
      >
        {t("claimButton", { count: unclaimed })}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("claimTitle")}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="font-display text-lg font-extrabold">🎉 {t("claimTitle")}</div>
                <div className="text-[13px] leading-relaxed text-text-dim">{t("claimIntro", { count: unclaimed })}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("later")}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border text-text-dim"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {offers.map(({ type, state }) => {
                const disabled = saving || state !== "offered";
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={disabled}
                    onClick={() => claim(type)}
                    className={`flex flex-col gap-1 rounded-2xl border p-4 text-left ${
                      disabled ? "border-border opacity-50" : "border-gold/60 bg-gold-soft"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🃏</span>
                      <span className="flex-1 font-display text-[15px] font-extrabold text-gold">{t(`name_${type}`)}</span>
                      <span className="font-display text-[12px] font-bold text-text-dim">
                        {state === "locked"
                          ? t(`lockedUntil_${type}`)
                          : state === "unavailable"
                            ? t("unavailable")
                            : state === "justTaken"
                              ? t("justTaken")
                              : t("choose")}
                      </span>
                    </div>
                    <div className="text-[13px] leading-relaxed text-frost">{t(`desc_${type}`)}</div>
                  </button>
                );
              })}
            </div>

            {error && <div className="text-xs text-red">{error}</div>}
            <button type="button" onClick={() => setOpen(false)} className="font-display text-[13px] font-bold text-text-dim">
              {t("later")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
