-- VéloPronos : l'étape unique d'une classique n'a pas de numéro (affichée « Baroudeurs », pas
-- « Étape 1 · Baroudeurs »). Données seulement, sans risque : à coller dans l'éditeur SQL.
update races set stage_number = null
where stage_number = 1
  and stage_id in (select id from stages where kind = 'one_day');
