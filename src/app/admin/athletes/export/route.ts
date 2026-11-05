import { createAdminClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/admin/fetchAll";
import { normalizeLabel, toCsv } from "@/lib/admin/csv";
import { COURSE_RIDERS_HEADERS, RIDER_ODDS_COLUMNS } from "@/lib/velo/imports";
import { adminCsvResponse } from "../../_components/csvResponse";

export const dynamic = "force-dynamic";

/** Coureurs et cotes d'une course, au format du fichier d'import (réimportable tel quel). */
export function GET(request: Request) {
  return adminCsvResponse(async () => {
    const courseId = new URL(request.url).searchParams.get("course") ?? "";
    const admin = createAdminClient();
    const { data: course } = await admin.from("stages").select("id, name, location").eq("id", courseId).maybeSingle();
    if (!course) return { filename: "coureurs.csv", csv: toCsv(COURSE_RIDERS_HEADERS, []) };

    const [{ data: entries }, odds] = await Promise.all([
      admin
        .from("stage_riders")
        .select("bib, abandoned_race_id, athletes(id, first_name, last_name, nation_code, teams(code, name))")
        .eq("stage_id", course.id),
      fetchAll((from, to) =>
        admin.from("odds").select("athlete_id, format, value").eq("stage_id", course.id).is("valid_until", null).not("athlete_id", "is", null).order("id").range(from, to)
      ),
    ]);
    const oddsByAthlete = new Map<string, Record<string, number>>();
    for (const o of odds) oddsByAthlete.set(o.athlete_id, { ...oddsByAthlete.get(o.athlete_id), [o.format]: o.value });

    const rows = (entries ?? [])
      .map((e: any) => ({ ...e, athlete: e.athletes }))
      .filter((e) => e.athlete)
      .sort((a, b) => (a.bib ?? 9999) - (b.bib ?? 9999))
      .map((e) => {
        const o = oddsByAthlete.get(e.athlete.id) ?? {};
        return [
          e.bib,
          e.athlete.first_name,
          e.athlete.last_name,
          e.athlete.teams?.code ?? "",
          e.athlete.teams?.name ?? "",
          e.athlete.nation_code,
          e.abandoned_race_id ? "abandoned" : "active",
          ...RIDER_ODDS_COLUMNS.map(([, format]) => o[format]),
        ];
      });
    const slug = normalizeLabel(course.name ?? course.location).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return { filename: `coureurs-${slug || "course"}.csv`, csv: toCsv(COURSE_RIDERS_HEADERS, rows) };
  });
}
