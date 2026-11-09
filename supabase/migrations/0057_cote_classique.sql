-- VéloPronos : type d'étape et cote « Classique » (demande de Guillaume du 07/11/2026), pour les
-- classiques comme Milan-San Remo, le Tour des Flandres, Paris-Roubaix ou la Flèche Wallonne.
-- À exécuter SEULE : Postgres refuse d'utiliser une valeur d'enum ajoutée dans la même transaction.
--
-- Aucune table nouvelle : la liste des coureurs de la saison range ses cotes par profil dans odds
-- avec stage_id null (possible depuis 0045) ; chaque course les recopie pour ses engagés.

alter type race_format add value if not exists 'classique';
alter type odds_format add value if not exists 'classique';
