import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Profil d'étape envoyé depuis le back-office (image jusqu'à 5 Mo).
    serverActions: { bodySizeLimit: "6mb" },
    // Par défaut, Next 14 garde 30 s dans le navigateur une page déjà visitée : en revenant sur
    // l'accueil après avoir modifié un pronostic, on revoyait l'ancienne version. À 0, chaque
    // navigation redemande la page au serveur (les données sont toujours à jour).
    staleTimes: { dynamic: 0 },
  },
};

export default withNextIntl(nextConfig);
