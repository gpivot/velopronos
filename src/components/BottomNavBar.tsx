import { Link } from "@/i18n/navigation";
import { HomeIcon, CalendarIcon, PodiumIcon, LeaguesIcon, ShieldIcon } from "./icons";

export const NAV_ITEMS = [
  { href: "/", labelKey: "home", icon: HomeIcon },
  { href: "/courses", labelKey: "stages", icon: CalendarIcon },
  { href: "/classement", labelKey: "standings", icon: PodiumIcon },
  { href: "/ligues", labelKey: "leagues", icon: LeaguesIcon },
] as const;

export type NavHref = (typeof NAV_ITEMS)[number]["href"];
export type NavLabels = Record<(typeof NAV_ITEMS)[number]["labelKey"] | "admin", string>;

/** Barre de navigation basse, partagée par BottomNav (page chargée) et BottomNavLoading (chargement). */
export function BottomNavBar({ labels, isAdmin, active }: { labels: NavLabels; isAdmin: boolean; active?: NavHref }) {
  return (
    // Figée en bas de l'écran pendant le défilement (sticky : reste dans le flux, rien à compenser).
    <nav className="sticky bottom-0 z-40 flex items-center justify-around border-t border-border bg-nav/95 px-1 py-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur">
      {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
        const isActive = href === active;
        return (
          <Link
            key={href}
            href={href}
            data-guest-lock
            className={`flex flex-col items-center gap-1 font-display text-[10px] font-semibold ${
              isActive ? "text-ice" : "text-text-dim"
            }`}
          >
            <Icon className="h-5 w-5" />
            {labels[labelKey]}
          </Link>
        );
      })}
      {isAdmin && (
        // /admin est hors i18n (back-office interne) : lien natif, pas <Link> de next-intl.
        <a href="/admin" className="flex flex-col items-center gap-1 font-display text-[10px] font-semibold text-text-dim">
          <ShieldIcon className="h-5 w-5" />
          {labels.admin}
        </a>
      )}
    </nav>
  );
}
