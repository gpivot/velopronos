import { getTranslations } from "next-intl/server";
import { FacebookOutlineIcon, InstagramIcon } from "@/components/icons";

// Comptes officiels de VéloPronos. Dans l'appli mobile (Capacitor), ces domaines ne sont pas
// dans « allowNavigation » (mobile/capacitor.config.ts) : les liens s'ouvrent dans le navigateur
// du téléphone (ou l'appli Instagram/Facebook), sans quitter le jeu.
export const SOCIAL_LINKS = [
  { key: "instagram", href: "https://www.instagram.com/velopronos/", Icon: InstagramIcon },
  { key: "facebook", href: "https://www.facebook.com/velopronos/", Icon: FacebookOutlineIcon },
] as const;

/** Pastilles Instagram / Facebook, ouvertes dans un nouvel onglet. */
export async function SocialLinks({ className = "", withTitle = false }: { className?: string; withTitle?: boolean }) {
  const t = await getTranslations("Social");
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {withTitle && (
        <div className="font-display text-xs font-semibold uppercase tracking-[0.15em] text-text-dim">{t("title")}</div>
      )}
      <div className="flex items-center gap-3">
        {SOCIAL_LINKS.map(({ key, href, Icon }) => (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t(key)}
            title={t(key)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/60 text-text-dim transition hover:border-blue/70 hover:text-frost"
          >
            <Icon className="h-5 w-5" />
          </a>
        ))}
      </div>
    </div>
  );
}
