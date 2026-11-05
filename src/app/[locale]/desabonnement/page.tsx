import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { isEmailKind } from "@/lib/notifications/preferences";
import { isValidUnsubscribeToken } from "@/lib/notifications/unsubscribe";
import { confirmUnsubscribe } from "./actions";

export const dynamic = "force-dynamic";

// Page du lien « Ne plus recevoir ces e-mails » : accessible sans connexion grâce au jeton
// personnel du joueur. Le désabonnement demande un clic de confirmation, pour qu'un antivirus
// qui ouvre les liens des e-mails ne désabonne personne à sa place.
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { t?: string; k?: string; done?: string };
}) {
  const t = await getTranslations("Unsubscribe");
  const token = searchParams.t ?? null;
  const kind = searchParams.k ?? null;
  const valid = isEmailKind(kind) && (await isValidUnsubscribeToken(createAdminClient(), token));
  const kindLabel = isEmailKind(kind) ? t(`kind_${kind}`) : "";

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-5 py-10 text-center">
      <div className="font-display text-xl font-extrabold">
        Vélo<span className="text-ice">Pronos</span>
      </div>
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="font-display text-lg font-bold">{t("title")}</div>
        {!valid ? (
          <p className="text-[14px] text-text-dim">{t("invalid")}</p>
        ) : searchParams.done ? (
          <>
            <p className="text-[14px]">{t("done", { kind: kindLabel })}</p>
            <p className="text-[12px] text-text-dim">{t("manageHint")}</p>
          </>
        ) : (
          <form action={confirmUnsubscribe} className="flex flex-col gap-3">
            <input type="hidden" name="t" value={token ?? ""} />
            <input type="hidden" name="k" value={kind ?? ""} />
            <p className="text-[14px]">{t("question", { kind: kindLabel })}</p>
            <button type="submit" className="rounded-xl bg-ice py-3 font-display text-sm font-bold text-on-ice">
              {t("confirm")}
            </button>
          </form>
        )}
      </div>
      <Link href="/compte" className="text-[13px] text-text-dim underline hover:text-frost">
        {t("toProfile")}
      </Link>
    </div>
  );
}
