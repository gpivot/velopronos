import type { Config } from "tailwindcss";

// Tokens repris de Biathlonpronos ; couleurs VéloPronos (marron / jaune / blanc) dans src/app/globals.css.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Confirmation d'enregistrement (questions bonus) : petit rebond pour attirer l'œil.
      keyframes: {
        "save-pop": {
          "0%": { transform: "scale(0.94)", opacity: "0" },
          "60%": { transform: "scale(1.03)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: { "save-pop": "save-pop 0.35s ease-out" },
      // Couleurs définies par des variables CSS (src/app/globals.css) pour permettre le thème clair
      // (classe `light` sur <html>) ; `<alpha-value>` garde les modificateurs d'opacité (bg-card/70).
      colors: {
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        bg2: "rgb(var(--c-bg2) / <alpha-value>)",
        card: "rgb(var(--c-card) / <alpha-value>)",
        card2: "rgb(var(--c-card2) / <alpha-value>)",
        border: "rgb(var(--c-border) / <alpha-value>)",
        text: "rgb(var(--c-text) / <alpha-value>)",
        "text-dim": "rgb(var(--c-text-dim) / <alpha-value>)",
        ice: "oklch(var(--c-ice) / <alpha-value>)",
        "ice-soft": "oklch(var(--c-ice-soft) / <alpha-value>)",
        gold: "oklch(var(--c-gold) / <alpha-value>)",
        "gold-soft": "oklch(var(--c-gold-soft) / <alpha-value>)",
        red: "oklch(var(--c-red) / <alpha-value>)",
        frost: "rgb(var(--c-frost) / <alpha-value>)",
        // Texte posé sur un fond `ice` (sombre en thème sombre, blanc sur le bleu foncé du thème clair).
        "on-ice": "rgb(var(--c-on-ice) / <alpha-value>)",
        // Texte posé sur un fond `gold` (brun foncé sur l'or du thème sombre, blanc sur le bleu du thème clair).
        "on-gold": "rgb(var(--c-on-gold) / <alpha-value>)",
        // Fond de la barre de navigation basse (blanche en thème clair, comme VéloPronos).
        nav: "rgb(var(--c-nav) / <alpha-value>)",
        // Jaune fixe des dégradés de marque (avatar, en-têtes) : ne change pas avec le thème.
        // (Nom « teal » hérité de Biathlonpronos, gardé pour le code commun.)
        teal: "oklch(0.88 0.17 98 / <alpha-value>)",
        // Marron caramel des accents (dégradé du bouton d'appel à l'action, avec ice).
        // (Nom « blue » hérité de Biathlonpronos.)
        blue: "oklch(0.58 0.12 55 / <alpha-value>)",
        // Vert des bonus de combinaison (Top 3/5/10, Prono parfait), comme le « Bonus Musette » VéloPronos.
        green: "oklch(0.78 0.15 155 / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-poppins)", "system-ui", "sans-serif"],
        body: ["var(--font-poppins)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
