import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { NavigationTracker } from "@/components/NavigationTracker";
import { PushRegistrar } from "@/components/PushRegistrar";
import { LiveQuestionPopup } from "@/components/LiveQuestionInvite";
import { LocaleSync } from "@/components/LocaleSync";
import { GuestNavGuard } from "@/components/GuestNavGuard";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { Poppins } from "next/font/google";
import { SimulatedClockBanner } from "@/components/SimulatedClockBanner";
import { routing, type Locale } from "@/i18n/routing";
import "../globals.css";

// Même typographie que VéloPronos (app sœur) : Poppins pour les titres comme pour le texte.
const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Plein écran sous l'encoche dans l'appli iOS / Android : les marges viennent de env(safe-area-inset-*).
export const viewport: Viewport = { viewportFit: "cover" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale as Locale);
  const messages = await getMessages();

  return (
    <html lang={locale} className={poppins.variable} suppressHydrationWarning>
      <head>
        {/* Thème clair choisi dans le Profil : appliqué avant l'affichage pour éviter un flash sombre. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("theme")==="light")document.documentElement.classList.add("light")}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-bg text-text font-body">
        <SimulatedClockBanner />
        <NextIntlClientProvider messages={messages}>
          <NavigationTracker />
          <PushRegistrar />
          {/* Questions live ouvertes : pop-up sur toutes les pages (questions bonus, 02/11/2026). */}
          <LiveQuestionPopup />
          <LocaleSync />
          {/* Invité « Je joue » : navigation grisée et pop-up d'inscription (10/11/2026). */}
          <GuestNavGuard />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
