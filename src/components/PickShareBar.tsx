"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Barre en fond de ligne, proportionnelle au % de joueurs qui ont choisi ce coureur (repris de
 * Biathlonpronos). Couleur `ice` de VéloPronos (jaune vif en sombre, marron en clair), pour ne pas la confondre avec
 * les barres de points en or (`gold`, orangé en sombre). Aucun
 * chiffre affiché : la phrase apparaît au survol, et quelques secondes quand on touche la ligne.
 *
 * La ligne parente doit porter `relative isolate group` (la barre passe sous son contenu).
 */
export function PickShareBar({ percent, label }: { percent: number; label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const row = ref.current?.parentElement;
    if (!row) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onTouch = () => {
      setTouched(true);
      clearTimeout(timer);
      timer = setTimeout(() => setTouched(false), 2500);
    };
    row.addEventListener("touchstart", onTouch, { passive: true });
    return () => {
      row.removeEventListener("touchstart", onTouch);
      clearTimeout(timer);
    };
  }, []);

  const width = Math.max(0, Math.min(100, percent));
  return (
    <>
      <span ref={ref} aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
        <span
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-ice/5 to-ice/30"
          style={{ width: `${width}%` }}
        />
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded-full border border-ice/40 bg-card px-2.5 py-1 text-[11px] font-semibold text-frost shadow-lg transition-opacity ${
          touched ? "opacity-100" : "opacity-0"
        } [@media(hover:hover)]:group-hover:opacity-100`}
      >
        {label}
      </span>
    </>
  );
}
