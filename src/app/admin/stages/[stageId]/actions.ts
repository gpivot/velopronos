"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { JERSEY_TYPES, type JerseyType } from "@/lib/velo/courses";
import { saveJerseyResults } from "@/lib/velo/jerseyScoring";

/** Podium final d'un maillot de la course, puis points des joueurs sur ce maillot. */
export async function submitJerseyResults(formData: FormData) {
  await requireAdmin();
  const stageId = String(formData.get("stage_id"));
  const jersey = String(formData.get("jersey")) as JerseyType;
  if (!JERSEY_TYPES.includes(jersey)) throw new Error("Maillot inconnu.");
  const podium = [1, 2, 3].map((rank) => String(formData.get(`rank_${rank}`) ?? "") || null);
  const picked = podium.filter(Boolean);
  if (new Set(picked).size !== picked.length) throw new Error("Le même coureur (ou la même équipe) apparaît deux fois sur le podium.");
  await saveJerseyResults(createAdminClient(), stageId, jersey, podium);
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
}
