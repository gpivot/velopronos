import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { updateStage } from "../../calendrier/actions";
import { STAGE_CATEGORY_OPTIONS, stageCategoryFormValue } from "@/lib/stageCategory";
import {
  COURSE_CATEGORIES,
  COURSE_CATEGORY_LABELS,
  COURSE_KIND_LABELS,
  COURSE_KINDS,
  JERSEY_LABELS,
  JERSEY_TYPES,
} from "@/lib/velo/courses";

const inputClass = "rounded border border-border bg-bg px-2 py-1.5 text-sm";

export const dynamic = "force-dynamic";

/** Modification des infos d'une course (nom, pays, dates, coefficient, type, maillots). */
export default async function AdminStagePage({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  const admin = createAdminClient();

  const [{ data: stage }, { data: nations }] = await Promise.all([
    admin.from("stages").select("*, races(id, status)").eq("id", stageId).single(),
    admin.from("nations").select("*").order("name"),
  ]);
  if (!stage) notFound();

  const hasFinishedRace = ((stage.races ?? []) as { status: string }[]).some((r) => r.status === "finished");

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-sm text-text-dim underline">
        Retour au calendrier
      </Link>
      <h1 className="text-xl font-bold">
        {nationFlagEmoji(stage.country_code)} {stage.name ?? stage.location}
      </h1>

      <form action={updateStage} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">Infos de la course</div>
        <input type="hidden" name="stage_id" value={stage.id} />
        <div className="flex flex-wrap gap-2">
          <input
            name="location"
            required
            defaultValue={stage.name ?? stage.location}
            placeholder="Nom (ex. Paris-Nice)"
            className={inputClass}
          />
          <select name="country_code" required defaultValue={stage.country_code} className={inputClass}>
            {(nations ?? []).map((n) => (
              <option key={n.code} value={n.code}>
                {n.name} ({n.code})
              </option>
            ))}
          </select>
          <input name="starts_on" type="date" required defaultValue={stage.starts_on} title="Début" className={inputClass} />
          <input name="ends_on" type="date" required defaultValue={stage.ends_on} title="Fin" className={inputClass} />
          <select name="coefficient" defaultValue={stageCategoryFormValue(stage)} className={inputClass}>
            {STAGE_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select name="kind" defaultValue={stage.kind ?? "one_day"} className={inputClass}>
            {COURSE_KINDS.map((k) => (
              <option key={k} value={k}>
                {COURSE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <select name="category" defaultValue={stage.category ?? ""} className={inputClass}>
            <option value="">Catégorie —</option>
            {COURSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {COURSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-text-dim">
            Maillot de leader
            <input name="jersey_color" type="color" defaultValue={stage.jersey_color ?? "#FFD200"} className="h-8 w-10 rounded border border-border bg-bg" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-dim">
          Maillots pronostiqués :
          {JERSEY_TYPES.map((j) => (
            <label key={j} className="flex items-center gap-1">
              <input type="checkbox" name="jerseys" value={j} defaultChecked={(stage.jerseys ?? []).includes(j)} />
              {JERSEY_LABELS[j]}
            </label>
          ))}
        </div>
        <div>
          <button type="submit" className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
            Enregistrer
          </button>
        </div>
        <p className="text-xs text-text-dim">
          Les horaires des étapes se modifient avec le crayon de chaque étape. « Autre (×0) » : courses
          de test, notées normalement mais hors classement de la saison (pas de carte bonus, de ×2 ni de
          série).
          {hasFinishedRace &&
            " Attention : des étapes de cette course sont déjà notées ; un passage ×1 / ×2 ne recalcule pas leurs points tant que leurs résultats ne sont pas réenregistrés (le passage en ×0 ou hors de ×0 s’applique tout de suite au classement)."}
        </p>
      </form>
    </div>
  );
}
