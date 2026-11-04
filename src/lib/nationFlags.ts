// Codes nations en base = alpha-3 (style IOC, ex. "FRA"). Les drapeaux emoji
// se construisent à partir de l'alpha-2 ISO 3166-1 — table couvrant les
// nations habituelles de la Coupe du monde de biathlon.
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  FRA: "FR", NOR: "NO", ITA: "IT", GER: "DE", SWE: "SE", FIN: "FI",
  AUT: "AT", CZE: "CZ", USA: "US", CAN: "CA", SUI: "CH", POL: "PL",
  SLO: "SI", UKR: "UA", EST: "EE", LAT: "LV", BUL: "BG", JPN: "JP",
  KOR: "KR", CHN: "CN", KAZ: "KZ", BLR: "BY", SVK: "SK", BEL: "BE",
  GBR: "GB", NED: "NL", ROU: "RO", HUN: "HU", RUS: "RU",
  MDA: "MD", LTU: "LT", CRO: "HR", GRL: "GL", AUS: "AU", DEN: "DK", GRE: "GR", BRA: "BR",
  // Nations du cyclisme (VéloPronos)
  ESP: "ES", POR: "PT", COL: "CO", ECU: "EC", ERI: "ER", IRL: "IE", LUX: "LU", NZL: "NZ",
  RSA: "ZA", MEX: "MX", ARG: "AR", URU: "UY", ISR: "IL", TUR: "TR", SRB: "RS", MON: "MC",
  AND: "AD", VEN: "VE", CRC: "CR", ETH: "ET", RWA: "RW", UAE: "AE",
};

export function nationFlagEmoji(nationCode: string | null | undefined): string {
  const alpha2 = nationCode ? ALPHA3_TO_ALPHA2[nationCode] : undefined;
  if (!alpha2) return "🏳️";
  const codePoints = alpha2.split("").map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

const ALPHA2_TO_ALPHA3: Record<string, string> = Object.fromEntries(
  Object.entries(ALPHA3_TO_ALPHA2).map(([a3, a2]) => [a2, a3])
);

/** Code nation alpha-3 en base → code pays alpha-2 (ex. export du calendrier). */
export function alpha3ToAlpha2(alpha3Code: string): string | undefined {
  return ALPHA3_TO_ALPHA2[alpha3Code.toUpperCase()];
}

/** Code pays alpha-2 (ex. import calendrier) → code nation alpha-3 (style IOC) utilisé en base. */
export function alpha2ToAlpha3(alpha2Code: string): string | undefined {
  return ALPHA2_TO_ALPHA3[alpha2Code.toUpperCase()];
}

/** Noms utilisés pour créer une nation absente de la table lors d'un import. */
export const NATION_NAMES: Record<string, string> = {
  FRA: "France", NOR: "Norvège", ITA: "Italie", GER: "Allemagne", SWE: "Suède", FIN: "Finlande",
  AUT: "Autriche", CZE: "Tchéquie", USA: "États-Unis", CAN: "Canada", SUI: "Suisse", POL: "Pologne",
  SLO: "Slovénie", UKR: "Ukraine", EST: "Estonie", LAT: "Lettonie", BUL: "Bulgarie", JPN: "Japon",
  KOR: "Corée du Sud", CHN: "Chine", KAZ: "Kazakhstan", BLR: "Biélorussie", SVK: "Slovaquie",
  BEL: "Belgique", GBR: "Royaume-Uni", NED: "Pays-Bas", ROU: "Roumanie", HUN: "Hongrie", RUS: "Russie",
  MDA: "Moldavie", LTU: "Lituanie", CRO: "Croatie", GRL: "Groenland", AUS: "Australie", DEN: "Danemark",
  GRE: "Grèce", BRA: "Brésil",
  ESP: "Espagne", POR: "Portugal", COL: "Colombie", ECU: "Équateur", ERI: "Érythrée", IRL: "Irlande",
  LUX: "Luxembourg", NZL: "Nouvelle-Zélande", RSA: "Afrique du Sud", MEX: "Mexique", ARG: "Argentine",
  URU: "Uruguay", ISR: "Israël", TUR: "Turquie", SRB: "Serbie", MON: "Monaco", AND: "Andorre",
  VEN: "Venezuela", CRC: "Costa Rica", ETH: "Éthiopie", RWA: "Rwanda", UAE: "Émirats arabes unis",
};

/** Codes de l'ancienne app base44 ou ISO qui diffèrent du code IOC utilisé en base. */
const NATION_CODE_ALIASES: Record<string, string> = { ALL: "GER", DEU: "GER", MCO: "MON", PRT: "POR", NLD: "NED", CHE: "SUI", SVN: "SLO", DNK: "DEN", ZAF: "RSA", HRV: "CRO" };

/**
 * Code pays d'un fichier d'import (alpha-2 ou alpha-3, IOC ou ISO, ou ancien code base44) →
 * code alpha-3 IOC utilisé en base. `undefined` si vide ; inconnu : renvoyé en majuscules.
 */
export function normalizeNationCode(code: string | undefined): string | undefined {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return undefined;
  if (c.length === 2) return ALPHA2_TO_ALPHA3[c];
  return NATION_CODE_ALIASES[c] ?? c;
}
