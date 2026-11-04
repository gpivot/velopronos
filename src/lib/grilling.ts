// Coureur grillé (VéloPronos, repris de Biathlonpronos, commit 91420f9) : les coureurs choisis sur une
// course sont grillés pour la course suivante de la même étape (et seulement celle-là).
// En vélo, la règle ne joue qu'à l'intérieur d'une course par étapes (décision de Guillaume du
// 01/11/2026) ; l'adaptation au modèle saison → course → étape reste à faire.

import { RELAY_FORMATS } from "./raceFormats";

export { RELAY_FORMATS };

export interface StageRace {
  id: string;
  format: string;
  sex: string | null;
  locks_at: string;
}

/**
 * Course individuelle précédente de la même étape, pour le même sexe, dont les
 * choix grillent ceux de `race`. Les relais et les courses de l'autre sexe sont
 * ignorés. `null` pour la première course de l'étape.
 */
export function previousRaceForGrilling(race: StageRace, stageRaces: StageRace[]): StageRace | null {
  const raceTime = new Date(race.locks_at).getTime();
  const candidates = stageRaces
    .filter(
      (r) =>
        r.id !== race.id &&
        !RELAY_FORMATS.includes(r.format) &&
        r.sex === race.sex &&
        new Date(r.locks_at).getTime() < raceTime
    )
    .sort((a, b) => new Date(b.locks_at).getTime() - new Date(a.locks_at).getTime());
  return candidates[0] ?? null;
}
