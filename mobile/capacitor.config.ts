import type { CapacitorConfig } from "@capacitor/cli";

/**
 * L'appli n'embarque pas le site : elle ouvre www.velopronos.fr dans une vue web native.
 * Chaque mise à jour poussée sur main (déployée par Vercel) arrive donc dans l'appli sans
 * repasser par les stores. Seuls les changements natifs (plugins, icône…) demandent une
 * nouvelle version.
 */
const config: CapacitorConfig = {
  // Identifiant d'application : à confirmer par Guillaume (nouvel identifiant, ou celui d'une appli
  // VéloPronos déjà publiée). Le changer demande aussi de mettre à jour android/ et ios/ (voir
  // docs/velopronos/duplication.md).
  appId: "fr.biathlonpronos.app",
  appName: "VéloPronos",
  // Pages locales : seulement l'écran affiché quand le site est injoignable (pas de réseau).
  webDir: "www",
  server: {
    // Domaine à confirmer (velopronos.fr pointe encore vers l'app base44).
    url: "https://www.velopronos.fr/",
    errorPath: "offline.html",
    // Liens vers ces domaines restent dans l'appli ; les autres s'ouvrent dans le navigateur.
    allowNavigation: ["www.velopronos.fr", "velopronos.fr"],
  },
  backgroundColor: "#1b130d",
  android: {
    // Le site garde la même apparence que dans Chrome.
    allowMixedContent: false,
  },
  ios: {
    // Le site gère lui-même l'encoche (viewport-fit=cover + env(safe-area-inset-*)).
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1b130d",
      showSpinner: false,
    },
    FirebaseMessaging: {
      // Notification affichée même quand l'appli est ouverte.
      presentationOptions: ["badge", "sound", "alert"],
    },
    // Connexion Google / Apple par la fenêtre native du téléphone (Google refuse les vues web).
    // Facebook et Twitter ne sont pas embarqués.
    SocialLogin: {
      providers: { google: true, apple: true, facebook: false, twitter: false },
      logLevel: 1,
    },
  },
  // Évite un conflit de noms de paquets Swift (doc du plugin @capacitor-firebase/messaging).
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          "@capacitor-firebase/messaging": { symlink: true },
        },
      },
    },
  },
};

export default config;
