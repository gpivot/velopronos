/**
 * Pseudo jamais choisi par le joueur : celui que la base donne à la création du compte (migrations
 * 0004 / 0031) quand aucun pseudo n'est fourni, c'est-à-dire la partie de l'e-mail avant « @ »
 * (inscription par e-mail, Google, Apple et son adresse relais), ou « Invité ».
 *
 * À confirmer : pas de colonne « pseudo choisi » en base, on compare donc au pseudo par défaut.
 * Un joueur qui aurait choisi exactement le début de son e-mail reverrait l'encart.
 */
export function isAutoPseudo(pseudo: string, email: string | null | undefined): boolean {
  const value = pseudo.trim();
  if (!value || value === "Invité") return true;
  const local = (email ?? "").split("@")[0];
  return local !== "" && value === local;
}
