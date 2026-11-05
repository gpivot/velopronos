"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon } from "./icons";

const items = [
  { href: "/admin", label: "Calendrier & résultats", matches: ["/admin/races", "/admin/calendrier"] },
  { href: "/admin/athletes", label: "Coureurs & cotes", matches: ["/admin/athletes"] },
  { href: "/admin/cartes", label: "Cartes bonus", matches: ["/admin/cartes"] },
  { href: "/admin/joueurs", label: "Joueurs & rôles", matches: ["/admin/joueurs"] },
  { href: "/admin/horloge", label: "Horloge simulée", matches: ["/admin/horloge"] },
  { href: "/admin/notifications", label: "Notifications", matches: ["/admin/notifications"] },
  { href: "/admin/messages", label: "Messages", matches: ["/admin/messages"] },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3 text-sm">
      <Link
        href="/fr"
        aria-label="Retour à l'accueil"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card text-text-dim hover:text-ice"
      >
        <ArrowLeftIcon className="h-4 w-4" />
      </Link>
      {items.map((item) => {
        const isActive = pathname === item.href || item.matches.some((m) => pathname.startsWith(m));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={isActive ? "font-semibold text-ice" : "text-text-dim hover:text-ice"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
