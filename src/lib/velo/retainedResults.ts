import type { CourseKind } from "./courses";

/**
 * Résultats retenus du classement général de saison (règle base44) : tous les Grands Tours et
 * événements bonus, les 2 meilleures courses par étapes et les 8 meilleures classiques. Une
 * course compte pour la somme de ses lignes (étapes et maillots). Les lignes sans course (questions
 * bonus, ancien barème de saison) comptent toujours.
 */
export const RETAINED_STAGE_RACES = 2;
export const RETAINED_ONE_DAY = 8;

export interface LedgerLine {
  /** Course (stages.id) de la ligne, null si la ligne n'est rattachée à aucune course. */
  courseId: string | null;
  points: number;
}

export interface RetainedTotal {
  points: number;
  /** Courses écartées du total (hors des meilleures retenues). */
  droppedCourseIds: string[];
}

export function retainedTotal(lines: LedgerLine[], kindByCourseId: Map<string, CourseKind>): RetainedTotal {
  let points = 0;
  const byCourse = new Map<string, number>();
  for (const line of lines) {
    if (!line.courseId) points += line.points;
    else byCourse.set(line.courseId, (byCourse.get(line.courseId) ?? 0) + line.points);
  }

  const capped: Record<"stage_race" | "one_day", Array<[string, number]>> = { stage_race: [], one_day: [] };
  for (const [courseId, total] of Array.from(byCourse)) {
    const kind = kindByCourseId.get(courseId);
    if (kind === "stage_race" || kind === "one_day") capped[kind].push([courseId, total]);
    else points += total;
  }

  const droppedCourseIds: string[] = [];
  for (const [kind, limit] of [["stage_race", RETAINED_STAGE_RACES], ["one_day", RETAINED_ONE_DAY]] as const) {
    const sorted = capped[kind].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    sorted.forEach(([courseId, total], i) => {
      if (i < limit) points += total;
      else droppedCourseIds.push(courseId);
    });
  }

  return { points: Math.round(points * 10) / 10, droppedCourseIds };
}
