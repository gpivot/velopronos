"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { CheckIcon } from "@/components/icons";
import { GuestSignupDialog, GuestWelcome } from "@/components/GuestSignupDialog";
import { PredictionSummary } from "./PredictionSummary";
import { RuleInfoButton } from "./RuleInfoButton";
import { filterBySearch } from "@/lib/searchFilter";
import { SearchField } from "@/components/SearchField";
import { hasStaleGuestToken } from "@/lib/supabase/guestToken";

export type NationWithOdds = {
  nation_code: string;
  name: string;
  value: number;
};

export function RelayPredictionForm({
  raceId,
  format,
  nations,
  initialSelection,
  initialBonusX2,
  x2Eligible,
  x2UsesRemaining,
}: {
  raceId: string;
  format: string;
  nations: NationWithOdds[];
  initialSelection: string | null;
  initialBonusX2: boolean;
  x2Eligible: boolean;
  x2UsesRemaining: number;
}) {
  const [selected, setSelected] = useState<string | null>(initialSelection);
  const [bonusX2, setBonusX2] = useState(initialBonusX2);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Parcours d'invité : création du compte à la validation du premier pronostic.
  const [guestDialog, setGuestDialog] = useState(false);
  const [welcome, setWelcome] = useState(false);
  // Dernier pronostic enregistré, pour signaler une modification pas encore validée.
  const [savedState, setSavedState] = useState({ nation: initialSelection, bonusX2: initialBonusX2 });
  const supabase = createClient();
  const router = useRouter();
  const t = useTranslations("PredictionForm");

  const canUseX2 = x2Eligible && (initialBonusX2 || x2UsesRemaining > 0);

  async function submit() {
    if (!selected) return;
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Visiteur ou invité (session anonyme) : création du compte d'abord, puis enregistrement.
    if (!user || user.is_anonymous) {
      setGuestDialog(true);
      setSaving(false);
      return;
    }

    // Invité devenu joueur mais jeton encore « anonyme » : renouvellement avant d'écrire.
    if (await hasStaleGuestToken(supabase)) await supabase.auth.refreshSession();

    const { error } = await supabase.from("predictions").upsert(
      {
        user_id: user.id,
        race_id: raceId,
        nation_code: selected,
        athlete_ids: null,
        bonus_x2_used: bonusX2,
      },
      { onConflict: "user_id,race_id" }
    );

    setSaving(false);
    if (error) {
      console.error(error);
      // 42501 = refus des règles d'accès de la base : course verrouillée (heure de départ passée).
      setError(t(error.code === "42501" ? "lockedError" : "saveError"));
    } else {
      setSavedState({ nation: selected, bonusX2 });
    }
  }

  // Filtre : nom du pays ou code à 3 lettres (FRA, NOR…).
  const visibleNations = filterBySearch(nations, search, (n) => [n.name, n.nation_code], (n) => n.nation_code);
  const selectedNation = nations.find((n) => n.nation_code === selected);
  // Pronostic enregistré et inchangé : « Ton pronostic est validé ! » remplace le bouton.
  const unsaved = savedState.nation !== null && (savedState.nation !== selected || savedState.bonusX2 !== bonusX2);
  const validated = savedState.nation !== null && !unsaved;

  return (
    <div className="flex flex-col gap-4">
      <PredictionSummary
        picks={selected ? [{ key: selected, label: selectedNation?.name ?? selected, nationCode: selected }] : []}
        requiredCount={1}
        onRemove={() => {
          setSelected(null);
        }}
        x2Available={canUseX2}
        bonusX2={bonusX2}
        x2Remaining={x2UsesRemaining + (initialBonusX2 ? 1 : 0) - (bonusX2 ? 1 : 0)}
        onToggleX2={() => {
          setBonusX2((v) => !v);
        }}
        canSubmit={Boolean(selected)}
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

      <div className="flex items-center gap-2">
        <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">{t("chooseNation")}</div>
        <RuleInfoButton format={format} small />
      </div>

      <SearchField value={search} onChange={setSearch} placeholder={t("searchNation")} clearLabel={t("searchClear")} />

      <div className="flex flex-col gap-2">
        {visibleNations.length === 0 && (
          <div className="rounded-2xl border border-border bg-card px-3.5 py-3 text-center text-[13px] text-text-dim">
            {t("searchNoResult")}
          </div>
        )}
        {visibleNations.map((n) => {
          const isSelected = selected === n.nation_code;
          return (
            <button
              key={n.nation_code}
              onClick={() => {
                setSelected(n.nation_code);
              }}
              className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                isSelected ? "border-ice bg-ice-soft" : "border-border bg-card"
              }`}
            >
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-semibold">{n.name}</span>
                <span className="text-[11px] text-text-dim">{n.nation_code}</span>
              </div>
              <div className={`font-display text-sm font-bold ${isSelected ? "text-ice" : "text-text-dim"}`}>
                ×{n.value}
              </div>
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] ${
                  isSelected ? "border-ice bg-ice" : "border-border"
                }`}
              >
                {isSelected && <CheckIcon className="h-3 w-3 text-on-ice" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
