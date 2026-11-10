"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { routing } from "@/i18n/routing";
import { CloseIcon } from "@/components/icons";
import { GuestSignupDialog } from "@/components/GuestSignupDialog";

/** Pages qu'un invité (bouton « Je joue », session anonyme) peut ouvrir. */
const GUEST_PAGES = [/^\/$/, /^\/jouer$/, /^\/sign-in$/, /^\/courses\/[^/]+$/, /^\/regles$/, /^\/confidentialite$/, /^\/cgu$/, /^\/support$/];
/** Liens qu'un invité peut suivre depuis une page : pas de navigation vers les autres onglets ni les autres courses. */
const GUEST_LINKS = [/^\/$/, /^\/jouer$/, /^\/sign-in$/, /^\/regles$/, /^\/confidentialite$/, /^\/cgu$/, /^\/support$/];

/** Chemin sans le préfixe de langue (/fr/courses/12 → /courses/12). */
function stripLocale(path: string): string {
  const [, first, ...rest] = path.split("/");
  if ((routing.locales as readonly string[]).includes(first)) return "/" + rest.join("/");
  return path;
}

/**
 * Parcours d'invité (demande de Guillaume, 10/11/2026) : tant que le joueur arrivé par « Je joue »
 * n'a pas de vrai compte, il reste sur sa course. Les onglets et boutons de navigation (marqués
 * `data-guest-lock`) sont grisés, et tout clic vers une autre page ouvre une pop-up qui propose
 * l'inscription gratuite. Une page interdite ouverte directement (adresse tapée) affiche la même
 * pop-up ; la fermer ramène à la course.
 */
export function GuestNavGuard() {
  const t = useTranslations("Guest");
  const pathname = usePathname();
  const router = useRouter();
  const [guest, setGuest] = useState(false);
  const [popup, setPopup] = useState(false);
  const [signup, setSignup] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => setGuest(Boolean(session?.user.is_anonymous)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setGuest(Boolean(session?.user.is_anonymous)));
    return () => data.subscription.unsubscribe();
  }, []);

  const current = stripLocale(pathname ?? "/");
  const pageBlocked = guest && !GUEST_PAGES.some((re) => re.test(current));

  // Grisage : classe sur <html>, lue par globals.css.
  useEffect(() => {
    document.documentElement.classList.toggle("guest-mode", guest);
    return () => document.documentElement.classList.remove("guest-mode");
  }, [guest]);

  useEffect(() => {
    if (pageBlocked) setPopup(true);
  }, [pageBlocked]);

  useEffect(() => {
    if (!guest) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target || target.closest("[data-guest-popup]")) return;
      let blocked = Boolean(target.closest("[data-guest-lock]"));
      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!blocked && anchor) {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin === window.location.origin) {
          const path = stripLocale(url.pathname);
          blocked = path !== current && !GUEST_LINKS.some((re) => re.test(path));
        }
      }
      if (!blocked) return;
      e.preventDefault();
      e.stopPropagation();
      setPopup(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [guest, current]);

  if (!guest) return null;

  function close() {
    setPopup(false);
    if (pageBlocked) router.replace("/jouer");
  }

  return (
    <>
      {popup && !signup && (
        <div
          data-guest-popup
          role="dialog"
          aria-modal="true"
          aria-label={t("lockedTitle")}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
        >
          <div className="flex w-full max-w-md flex-col gap-4 rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="font-display text-base font-bold">🔒 {t("lockedTitle")}</div>
              <button
                type="button"
                onClick={close}
                aria-label={t("close")}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border text-text-dim"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[13px] leading-relaxed text-frost">
              {t.rich("lockedBody", {
                link: (chunks) => (
                  <button type="button" onClick={() => setSignup(true)} className="font-semibold text-ice underline">
                    {chunks}
                  </button>
                ),
              })}
            </p>
            <button
              type="button"
              onClick={() => setSignup(true)}
              className="rounded-xl bg-ice py-3 font-display text-sm font-bold text-on-ice"
            >
              {t("lockedSignUp")}
            </button>
            <div className="flex justify-between text-xs text-text-dim">
              <Link href="/sign-in" className="underline">
                {t("lockedSignIn")}
              </Link>
              <button type="button" onClick={close} className="underline">
                {pageBlocked ? t("lockedBackToRace") : t("lockedContinue")}
              </button>
            </div>
          </div>
        </div>
      )}
      {signup && (
        <div data-guest-popup>
          <GuestSignupDialog
            mode="account"
            onClose={() => setSignup(false)}
            onDone={() => {
              setSignup(false);
              setPopup(false);
              setGuest(false);
              router.refresh();
            }}
          />
        </div>
      )}
    </>
  );
}
