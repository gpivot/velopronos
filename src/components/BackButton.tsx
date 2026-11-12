"use client";

import { useRouter } from "@/i18n/navigation";
import { ArrowLeftIcon } from "@/components/icons";
import { NAV_COUNT_KEY } from "@/components/NavigationTracker";

/**
 * Flèche retour : revient à la page consultée juste avant (accueil, Ma saison, Classement…).
 * Arrivée directe sur la page (lien partagé, nouvel onglet) : `fallback`.
 */
export function BackButton({ fallback, label }: { fallback: string; label: string }) {
  const router = useRouter();
  const goBack = () => {
    let pagesSeen = 0;
    try {
      pagesSeen = Number(sessionStorage.getItem(NAV_COUNT_KEY) ?? 0);
    } catch {}
    if (pagesSeen > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      data-guest-lock
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card text-text-dim"
    >
      <ArrowLeftIcon className="h-4 w-4" />
    </button>
  );
}
