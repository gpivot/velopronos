"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { normalizeLocale } from "@/lib/notifications/texts";

/**
 * Parcours d'invité « e-mail seulement » (décision de Guillaume, 10/11/2026, migration 0045).
 *
 * 1. `registerGuestEmail` : l'invité (session anonyme Supabase) donne son e-mail pour valider son
 *    pronostic. L'adresse est rattachée à son compte côté serveur (sans code à saisir) : le compte
 *    n'est plus anonyme, le pronostic peut être enregistré, mais il reste « en attente
 *    d'inscription » (profiles.signup_pending) : hors classements, sans rappels par e-mail.
 * 2. Après la course, l'e-mail du score (notifyGuestResults) lui donne un code privé et un lien.
 * 3. `completeGuestSignup` : pseudo, prénom, nom ; le compte devient un compte complet.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegisterGuestEmailResult = { ok: true } | { ok: false; error: "emailTaken" | "invalidEmail" | "notGuest" | "unknown" };

export async function registerGuestEmail(rawEmail: string, locale: string): Promise<RegisterGuestEmailResult> {
  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "invalidEmail" };

  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user || !user.is_anonymous) return { ok: false, error: "notGuest" };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    email,
    // Adresse rattachée sans code : le compte cesse d'être anonyme (Supabase Auth). La possession
    // de l'adresse est prouvée plus tard, au retour par le code ou le lien de l'e-mail du score.
    email_confirm: true,
    user_metadata: { ...(user.user_metadata ?? {}), locale: normalizeLocale(locale) },
  });
  if (error) {
    if (error.code === "email_exists" || /already|registered|exists/i.test(error.message)) return { ok: false, error: "emailTaken" };
    console.error("registerGuestEmail:", error.message);
    return { ok: false, error: "unknown" };
  }
  const { error: profileError } = await admin.from("profiles").update({ signup_pending: true }).eq("id", user.id);
  if (profileError) console.error("registerGuestEmail (profil):", profileError.message);
  return { ok: true };
}

export type CompleteGuestSignupResult = { ok: true } | { ok: false; error: "pseudoLength" | "pseudoTaken" | "missingName" | "notPending" | "unknown" };

export async function completeGuestSignup(input: { pseudo: string; firstName: string; lastName: string }): Promise<CompleteGuestSignupResult> {
  const pseudo = String(input?.pseudo ?? "").trim();
  const firstName = String(input?.firstName ?? "").trim();
  const lastName = String(input?.lastName ?? "").trim();
  if (pseudo.length < 2 || pseudo.length > 20) return { ok: false, error: "pseudoLength" };
  if (!firstName || !lastName) return { ok: false, error: "missingName" };

  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user || user.is_anonymous) return { ok: false, error: "notPending" };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("signup_pending").eq("id", user.id).maybeSingle();
  if (!profile?.signup_pending) return { ok: false, error: "notPending" };

  const { error } = await admin.from("profiles").update({ pseudo, signup_pending: false }).eq("id", user.id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "pseudoTaken" };
    console.error("completeGuestSignup:", error.message);
    return { ok: false, error: "unknown" };
  }
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...(user.user_metadata ?? {}), pseudo, first_name: firstName, last_name: lastName },
  });
  return { ok: true };
}
