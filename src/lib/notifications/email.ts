/**
 * Envoi des e-mails de notification par Resend (https://resend.com/docs/api-reference/emails/send-batch-emails).
 * Serveur uniquement. Variables d'environnement Vercel :
 *   - RESEND_API_KEY : clé API Resend (Resend > API Keys, droit « Sending access »).
 *   - EMAIL_FROM (facultatif) : expéditeur, sur le domaine vérifié dans Resend.
 *   - NEXT_PUBLIC_SITE_URL (facultatif) : adresse du site, pour les liens des e-mails.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.velopronos.fr").replace(/\/$/, "");
const DEFAULT_FROM = "VéloPronos <notifications@velopronos.fr>";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Lien de désabonnement en un clic (en-têtes List-Unsubscribe exigés par Gmail et Yahoo). */
  unsubscribeUrl: string;
}

export interface EmailReport {
  sent: number;
  failed: number;
  /** Adresses effectivement acceptées par Resend. */
  delivered: Set<string>;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

const BATCH_SIZE = 100; // maximum de l'API batch de Resend

export async function sendEmails(emails: OutgoingEmail[]): Promise<EmailReport> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY manquante (variables d'environnement Vercel).");
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const report: EmailReport = { sent: 0, failed: 0, delivered: new Set() };

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        batch.map((email) => ({
          from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: {
            "List-Unsubscribe": `<${oneClickUrl(email.unsubscribeUrl)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }))
      ),
    });
    if (response.ok) {
      report.sent += batch.length;
      batch.forEach((email) => report.delivered.add(email.to));
    } else {
      report.failed += batch.length;
      const body = await response.text().catch(() => "");
      console.error(`Resend : envoi refusé (${response.status}) ${body.slice(0, 300)}`);
    }
  }
  return report;
}

export function unsubscribeUrl(token: string, kind: string, locale: string): string {
  return `${SITE_URL}/${locale}/desabonnement?t=${encodeURIComponent(token)}&k=${encodeURIComponent(kind)}`;
}

/** Même désabonnement, version « un clic » (POST de la messagerie, sans page à afficher). */
export function oneClickUrl(pageUrl: string): string {
  const params = new URL(pageUrl).searchParams;
  return `${SITE_URL}/api/notifications/unsubscribe?t=${encodeURIComponent(params.get("t") ?? "")}&k=${encodeURIComponent(params.get("k") ?? "")}`;
}

/** Lien du bouton d'un e-mail vers une page du site, dans la langue du joueur. */
export function siteUrl(path: string, locale: string): string {
  return `${SITE_URL}/${locale}${path === "/" ? "" : path}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface EmailLayout {
  title: string;
  /** Paragraphes ou lignes de tableau déjà échappés (HTML). */
  bodyHtml: string;
  /** Mêmes informations en texte brut. */
  bodyText: string;
  button: { label: string; url: string };
  footer: string;
  unsubscribeLabel: string;
  unsubscribeUrl: string;
  manageLabel: string;
  manageUrl: string;
}

/** Gabarit commun, aux couleurs des e-mails de connexion (fond nuit, carte, liseré or). */
export function renderEmail(layout: EmailLayout): { html: string; text: string } {
  const html = `<div style="background:#1C140F;padding:24px;font-family:Arial,sans-serif;text-align:center"><div style="max-width:440px;margin:auto;background:#2B2018;border-radius:18px;padding:24px;border-bottom:6px solid #F2C94C;text-align:left"><div style="text-align:center"><b style="font-size:22px;color:#F6EEDC">Vélo<span style="color:#F5D33A">Pronos</span></b></div><h2 style="margin:18px 0 10px;color:#ffffff;font-size:19px">${escapeHtml(
    layout.title
  )}</h2><div style="color:#E3D6BE;font-size:15px;line-height:1.5">${layout.bodyHtml}</div><div style="text-align:center;margin:22px 0 4px"><a href="${escapeHtml(
    layout.button.url
  )}" style="display:inline-block;background:#F5D33A;color:#1C140F;font-weight:bold;text-decoration:none;border-radius:12px;padding:12px 22px">${escapeHtml(
    layout.button.label
  )}</a></div></div><p style="max-width:440px;margin:16px auto 0;color:#B8A88F;font-size:12px;line-height:1.5">${escapeHtml(
    layout.footer
  )}<br><a href="${escapeHtml(layout.manageUrl)}" style="color:#B8A88F">${escapeHtml(layout.manageLabel)}</a> · <a href="${escapeHtml(
    layout.unsubscribeUrl
  )}" style="color:#B8A88F">${escapeHtml(layout.unsubscribeLabel)}</a></p></div>`;
  const text = `${layout.title}\n\n${layout.bodyText}\n\n${layout.button.label} : ${layout.button.url}\n\n${layout.footer}\n${layout.manageLabel} : ${layout.manageUrl}\n${layout.unsubscribeLabel} : ${layout.unsubscribeUrl}`;
  return { html, text };
}
