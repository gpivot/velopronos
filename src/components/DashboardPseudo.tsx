"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { PencilIcon } from "@/components/icons";

const MIN_LENGTH = 2;
const MAX_LENGTH = 20;

/**
 * Pseudo en haut du tableau de bord (repris de Biathlonpronos). Pseudo jamais choisi (pseudo
 * automatique, ex. connexion Apple) : encart « Choisis ton nom de champion ! » pour le changer sur
 * place. Sinon, le pseudo et un petit crayon.
 */
export function DashboardPseudo({ userId, initialPseudo, auto }: { userId: string; initialPseudo: string; auto: boolean }) {
  const t = useTranslations("Home");
  const tc = useTranslations("Compte");
  const router = useRouter();
  const [pseudo, setPseudo] = useState(initialPseudo);
  const [isAuto, setIsAuto] = useState(auto);
  const [draft, setDraft] = useState(auto ? "" : initialPseudo);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) {
      setError(tc("pseudoLengthError", { min: MIN_LENGTH, max: MAX_LENGTH }));
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await createClient().from("profiles").update({ pseudo: value }).eq("id", userId);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setPseudo(value);
    setIsAuto(false);
    setEditing(false);
    router.refresh();
  }

  const form = (
    <form onSubmit={handleSave} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          autoFocus={editing}
          value={draft}
          maxLength={MAX_LENGTH}
          placeholder={t("pseudoPlaceholder")}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 font-display text-sm font-bold outline-none focus:border-ice"
        />
        <button
          type="submit"
          disabled={saving}
          className="flex-shrink-0 rounded-xl bg-ice px-4 py-2 font-display text-[13px] font-bold text-on-ice disabled:opacity-60"
        >
          {saving ? tc("saving") : tc("save")}
        </button>
      </div>
      {error && <div className="text-xs text-red">{error}</div>}
    </form>
  );

  if (isAuto) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-gold/40 bg-gold-soft px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏆</span>
          <div className="font-display text-[14px] font-bold text-gold">{t("pseudoChooseTitle")}</div>
        </div>
        <div className="text-[11px] leading-relaxed text-text-dim">{t("pseudoChooseHint", { pseudo })}</div>
        {form}
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        {form}
        <button type="button" onClick={() => setEditing(false)} className="self-start text-xs font-semibold text-text-dim">
          {tc("cancel")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="truncate font-display text-xl font-extrabold text-frost">{t("pseudoHello", { pseudo })}</div>
      <button
        type="button"
        onClick={() => {
          setDraft(pseudo);
          setError(null);
          setEditing(true);
        }}
        aria-label={tc("editPseudo")}
        className="flex-shrink-0 text-text-dim hover:text-frost"
      >
        <PencilIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
