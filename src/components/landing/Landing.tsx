import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AppleIcon, LogoMark, PlayIcon } from "@/components/icons";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { FaqList } from "@/components/FaqList";
import { LeagueMockup, PickMockup, ScoreMockup, StrategyMockup } from "./Mockups";

// Page d'accueil visiteur (non connecté) : accroche avec le bouton « Je joue », puis 4 points
// illustrés par des mini-écrans commentés façon tutoriel, une FAQ, un dernier appel à jouer et le
// pied de page. Les joueurs connectés voient le dashboard à la place (cf. src/app/[locale]/page.tsx).
const FEATURES = [
  { key: "f1", Mockup: PickMockup },
  { key: "f2", Mockup: ScoreMockup },
  { key: "f3", Mockup: LeagueMockup },
  { key: "f4", Mockup: StrategyMockup },
] as const;

export async function Landing() {
  const t = await getTranslations("Landing");

  return (
    <div className="flex min-h-dvh flex-col">
      <section className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 pb-10 pt-16 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.45_0.15_250/0.45),transparent)]"
        />

        <div className="absolute right-4 top-4 z-10">
          <LocaleSwitcher />
        </div>

        <div className="relative flex flex-col items-center gap-3">
          <LogoMark className="h-20 w-20 text-text" />
          <Wordmark className="text-3xl" />
        </div>

        <h1 className="relative mt-10 max-w-5xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          <span className="block text-text">{t("heroTitle")}</span>
          <span className="block bg-gradient-to-r from-blue to-teal bg-clip-text text-transparent">{t("heroAccent")}</span>
        </h1>

        <p className="relative mt-5 max-w-md text-base leading-relaxed text-text-dim sm:text-lg">{t("heroSubtitle")}</p>

        {/* Parcours d'invité : on joue tout de suite, le compte n'est demandé qu'à la validation du pronostic. */}
        <Link
          href="/jouer"
          className="relative mt-8 rounded-2xl bg-gradient-to-r from-blue to-teal px-8 py-4 font-display text-base font-extrabold text-white shadow-[0_10px_40px_-10px_oklch(0.62_0.19_255/0.7)] transition hover:brightness-110 sm:text-lg"
        >
          {t("heroCta")} →
        </Link>
        <Link href="/sign-in" className="relative mt-4 text-sm font-medium text-text-dim hover:text-frost">
          {t("heroSignIn")}
        </Link>

        <div className="relative mt-8 font-display text-xs font-semibold uppercase tracking-[0.15em] text-text-dim">
          {t("appStoresTitle")}
        </div>
        <div className="relative mt-3 flex flex-wrap justify-center gap-3">
          <StoreBadge icon={<AppleIcon className="h-6 w-6" />} caption={t("appStoreSoon")} store="App Store" />
          <StoreBadge icon={<PlayIcon className="h-6 w-6" />} caption={t("appStoreSoon")} store="Google Play" />
        </div>

        <div aria-hidden className="relative mt-14 flex h-9 w-6 justify-center rounded-full border-2 border-text-dim/60 pt-1.5">
          <div className="h-2 w-1 animate-bounce rounded-full bg-text-dim" />
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-5 py-16">
        <SectionTitle eyebrow={t("featuresEyebrow")} title={t("featuresTitle")} />
        <div className="mt-12 flex flex-col gap-16 sm:gap-20">
          {FEATURES.map(({ key, Mockup }, index) => (
            <div key={key} className="grid items-center gap-8 sm:grid-cols-2 sm:gap-12">
              <div className={`flex flex-col gap-3 ${index % 2 === 1 ? "sm:order-2" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue to-teal font-display text-lg font-extrabold text-white">
                    {index + 1}
                  </span>
                  <h3 className="font-display text-xl font-extrabold leading-tight sm:text-2xl">{t(`${key}Title`)}</h3>
                </div>
                <p className="text-[15px] leading-relaxed text-text-dim">{t(`${key}Body`)}</p>
                <ol className="mt-1 flex flex-col gap-2.5">
                  {[1, 2, 3].map((n) => (
                    <li key={n} className="flex gap-3 text-sm leading-snug">
                      <span className="mt-px flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gold font-display text-[10px] font-extrabold text-on-gold">
                        {n}
                      </span>
                      <span>{t(`${key}Pin${n}`)}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className={index % 2 === 1 ? "sm:order-1" : ""}>
                <Mockup />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="mx-auto w-full max-w-2xl scroll-mt-6 px-5 py-16">
        <SectionTitle eyebrow={t("faqEyebrow")} title={t("faqTitle")} />
        <div className="mt-10">
          <FaqList />
        </div>
      </section>

      <section className="px-5 pb-20 pt-8 text-center">
        <h2 className="mx-auto max-w-xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{t("finalTitle")}</h2>
        <p className="mx-auto mt-3 max-w-md text-base text-text-dim">{t("finalSubtitle")}</p>
        <Link
          href="/jouer"
          className="mt-7 inline-block rounded-2xl bg-gradient-to-r from-blue to-teal px-8 py-4 font-display text-base font-extrabold text-white shadow-[0_10px_40px_-10px_oklch(0.62_0.19_255/0.7)] transition hover:brightness-110 sm:text-lg"
        >
          {t("heroCta")} →
        </Link>
      </section>

      <footer className="mt-auto border-t border-border px-5 py-10">
        <div className="mx-auto grid max-w-3xl gap-8 text-center sm:grid-cols-4 sm:text-left">
          <div className="flex flex-col items-center gap-3 sm:items-start">
            <div className="flex items-center gap-2">
              <LogoMark className="h-5 w-5 text-text" />
              <Wordmark className="text-base" />
            </div>
            <LocaleSwitcher />
          </div>
          <FooterColumn
            title={t("footerGame")}
            links={[
              { href: "/regles", label: t("footerRules") },
              { href: "/courses", label: t("footerCalendar") },
              { href: "/classement", label: t("footerStandings") },
              { href: "/ligues", label: t("footerLeagues") },
            ]}
          />
          <FooterColumn
            title={t("footerHelp")}
            links={[
              { href: "/#faq", label: t("footerFaq") },
              { href: "/support", label: t("footerSupport") },
              { href: "/sign-in", label: t("footerSignIn") },
            ]}
          />
          <FooterColumn
            title={t("footerLegal")}
            links={[
              { href: "/cgu", label: t("footerTerms") },
              { href: "/confidentialite", label: t("footerPrivacy") },
            ]}
          />
        </div>
        <p className="mx-auto mt-8 max-w-sm text-center text-xs leading-relaxed text-text-dim/80">{t("footerDisclaimer")}</p>
        <p className="mt-4 text-center text-xs text-text-dim/70">
          © {new Date().getFullYear()} Vélo<span className="text-ice">Pronos</span>
        </p>
      </footer>
    </div>
  );
}

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-display text-xs font-bold uppercase tracking-wider text-text">{title}</div>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="text-sm text-text-dim hover:text-frost">
          {l.label}
        </Link>
      ))}
    </div>
  );
}

function Wordmark({ className }: { className: string }) {
  return (
    <div className={`font-display font-extrabold tracking-tight ${className}`}>
      <span className="text-text">Vélo</span>
      <span className="text-ice">Pronos</span>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-xs font-semibold uppercase tracking-[0.15em] text-text-dim">{eyebrow}</div>
      <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
    </div>
  );
}

// L'application mobile n'existe pas encore : badges « bientôt disponible », non cliquables.
function StoreBadge({ icon, caption, store }: { icon: React.ReactNode; caption: string; store: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card/60 px-4 py-2 text-left text-text-dim">
      {icon}
      <div className="leading-tight">
        <div className="text-[10px]">{caption}</div>
        <div className="font-display text-sm font-bold">{store}</div>
      </div>
    </div>
  );
}
