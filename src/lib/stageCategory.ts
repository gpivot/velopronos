/**
 * Catégorie d'une étape (Guillaume, 04/11/2026) :
 * - « Coupe du Monde (×1) » : coefficient 1, compte au classement de la saison ;
 * - « Mondiaux / JO (×2) » : coefficient 2, compte double ;
 * - « Autre (×0) », hors classement : courses tests, bonus ou de recrutement. Elles se
 *   pronostiquent et se notent normalement (×1) et ont leur propre classement, mais leurs points
 *   ne s'ajoutent pas à la saison (`stages.counts_in_standings = false`, migration 0041).
 *
 * Générique : le même découpage (coefficient + drapeau « compte au classement ») est prévu pour
 * VéloPronos (voir docs/architecture-technique.md).
 */
export type StageCategory = "world_cup" | "championship" | "off_standings";

export interface StageCategoryFields {
  coefficient: 1 | 2;
  counts_in_standings: boolean;
}

/** Valeur du menu déroulant de l'admin : le multiplicateur affiché (1, 2, 0). */
export const STAGE_CATEGORY_OPTIONS: { value: "1" | "2" | "0"; label: string }[] = [
  { value: "1", label: "Normale (×1)" },
  { value: "2", label: "Monument / Mondiaux (×2)" },
  { value: "0", label: "Autre (×0, hors classement)" },
];

export function stageCategory(stage: { coefficient?: number | null; counts_in_standings?: boolean | null }): StageCategory {
  if (stage.counts_in_standings === false) return "off_standings";
  return stage.coefficient === 2 ? "championship" : "world_cup";
}

export function isOffStandingsStage(stage: { counts_in_standings?: boolean | null } | null | undefined): boolean {
  return stage?.counts_in_standings === false;
}

/** Valeur du menu déroulant pour une étape existante. */
export function stageCategoryFormValue(stage: { coefficient?: number | null; counts_in_standings?: boolean | null }): "1" | "2" | "0" {
  const category = stageCategory(stage);
  return category === "off_standings" ? "0" : category === "championship" ? "2" : "1";
}

/** Colonnes à écrire en base pour la valeur choisie dans le menu (« 1 », « 2 » ou « 0 »). */
export function stageCategoryFields(value: unknown): StageCategoryFields {
  const v = String(value);
  if (v === "0") return { coefficient: 1, counts_in_standings: false };
  if (v === "2") return { coefficient: 2, counts_in_standings: true };
  return { coefficient: 1, counts_in_standings: true };
}
