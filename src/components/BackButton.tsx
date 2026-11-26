import { Link } from "@/i18n/navigation";
import { ArrowLeftIcon } from "@/components/icons";

/**
 * Flèche retour : ramène toujours à la même page (ex. la racine de « Ma saison » depuis une
 * course), quelle que soit la page consultée avant. Le lien garde la langue courante.
 */
export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      data-guest-lock
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card text-text-dim"
    >
      <ArrowLeftIcon className="h-4 w-4" />
    </Link>
  );
}
