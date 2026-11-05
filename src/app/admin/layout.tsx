import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/AdminNav";
import { SimulatedClockBanner } from "@/components/SimulatedClockBanner";
import "../globals.css";

export const metadata: Metadata = { title: "VéloPronos — Admin" };

/**
 * Back-office : réservé aux profils avec is_admin = true. Hors du routing
 * i18n (`middleware.ts`) — outil interne, jamais traduit.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/fr/sign-in");

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/fr");

  return (
    <html lang="fr">
      <body className="bg-bg text-text">
        <SimulatedClockBanner />
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <AdminNav />
          {children}
        </div>
      </body>
    </html>
  );
}
