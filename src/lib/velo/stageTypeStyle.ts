/**
 * Code couleur des types d'étape (demande de Guillaume du 08/11/2026), repris des codes que tout le
 * monde connaît : sprint vert (maillot vert), montagne blanc à pois rouges, contre-la-montre en
 * tons de jaune, baroudeurs bleu ; classique en orange brique (pavés).
 */
export const STAGE_TYPE_SWATCH: Record<string, string> = {
  sprint: "#2E9E44",
  montagne: "repeating-radial-gradient(circle at 30% 30%, #D62828 0 2px, #FFFFFF 2px 5px)",
  baroudeurs: "#2F6FDB",
  clm: "#F5C400",
  clm_equipes: "#E0A100",
  classique: "#C2571A",
};

/** Fond CSS de la pastille du type d'étape (gris si type inconnu). */
export function stageTypeSwatch(format: string): string {
  return STAGE_TYPE_SWATCH[format] ?? "#8A8F98";
}
