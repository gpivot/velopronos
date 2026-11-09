import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runStartlistSync } from "@/lib/velo/startlistSync";

export const dynamic = "force-dynamic";
// Une recherche web de l'IA prend une à trois minutes.
export const maxDuration = 300;

/**
 * Startlists par IA (docs/velopronos/schema-velo.md) : appelé par Supabase (pg_cron + pg_net)
 * toutes les 10 minutes autour de 7 h et 17 h, heure de Paris ; ne fait rien aux autres heures.
 * Protégé par le même secret CRON_SECRET que les notifications.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, report: await runStartlistSync(createAdminClient(), new Date()) });
  } catch (error) {
    return NextResponse.json({ ok: false, report: error instanceof Error ? error.message : "Erreur inconnue" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
