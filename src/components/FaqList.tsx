import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// FAQ partagée entre la page d'accueil visiteur et la page Profil (textes dans Landing.faq_*).
const FAQ = [
  "free",
  "account",
  "when",
  "points",
  "jerseys",
  "burnt",
  "joker",
  "special",
  "cards",
  "team",
  "standings",
  "worlds",
] as const;

// rulesLink=false sur le Profil, qui a déjà sa ligne « Aide et règles » juste en dessous.
export async function FaqList({ rulesLink = true }: { rulesLink?: boolean }) {
  const t = await getTranslations("Landing");
  return (
    <>
      <div className="flex flex-col gap-2.5">
        {FAQ.map((q) => (
          <details
            key={q}
            className="group rounded-2xl border border-border bg-card/70 px-5 py-4 open:bg-card"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-[15px] font-bold [&::-webkit-details-marker]:hidden">
              {t(`faq_${q}_q`)}
              <span className="text-xl leading-none text-ice transition group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-text-dim">
              {t(`faq_${q}_a`)}
            </p>
          </details>
        ))}
      </div>
      {rulesLink && (
        <div className="mt-6 text-center">
          <Link
            href="/regles"
            className="text-sm font-semibold text-ice underline-offset-4 hover:underline"
          >
            {t("faqRulesLink")} →
          </Link>
        </div>
      )}
    </>
  );
}
