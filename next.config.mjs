import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Profil d'étape envoyé depuis le back-office (image jusqu'à 5 Mo).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default withNextIntl(nextConfig);
