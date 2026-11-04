-- VéloPronos — valeurs vélo des types existants (04/11/2026).
-- À exécuter SEULE, avant 0045 : Postgres refuse d'utiliser une valeur d'enum ajoutée dans la
-- même transaction.
--
-- Correspondance des tables (on garde les noms hérités de Biathlonpronos) :
--   stages = courses vélo (Tour de France, Strade Bianche…), races = étapes vélo,
--   athletes = coureurs. Une classique est une course à une seule étape.
--
-- Le type d'étape se range dans races.format, et la cote correspondante dans odds.format :
-- « sprint » existe déjà, on ajoute montagne, clm, baroudeurs et clm_equipes.

alter type race_format add value if not exists 'montagne';
alter type race_format add value if not exists 'clm';
alter type race_format add value if not exists 'baroudeurs';
alter type race_format add value if not exists 'clm_equipes';

alter type odds_format add value if not exists 'montagne';
alter type odds_format add value if not exists 'clm';
alter type odds_format add value if not exists 'baroudeurs';
alter type odds_format add value if not exists 'clm_equipes';

-- Cotes des pronostics maillots, propres à chaque course.
alter type odds_format add value if not exists 'maillot_general';
alter type odds_format add value if not exists 'maillot_points';
alter type odds_format add value if not exists 'maillot_montagne';
alter type odds_format add value if not exists 'maillot_jeune';
alter type odds_format add value if not exists 'super_combatif';
alter type odds_format add value if not exists 'meilleure_equipe';
