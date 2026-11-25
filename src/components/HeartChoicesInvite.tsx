import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronRightIcon } from "./icons";

/** Équipe de cœur + nation favorite. */
export const HEART_CHOICES_TOTAL = 2;

/**
 * Haut de l'encadré « Saison » de l'accueil (repris de l'invitation aux pronostics de saison de
 * Biathlonpronos) : tant que les deux choix de cœur ne sont pas faits, invitation à les saisir,
 * avec le départ de la 1re course officielle de la saison (2027 : Strade Bianche) tant qu'elle
 * n'est pas partie. Les choix restent possibles ensuite (règle 0052), l'invitation aussi.
 */
export function HeartChoicesInvite({ chosen, firstRace }: { chosen: number; firstRace: { name: string; date: string } | null }) {
  const t = useTranslations("Home");
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gold/40 bg-gold-soft px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">❤️</span>
        <div className="flex-1 font-display text-[13px] font-bold text-gold">{t("heartChoicesTitle")}</div>
        <div className="font-display text-[13px] font-extrabold tabular-nums text-gold">
          {chosen} / {HEART_CHOICES_TOTAL}
        </div>
      </div>
      <div className="text-[11px] leading-relaxed text-text-dim">
        {t("heartChoicesHint")}
        {firstRace && (
          <span className="font-semibold text-frost"> {t("heartChoicesDeadline", { race: firstRace.name, date: firstRace.date })}</span>
        )}
      </div>
      <Link
        href="/coeur"
        className="flex items-center justify-center gap-1 rounded-full bg-gold py-2.5 font-display text-[13px] font-bold text-on-gold"
      >
        {t("heartChoicesButton")}
        <ChevronRightIcon className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
