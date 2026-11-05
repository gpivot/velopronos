import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { conversation, markRead } from "@/lib/supportMessages";
import { ReplyForm } from "./ReplyForm";

export const dynamic = "force-dynamic";

/** Conversation avec un joueur : ses messages à gauche, les réponses de l'équipe à droite. */
export default async function AdminConversationPage({ params }: { params: { userId: string } }) {
  const admin = createAdminClient();
  const [{ data: profile }, messages, { data: authUser }] = await Promise.all([
    admin.from("profiles").select("id, pseudo").eq("id", params.userId).maybeSingle(),
    conversation(admin, params.userId),
    admin.auth.admin.getUserById(params.userId),
  ]);
  if (!profile) notFound();
  if (messages.some((m) => !m.from_admin && !m.read_at)) await markRead(admin, params.userId, "admin");

  const format = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/admin/messages" className="text-sm text-text-dim hover:text-ice">
        ← Tous les messages
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold">Conversation avec {profile.pseudo}</h1>
        {authUser?.user?.email && <p className="text-sm text-text-dim">{authUser.user.email}</p>}
      </div>

      <div className="flex flex-col gap-3">
        {messages.length === 0 && <p className="text-sm text-text-dim">Pas encore de message.</p>}
        {messages.map((m) =>
          m.from_admin ? (
            <div key={m.id} className="ml-16 self-end rounded-2xl bg-ice px-4 py-3 text-on-ice">
              <div className="font-display text-[12px] font-bold">VéloPronos</div>
              <p className="whitespace-pre-wrap break-words text-[14px]">{m.body}</p>
              <div className="mt-1 text-right text-[11px] opacity-70">
                {format.format(new Date(m.created_at))} · {m.read_at ? "lu" : "pas encore lu"}
              </div>
            </div>
          ) : (
            <div key={m.id} className="mr-16 self-start rounded-2xl bg-card2 px-4 py-3">
              <div className="font-display text-[12px] font-bold text-ice">{profile.pseudo}</div>
              <p className="whitespace-pre-wrap break-words text-[14px] text-frost">{m.body}</p>
              <div className="mt-1 text-right text-[11px] text-text-dim">{format.format(new Date(m.created_at))}</div>
            </div>
          )
        )}
      </div>

      <ReplyForm userId={profile.id} />
    </div>
  );
}
