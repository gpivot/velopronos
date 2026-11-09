import { registerPlugin } from "@capacitor/core";
import { nativePlatform } from "./firebaseMessaging";

/**
 * Connexion Google / Apple dans l'appli Android / iOS, par la fenêtre native du téléphone (plugin
 * @capgo/capacitor-social-login, installé côté appli seulement). Google refuse la connexion depuis
 * une vue web intégrée : le parcours du site (signInWithOAuth + redirection) n'y marche pas. Le
 * plugin renvoie un jeton d'identité que Supabase vérifie (signInWithIdToken).
 *
 * Identifiants OAuth Google (publics, ils ne donnent accès à rien) : le client « Application Web »
 * utilisé par Supabase, et un client « iOS » créé pour l'identifiant iOS de l'appli, dans la console
 * Google Cloud du projet Firebase VéloPronos. Vides = bouton masqué.
 * VéloPronos (09/11/2026) : vidés en attendant le projet Firebase / Google Cloud VéloPronos (ceux de
 * Biathlonpronos ne marchent pas ici). Voir docs/velopronos/publication-stores.md, étape 6.
 * Le client iOS doit aussi figurer, à l'envers, dans mobile/ios/App/App/Info.plist (URL scheme),
 * sinon le SDK Google fait planter l'appli.
 */
export const GOOGLE_WEB_CLIENT_ID = "";
export const GOOGLE_IOS_CLIENT_ID = "";

interface SocialLoginPlugin {
  initialize(options: {
    google?: { webClientId?: string; iOSClientId?: string; iOSServerClientId?: string; mode?: "online"; skipAuthOnlyAuthorizationAfterSignIn?: boolean };
    apple?: { clientId?: string };
  }): Promise<void>;
  login(options: {
    provider: "google" | "apple";
    options: { nonce?: string; scopes?: string[] };
  }): Promise<{ provider: string; result: { idToken: string | null } }>;
}

const SocialLogin = registerPlugin<SocialLoginPlugin>("SocialLogin");

export type NativeProvider = "google" | "apple";

/**
 * Fournisseurs proposés dans l'appli. Apple seulement sur iPhone (sur Android il faudrait un
 * serveur de redirection), Google une fois ses identifiants renseignés.
 */
export function nativeProviders(): NativeProvider[] {
  const platform = nativePlatform();
  if (!platform) return [];
  const providers: NativeProvider[] = [];
  if (GOOGLE_WEB_CLIENT_ID && (platform === "android" || GOOGLE_IOS_CLIENT_ID)) providers.push("google");
  if (platform === "ios") providers.push("apple");
  return providers;
}

let initialized = false;

/**
 * Ouvre la fenêtre de connexion native et renvoie le jeton d'identité, avec le nonce brut à
 * transmettre à Supabase (Apple reçoit son empreinte SHA-256, que Supabase recalcule).
 */
export async function nativeSignIn(provider: NativeProvider): Promise<{ idToken: string; nonce?: string }> {
  if (!initialized) {
    await SocialLogin.initialize({
      google: GOOGLE_WEB_CLIENT_ID
        ? {
            webClientId: GOOGLE_WEB_CLIENT_ID,
            iOSClientId: GOOGLE_IOS_CLIENT_ID || undefined,
            // Jeton émis pour le client Web : c'est celui que Supabase connaît déjà.
            iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
            mode: "online",
            // Seul l'idToken sert (Supabase) : on évite l'étape d'autorisation Android qui peut
            // bloquer sur une BridgeActivity standard.
            skipAuthOnlyAuthorizationAfterSignIn: true,
          }
        : undefined,
      apple: nativePlatform() === "ios" ? { clientId: "fr.biathlonpronos.app" } : undefined,
    });
    initialized = true;
  }

  if (provider === "apple") {
    const nonce = randomNonce();
    const { result } = await SocialLogin.login({
      provider: "apple",
      options: { nonce: await sha256Hex(nonce), scopes: ["email", "name"] },
    });
    if (!result.idToken) throw new Error("Apple n'a pas renvoyé de jeton.");
    return { idToken: result.idToken, nonce };
  }

  const { result } = await SocialLogin.login({ provider: "google", options: {} });
  if (!result.idToken) throw new Error("Google n'a pas renvoyé de jeton.");
  return { idToken: result.idToken };
}

/** L'utilisateur a fermé la fenêtre de connexion : pas une erreur à afficher. */
export function isCancelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel|annul|1001|12501|16:/i.test(message);
}

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
