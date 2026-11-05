import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createAdminClient, getAuthUser } from "@/lib/supabase/server";
import { ArrowLeftIcon } from "@/components/icons";
import { conversation, markRead } from "@/lib/supportMessages";
import { MessageComposer } from "./MessageComposer";

export const dynamic = "force-dynamic";

/**
 * « Suggérer une modification » : conversation du joueur avec l'équipe Biathlonpronos, reprise de
 * VéloPronos. Les réponses s'écrivent depuis /admin/messages. Ouvrir la page marque les réponses
 * comme lues (la pastille du profil disparaît).
 */
export default async function SupportMessagesPage() {
  const t = await getTranslations("SupportMessages");
  const locale = await getLocale();
  const {
    data: { user },
  } = await getAuthUser();

  if (!user || user.is_anonymous) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-6">
        <TitleBar title={t("title")} />
        <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">{t("loginRequired")}</div>
      </div>
    );
  }

  const admin = createAdminClient();
  const messages = await conversation(admin, user.id);
  if (messages.some((m) => m.from_admin && !m.read_at)) await markRead(admin, user.id, "player");

  const format = new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-bg px-5 pb-3 pt-6">
        <TitleBar title={t("title")} />
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 py-5">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-[13px] leading-relaxed text-text-dim">
            <div className="font-display text-sm font-bold text-frost">✏️ {t("emptyTitle")}</div>
            <p>{t("emptyBody")}</p>
          </div>
        ) : (
          messages.map((m) =>
            m.from_admin ? (
              <div key={m.id} className="mr-10 self-start rounded-2xl bg-card2 px-4 py-3">
                <div className="font-display text-[12px] font-bold text-ice">VéloPronos</div>
                <p className="whitespace-pre-wrap break-words text-[14px] text-frost">{m.body}</p>
                <div className="mt-1 text-right text-[11px] text-text-dim">{format.format(new Date(m.created_at))}</div>
              </div>
            ) : (
              <div key={m.id} className="ml-10 self-end rounded-2xl bg-ice px-4 py-3 text-on-ice">
                <p className="whitespace-pre-wrap break-words text-[14px]">{m.body}</p>
                <div className="mt-1 text-right text-[11px] opacity-70">{format.format(new Date(m.created_at))}</div>
              </div>
            )
          )
        )}
      </div>

      <MessageComposer hasMessages={messages.length > 0} />
    </div>
  );
}

function TitleBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <Link
        href="/compte"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card text-text-dim"
      >
        <ArrowLeftIcon className="h-4 w-4" />
      </Link>
      <div className="font-display text-lg font-bold">{title}</div>
    </div>
  );
}
